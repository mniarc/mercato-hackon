import { isDeepStrictEqual } from 'node:util'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { BRIEF_REVIEW_SERVICE, type BriefReviewService } from '../briefStrategyProcess/contracts'
import type { MaterialRevisionHandoff } from './contracts'
import type { readSavedMaterialRevision } from './saved'

type SavedMaterialRevision = Awaited<ReturnType<typeof readSavedMaterialRevision>>

/** Reuse the genuine exact brief question task; its text reply goes through G. */
export function createMaterialRevisionClarification(container: AppContainer) {
  return async (saved: SavedMaterialRevision): Promise<MaterialRevisionHandoff> => {
    const { em, scope, submission, workflow, agencyCase, result } = saved
    const blocked = (reason: string): MaterialRevisionHandoff => ({
      status: 'blocked', orderRef: result.orderRef, invitation: null, reason, revision: result, nextAction: 'review_material',
    })
    if (result.status !== 'needs_client_data') return blocked('client_clarification_not_required')
    if (result.escalationVersionId) return blocked('research_exception')
    if (!result.questions.length) return blocked('no_client_questions')
    const unchanged = result.briefVersionId === null
    if (unchanged && (result.sourcesVersionId !== null || result.findingsVersionId !== null || result.documentVersionIds.length)) {
      return blocked('material_foundation_changed')
    }
    const versionId = result.briefVersionId ?? result.previousBriefVersionId
    if (!unchanged && (versionId === result.previousBriefVersionId || !result.qaTaskRunId
      || result.qaVerdict !== 'needs_client_data' || !result.documentVersionIds.includes(versionId)
      || !result.taskRunIds.includes(result.qaTaskRunId))) return blocked('revised_brief_not_reviewable')
    const review = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getBriefReview(scope, agencyCase.id, versionId)
    if (!review?.isCurrent || review.qa.state !== 'assessed' || review.qa.verdict !== 'needs_client_data'
      || (!unchanged && review.qa.taskRunId !== result.qaTaskRunId)) return blocked('brief_questions_not_current')
    const currentQuestions = review.questions.map((question) => ({ questionId: question.question_id, question: question.question }))
    if (!isDeepStrictEqual(result.questions, currentQuestions)) return blocked('brief_questions_changed')
    const userId = await resolveWorkflowPrincipalUserId(em, workflow)
    if (!userId) throw new Error('[internal] Material clarification requires the native execution principal')
    const invitation = await container.resolve<BriefReviewService>(BRIEF_REVIEW_SERVICE).invite({
      ...scope, userId, caseId: agencyCase.id, versionId,
      ...(unchanged ? { sourceSubmissionId: submission.id } : {}),
    })
    return { status: 'invited', orderRef: result.orderRef, invitation, versionId }
  }
}
