import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, StepInstance, type WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgencyClientSubmission, type AgencyCase } from '../../data/entities'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_WORKFLOW_ID } from '../analysisProcess/workflow'
import { analysisProcessResultSchema } from '../analysisProcess/contracts'
import { SOURCE_CLARIFICATION_STEP, SOURCE_RESPONSE_KEY, SOURCE_RESPONSE_STEP, sourceResponseSchema, type SourceCorrection } from './contracts'

export async function readCompletedSourceCorrection(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  agencyCase: AgencyCase,
  workflow: WorkflowInstance,
): Promise<SourceCorrection | null> {
  if (workflow.workflowId !== AGENCY_ANALYSIS_WORKFLOW_ID || workflow.status !== 'COMPLETED'
    || workflow.currentStepId !== SOURCE_RESPONSE_STEP || workflow.id !== agencyCase.workflowInstanceId) return null
  const source = z.object({ result: analysisProcessResultSchema }).safeParse(workflow.context[AGENCY_ANALYSIS_RESULT_KEY])
  const receipt = z.object({ result: sourceResponseSchema }).safeParse(workflow.context[SOURCE_RESPONSE_KEY])
  if (!source.success || source.data.result.caseId !== agencyCase.id || !source.data.result.sourceClarification
    || !receipt.success || receipt.data.result.state !== 'received' || !receipt.data.result.websiteUrl) return null
  const { taskId, submissionId, websiteUrl } = receipt.data.result
  const task = await findOneWithDecryption(em, UserTask, { ...scope, id: taskId, workflowInstanceId: workflow.id,
    assigneeKind: 'customer', assignedTo: agencyCase.submittedByCustomerUserId, completedBy: agencyCase.submittedByCustomerUserId, status: 'COMPLETED',
  }, undefined, scope)
  const answer = z.object({ sourceUrl: z.string(), sourceNote: z.string().optional() }).safeParse(task?.formData)
  if (!task || !answer.success || answer.data.sourceUrl.trim() !== websiteUrl) return null
  const step = await findOneWithDecryption(em, StepInstance, { ...scope, id: task.stepInstanceId,
    workflowInstanceId: workflow.id, stepId: SOURCE_CLARIFICATION_STEP, status: 'COMPLETED' }, undefined, scope)
  if (!step) return null
  const submission = await findOneWithDecryption(em, AgencyClientSubmission, { ...scope, id: submissionId,
    caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId, submittedByCustomerUserId: agencyCase.submittedByCustomerUserId,
    channel: 'portal', eventId: `source-clarification:${task.id}`, deletedAt: null,
  }, undefined, scope)
  if (!submission || submission.original.text !== [answer.data.sourceUrl, answer.data.sourceNote].filter(Boolean).join('\n')) return null
  return { workflowInstanceId: workflow.id, taskId, submissionId, websiteUrl }
}
