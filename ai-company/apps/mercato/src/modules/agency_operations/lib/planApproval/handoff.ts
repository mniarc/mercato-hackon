import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService, type PostInstructionExecutionResult } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema, clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { POST_INSTRUCTION_STEP_ID } from './contracts'

const contextSchema = z.object({ stepInstanceId: z.uuid().optional(), workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })

export function createPostInstructionHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<PostInstructionExecutionResult> => {
    const { workflowInstance, stepInstanceId } = contextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, { ...scope, workflowInstanceId: workflowInstance.id, deletedAt: null }, undefined, scope)
    if (!submission) throw new Error('[internal] Post instruction submission is outside the originating workflow')
    const sourceWorkflow = await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId, deletedAt: null }, undefined, scope)
    const saved = z.object({ result: clientSubmissionDispositionSchema }).parse(sourceWorkflow?.context?.clientTriageResult).result
    if (!saved.effectsApplied || saved.kind !== 'approve' || saved.acceptance.status !== 'plan_accepted') {
      throw new Error('[internal] Post instruction requires a persisted plan approval and topic selection')
    }
    const receipt = saved.acceptance
    const accepted = receipt.record
    const original = clientSubmissionRequestSchema.parse(submission.original)
    const response = original.planReviewResponse
    if (!response || response.kind !== 'approval' || response.approvePlan !== true || original.eventId !== submission.eventId
      || original.documentVersionReference !== response.plan.versionId || saved.targets.documentVersionReference !== response.plan.versionId
      || saved.targets.caseId !== submission.caseId || saved.targets.submissionId !== submission.id || receipt.orderRef !== submission.caseId
      || accepted.person !== submission.submittedByCustomerUserId || accepted.documentId !== response.plan.documentId
      || accepted.documentVersionId !== response.plan.versionId || accepted.selectedTopicId !== response.selectedTopicId
      || accepted.source.submissionId !== submission.id || accepted.source.eventId !== submission.eventId
      || accepted.source.workflowInstanceId !== workflowInstance.id || accepted.source.invitationTaskId !== response.taskId) {
      throw new Error('[internal] Plan approval does not belong to the originating plan/topic selection')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Post instruction case is outside the submission scope')
    const userId = await resolveWorkflowPrincipalUserId(em, sourceWorkflow!)
    if (!userId) throw new Error('[internal] Post instruction requires the native workflow execution principal')
    return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).runPostInstruction({
      context: { ...scope, userId, workflowInstanceId: sourceWorkflow!.id, stepId: POST_INSTRUCTION_STEP_ID,
        ...(stepInstanceId ? { invocationId: stepInstanceId } : {}) },
      request: { orderRef: agencyCase.id, planVersionId: accepted.documentVersionId, selectionSubmissionId: accepted.source.submissionId },
    })
  }
}
