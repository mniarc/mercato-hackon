import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService, type PublicationPreparationResult } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema, clientSubmissionRequestSchema } from '../contracts/clientSubmission'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })

export function createPublicationPreparationHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<PublicationPreparationResult> => {
    const { workflowInstance } = contextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, { ...scope, workflowInstanceId: workflowInstance.id, deletedAt: null }, undefined, scope)
    if (!submission) throw new Error('[internal] Publication preparation submission is outside the originating workflow')
    const sourceWorkflow = await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId, deletedAt: null }, undefined, scope)
    const saved = z.object({ result: clientSubmissionDispositionSchema }).parse(sourceWorkflow?.context?.clientTriageResult).result
    if (!saved.effectsApplied || saved.kind !== 'approve' || saved.acceptance.status !== 'post_accepted') {
      throw new Error('[internal] Publication preparation requires persisted post-content acceptance')
    }
    const receipt = saved.acceptance
    const accepted = receipt.record
    const original = clientSubmissionRequestSchema.parse(submission.original)
    const response = original.postReviewResponse
    if (!response || response.kind !== 'approval' || response.approveContent !== true || original.eventId !== submission.eventId
      || original.documentVersionReference !== response.post.versionId || saved.targets.documentVersionReference !== response.post.versionId
      || saved.targets.caseId !== submission.caseId || saved.targets.submissionId !== submission.id || receipt.orderRef !== submission.caseId
      || accepted.person !== submission.submittedByCustomerUserId || accepted.documentId !== response.post.documentId
      || accepted.documentVersionId !== response.post.versionId || accepted.source.submissionId !== submission.id
      || accepted.source.eventId !== submission.eventId || accepted.source.workflowInstanceId !== workflowInstance.id
      || accepted.source.invitationTaskId !== response.taskId) {
      throw new Error('[internal] Post acceptance does not belong to the originating content decision')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Publication preparation case is outside the submission scope')
    const userId = await resolveWorkflowPrincipalUserId(em, sourceWorkflow!)
    if (!userId) throw new Error('[internal] Publication preparation requires the native workflow execution principal')
    return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).preparePublication({
      context: { ...scope, userId },
      request: { orderRef: agencyCase.id, postVersionId: accepted.documentVersionId, acceptanceSubmissionId: accepted.source.submissionId },
    })
  }
}
