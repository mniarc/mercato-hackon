import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { BRIEF_REVIEW_SERVICE, type BriefReviewService } from '../briefStrategyProcess/contracts'
import type { MaterialRevisionHandoff } from './contracts'
import { readSavedMaterialRevision } from './saved'
import { createMaterialRevisionClarification } from './clarification'

export function createMaterialRevisionReviewHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<MaterialRevisionHandoff> => {
    const saved = await readSavedMaterialRevision(container, rawContext)
    const { em, scope, workflow, agencyCase, result } = saved
    const blocked = (reason: string): MaterialRevisionHandoff => ({
      status: 'blocked', orderRef: result.orderRef, invitation: null, reason, revision: result,
      nextAction: result.status === 'not_configured' ? 'review_configuration'
        : reason === 'research_exception' ? 'review_employee_exception'
        : reason === 'impact_review_required' || reason === 'downstream_exists' ? 'review_impact' : 'review_material',
    })
    if (result.status === 'not_configured' || result.status === 'not_ready' || result.status === 'execution_incomplete') return blocked(result.reason)
    if (result.escalationVersionId) return blocked('research_exception')
    if (result.status === 'needs_client_data') return createMaterialRevisionClarification(container)(saved)
    if (result.status !== 'completed' || !result.briefVersionId || result.briefVersionId === result.previousBriefVersionId
      || !result.qaTaskRunId || !['ready_for_approval', 'needs_client_data'].includes(result.qaVerdict ?? '')) return blocked(result.status === 'completed' ? 'revised_brief_not_reviewable' : result.status)
    if (!result.documentVersionIds.includes(result.briefVersionId) || !result.taskRunIds.includes(result.qaTaskRunId)) {
      throw new Error('[internal] Material revision brief and QA are not saved outputs')
    }
    const review = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getBriefReview(scope, agencyCase.id, result.briefVersionId)
    if (!review?.isCurrent || review.qa.state !== 'assessed' || review.qa.taskRunId !== result.qaTaskRunId
      || review.qa.verdict !== result.qaVerdict || !['ready_for_approval', 'needs_client_data'].includes(review.qa.verdict)) return blocked('revised_brief_not_reviewable')
    const userId = await resolveWorkflowPrincipalUserId(em, workflow)
    if (!userId) throw new Error('[internal] Material revision review requires the native execution principal')
    const invitation = await container.resolve<BriefReviewService>(BRIEF_REVIEW_SERVICE).invite({
      ...scope, userId, caseId: agencyCase.id, versionId: result.briefVersionId,
    })
    return { status: 'invited', orderRef: result.orderRef, invitation, versionId: result.briefVersionId }
  }
}
