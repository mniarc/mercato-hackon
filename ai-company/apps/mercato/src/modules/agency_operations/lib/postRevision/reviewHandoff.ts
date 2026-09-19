import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { POST_REVIEW_SERVICE, type PostReviewService } from '../postReview/contracts'
import { POST_REVISION_RESULT_KEY, postRevisionActivityResultSchema, type PostRevisionReviewHandoffResult } from './contracts'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })

export function createPostRevisionReviewHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<PostRevisionReviewHandoffResult> => {
    const { workflowInstance } = contextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    const workflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    if (!submission || !workflow) throw new Error('[internal] Post revision review is outside the native submission workflow')
    const result = z.object({ result: postRevisionActivityResultSchema }).parse(workflow.context[POST_REVISION_RESULT_KEY]).result
    if (result.orderRef !== submission.caseId) throw new Error('[internal] Post revision result belongs to another case')
    const blocked = (reason: string) => ({ status: 'blocked' as const, orderRef: result.orderRef, invitation: null, reason,
      nextAction: result.status === 'not_configured' ? 'review_configuration' as const : 'inspect_saved_change' as const,
      revision: result })
    if (result.status === 'not_configured' || result.status === 'not_ready' || result.status === 'execution_incomplete') return blocked(result.reason)
    const original = clientSubmissionRequestSchema.parse(submission.original).postReviewResponse
    if (result.submissionId !== submission.id || !original || original.kind !== 'message' || result.previousPostVersionId !== original.post.versionId) {
      throw new Error('[internal] Post revision result does not belong to the original invitation response')
    }
    if (result.escalationVersionId) return blocked('research_exception')
    if (result.status === 'paused_budget') return blocked(result.status)
    if (!result.readyForReview || result.qaVerdict !== 'pass_for_draft' || !result.qaTaskRunId
      || !result.postVersionId || result.postVersionId === result.previousPostVersionId) return blocked('revised_post_not_reviewable')
    if (!result.documentVersionIds.includes(result.postVersionId) || !result.taskRunIds.includes(result.qaTaskRunId)) {
      throw new Error('[internal] Revised post and QA are not saved revision outputs')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Revised post case is outside the original customer scope')
    const review = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getPostReview(scope, agencyCase.id, result.postVersionId)
    if (!review?.isCurrent || review.simulationFlag || review.qa.state !== 'assessed'
      || review.qa.verdict !== 'pass_for_draft' || review.qa.taskRunId !== result.qaTaskRunId) return blocked('revised_post_not_reviewable')
    const userId = await resolveWorkflowPrincipalUserId(em, workflow)
    if (!userId) throw new Error('[internal] Revised post invitation requires the native workflow execution principal')
    const invitation = await container.resolve<PostReviewService>(POST_REVIEW_SERVICE).invite({
      ...scope, userId, caseId: agencyCase.id, postVersionId: result.postVersionId,
    })
    return { status: 'invited' as const, orderRef: result.orderRef, invitation, versionId: result.postVersionId }
  }
}
