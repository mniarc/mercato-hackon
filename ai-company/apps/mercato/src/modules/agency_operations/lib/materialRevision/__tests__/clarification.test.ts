/** @jest-environment node */
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createMaterialRevisionClarification } from '../clarification'

jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const caseId = uuid(3), submissionId = uuid(4), previousBriefVersionId = uuid(5), versionId = uuid(6), qaTaskRunId = uuid(7), userId = uuid(8)
const questions = [{ questionId: 'Q-01', question: 'Which audience should be prioritized?' }]
const getBriefReview = jest.fn(), invite = jest.fn()
const services: Record<string, unknown> = { agencyResearchService: { getBriefReview }, agencyBriefReviewService: { invite } }
const container = { resolve: (name: string) => services[name] }
function saved(extra: Record<string, unknown> = {}) {
  return { em: {}, scope, submission: { id: submissionId }, workflow: { id: uuid(9) }, agencyCase: { id: caseId }, result: {
    status: 'needs_client_data', orderRef: caseId, submissionId, previousBriefVersionId, briefVersionId: null,
    sourcesVersionId: null, findingsVersionId: null, qaTaskRunId: null, qaVerdict: null,
    questions, taskRunIds: [uuid(10)], documentVersionIds: [], agentRunIds: [], spentPln: 0, ...extra,
  } } as never
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(userId)
  getBriefReview.mockResolvedValue({ isCurrent: true, qa: { state: 'assessed', verdict: 'needs_client_data', taskRunId: qaTaskRunId },
    questions: [{ question_id: 'Q-01', question: questions[0].question }] })
  invite.mockResolvedValue({ workflowInstanceId: uuid(11), taskId: uuid(12), replayed: false })
})

it('reopens the actual unchanged brief questions with a source-bound invitation, not an approval or source replay', async () => {
  await expect(createMaterialRevisionClarification(container as never)(saved())).resolves.toMatchObject({ status: 'invited', versionId: previousBriefVersionId })
  expect(invite).toHaveBeenCalledWith({ ...scope, userId, caseId, versionId: previousBriefVersionId, sourceSubmissionId: submissionId })
})

it('invites actual fresh QA questions on the new brief without pretending that client data is complete', async () => {
  await expect(createMaterialRevisionClarification(container as never)(saved({ briefVersionId: versionId,
    sourcesVersionId: uuid(13), findingsVersionId: uuid(14), qaTaskRunId, qaVerdict: 'needs_client_data',
    taskRunIds: [qaTaskRunId], documentVersionIds: [versionId],
  }))).resolves.toMatchObject({ status: 'invited', versionId })
  expect(invite).toHaveBeenCalledWith({ ...scope, userId, caseId, versionId })
})

it('does not invent missing questions or invite approval of a changed/stale foundation', async () => {
  await expect(createMaterialRevisionClarification(container as never)(saved({ questions: [] }))).resolves.toMatchObject({ status: 'blocked', reason: 'no_client_questions' })
  await expect(createMaterialRevisionClarification(container as never)(saved({ sourcesVersionId: uuid(13) }))).resolves.toMatchObject({ status: 'blocked', reason: 'material_foundation_changed' })
  getBriefReview.mockResolvedValueOnce({ isCurrent: false, qa: { state: 'assessed', verdict: 'needs_client_data' }, questions: [] })
  await expect(createMaterialRevisionClarification(container as never)(saved())).resolves.toMatchObject({ status: 'blocked', reason: 'brief_questions_not_current' })
  expect(invite).not.toHaveBeenCalled()
})
