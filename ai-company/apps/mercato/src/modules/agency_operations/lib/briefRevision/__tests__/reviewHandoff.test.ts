/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createBriefRevisionReviewHandoff } from '../reviewHandoff'
import { BRIEF_REVISION_RESULT_KEY } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, previousBriefVersionId, briefVersionId, documentId, taskId, qaTaskRunId, userId] = Array.from({ length: 13 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const context = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const completed = { status: 'completed', orderRef: caseId, submissionId, previousBriefVersionId, briefVersionId,
  findingsVersionId: uuid(20), qaTaskRunId, qaVerdict: 'ready_for_approval', analysisQaTaskRunId: uuid(21), freezeTaskRunId: uuid(22),
  answeredQuestionIds: ['audience'], unresolvedQuestionIds: [], questions: [], taskRunIds: [qaTaskRunId], documentVersionIds: [briefVersionId], agentRunIds: [], spentPln: 1 }
const getBriefReview = jest.fn()
const invite = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { getBriefReview }, agencyBriefReviewService: { invite } }
const container = { resolve: (name: string) => services[name] }
function arrange(result: unknown) {
  jest.mocked(findOneWithDecryption).mockReset()
    .mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId,
      original: { eventId: 'answer', text: 'Audience: agency owners', reviewResponse: { taskId, channel: 'portal', kind: 'message', documentId, versionId: previousBriefVersionId, externalEventId: 'answer', body: 'Audience: agency owners' } } } as never)
    .mockResolvedValueOnce({ id: workflowId, context: { [BRIEF_REVISION_RESULT_KEY]: { executed: true, functionName: 'agency_operations.runBriefRevision', result } } } as never)
    .mockResolvedValueOnce({ id: caseId } as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(userId)
  getBriefReview.mockResolvedValue({ isCurrent: true, qa: { state: 'assessed', taskRunId: qaTaskRunId, verdict: 'ready_for_approval' } })
  invite.mockResolvedValue({ workflowInstanceId: uuid(30), taskId: uuid(31), replayed: false })
})

test('invites the actual new QA-reviewed version, never the old brief or a stale result', async () => {
  arrange(completed)
  await expect(createBriefRevisionReviewHandoff(container as never)({}, context)).resolves.toMatchObject({ status: 'invited', versionId: briefVersionId })
  expect(invite).toHaveBeenCalledWith({ ...scope, userId, caseId, versionId: briefVersionId })
  invite.mockClear()
  arrange({ ...completed, briefVersionId: previousBriefVersionId })
  await expect(createBriefRevisionReviewHandoff(container as never)({}, context)).resolves.toMatchObject({ status: 'blocked', invitation: null })
  expect(invite).not.toHaveBeenCalled()
})

test('unanswered saved outcome requests a source-bound same-version follow-up without pretending revision or approval', async () => {
  arrange({ ...completed, status: 'needs_client_data', briefVersionId: null, findingsVersionId: null, qaTaskRunId: null, qaVerdict: null,
    answeredQuestionIds: [], unresolvedQuestionIds: ['audience'], questions: [{ questionId: 'audience', question: 'Who is your audience?' }], documentVersionIds: [] })
  await createBriefRevisionReviewHandoff(container as never)({}, context)
  expect(invite).toHaveBeenCalledWith({ ...scope, userId, caseId, versionId: previousBriefVersionId, sourceSubmissionId: submissionId })
})

test('preserves recoverable configuration reasons but rejects malformed persisted results', async () => {
  const revision = { status: 'not_configured', orderRef: caseId, reason: 'missing_brief_revision_authorization' }
  arrange(revision)
  await expect(createBriefRevisionReviewHandoff(container as never)({}, context)).resolves.toEqual({ status: 'blocked', invitation: null, reason: revision.reason, revision })
  arrange({ status: 'completed', orderRef: caseId })
  await expect(createBriefRevisionReviewHandoff(container as never)({}, context)).rejects.toThrow()
  expect(invite).not.toHaveBeenCalled()
})
