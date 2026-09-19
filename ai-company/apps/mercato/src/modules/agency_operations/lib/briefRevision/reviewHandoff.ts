import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { BRIEF_REVIEW_SERVICE, type BriefReviewService } from '../briefStrategyProcess/contracts'
import { BRIEF_REVISION_RESULT_KEY, briefRevisionActivityResultSchema } from './contracts'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })

export function createBriefRevisionReviewHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    const workflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: context.workflowInstance.id, workflowId: context.workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    if (!submission || !workflow) throw new Error('[internal] Brief revision review is outside the native submission workflow')
    const result = z.object({ result: briefRevisionActivityResultSchema }).parse(workflow.context[BRIEF_REVISION_RESULT_KEY]).result
    if (result.orderRef !== submission.caseId) throw new Error('[internal] Brief revision result belongs to another case')
    const blocked = (reason: string) => ({ status: 'blocked' as const, invitation: null, reason, revision: result })
    if (result.status === 'not_configured' || result.status === 'not_ready' || result.status === 'execution_incomplete') {
      return blocked(result.reason)
    }
    const original = clientSubmissionRequestSchema.parse(submission.original).reviewResponse
    if (result.orderRef !== submission.caseId || result.submissionId !== submission.id
      || !original || original.kind !== 'message' || result.previousBriefVersionId !== original.versionId) {
      throw new Error('[internal] Brief revision result does not belong to the original invitation response')
    }
    if (result.escalationVersionId) return blocked('research_exception')
    if (result.status === 'analysis_blocked' || result.status === 'paused_budget') return blocked(result.status)
    const unanswered = result.status === 'needs_client_data' && result.briefVersionId === null
    if (!unanswered && (result.status !== 'completed' || !result.briefVersionId || result.briefVersionId === result.previousBriefVersionId
      || !result.qaTaskRunId || !['ready_for_approval', 'needs_client_data'].includes(result.qaVerdict ?? '') || result.escalationVersionId)) {
      return blocked(result.qaVerdict === 'needs_agent_fix' ? result.qaVerdict : 'revised_brief_not_reviewable')
    }
    if (!unanswered && (!result.documentVersionIds.includes(result.briefVersionId!) || !result.taskRunIds.includes(result.qaTaskRunId!))) {
      throw new Error('[internal] Revised brief and QA are not saved revision outputs')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId,
      submittedByCustomerUserId: submission.submittedByCustomerUserId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Revised brief case is outside the original customer scope')
    const versionId = unanswered ? result.previousBriefVersionId : result.briefVersionId!
    const review = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getBriefReview(scope, agencyCase.id, versionId)
    if (!review?.isCurrent || review.qa.state !== 'assessed'
      || !['ready_for_approval', 'needs_client_data'].includes(review.qa.verdict)
      || (!unanswered && (review.qa.taskRunId !== result.qaTaskRunId || review.qa.verdict !== result.qaVerdict))) {
      return blocked('revised_brief_not_reviewable')
    }
    const userId = await resolveWorkflowPrincipalUserId(em, workflow)
    if (!userId) throw new Error('[internal] Revised brief invitation requires the native workflow execution principal')
    const invitation = await container.resolve<BriefReviewService>(BRIEF_REVIEW_SERVICE).invite({
      ...scope, userId, caseId: agencyCase.id, versionId,
      ...(unanswered ? { sourceSubmissionId: submission.id } : {}),
    })
    return { status: 'invited' as const, invitation, versionId, questions: result.questions }
  }
}
