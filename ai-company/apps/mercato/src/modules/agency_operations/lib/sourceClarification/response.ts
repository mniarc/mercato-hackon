import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, StepInstance, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgencyCase } from '../../data/entities'
import { CLIENT_SUBMISSION_SERVICE, type ClientSubmissionService } from '../contracts/clientSubmission'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_WORKFLOW_ID } from '../analysisProcess/workflow'
import { analysisProcessResultSchema } from '../analysisProcess/contracts'
import { correctedWebsiteSchema, SOURCE_CLARIFICATION_STEP } from './contracts'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), workflowId: z.literal(AGENCY_ANALYSIS_WORKFLOW_ID), tenantId: z.uuid(), organizationId: z.uuid(),
}) })

export function createSourceClarificationResponseActivity(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const { workflowInstance } = contextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const workflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: workflowInstance.id, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, deletedAt: null,
    }, undefined, scope)
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, workflowInstanceId: workflowInstance.id, deletedAt: null }, undefined, scope)
    const result = z.object({ result: analysisProcessResultSchema }).safeParse(workflow?.context[AGENCY_ANALYSIS_RESULT_KEY])
    if (!workflow || !agencyCase || !result.success || result.data.result.caseId !== agencyCase.id || !result.data.result.sourceClarification) {
      throw new Error('[internal] Source response is outside the saved analysis clarification')
    }
    const step = await findOneWithDecryption(em, StepInstance, {
      ...scope, workflowInstanceId: workflow.id, stepId: SOURCE_CLARIFICATION_STEP,
    }, { orderBy: { enteredAt: 'desc' } }, scope)
    const task = step ? await findOneWithDecryption(em, UserTask, {
      ...scope, workflowInstanceId: workflow.id, stepInstanceId: step.id, assigneeKind: 'customer', status: 'COMPLETED',
      assignedTo: agencyCase.submittedByCustomerUserId, completedBy: agencyCase.submittedByCustomerUserId,
    }, undefined, scope) : null
    if (!task) throw new Error('[internal] Source correction requires its assigned completed customer task')
    const answer = z.object({ sourceUrl: z.string().max(12000), sourceNote: z.string().max(2000).optional() }).parse(task.formData)
    const receipt = await container.resolve<ClientSubmissionService>(CLIENT_SUBMISSION_SERVICE).submit({
      ...scope, customerEntityId: agencyCase.customerEntityId, customerUserId: agencyCase.submittedByCustomerUserId,
    }, agencyCase.id, { eventId: `source-clarification:${task.id}`, text: [answer.sourceUrl, answer.sourceNote].filter(Boolean).join('\n') })
    const corrected = correctedWebsiteSchema.safeParse(answer.sourceUrl.trim())
    return { state: corrected.success ? 'received' as const : 'needs_correction' as const,
      taskId: task.id, submissionId: receipt.item.submissionId, websiteUrl: corrected.success ? corrected.data : null }
  }
}
