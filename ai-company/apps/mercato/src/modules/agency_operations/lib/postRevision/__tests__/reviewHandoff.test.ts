/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPostRevisionReviewHandoff } from '../reviewHandoff'
import { POST_REVISION_RESULT_KEY } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, previousPostVersionId, postVersionId, documentId, taskId, qaTaskRunId, userId] = Array.from({ length: 13 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const context = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const completed = { status: 'completed', orderRef: caseId, submissionId, previousPostVersionId, postVersionId,
  instructionVersionId: uuid(20), readyForReview: true, qaTaskRunId, qaVerdict: 'pass_for_draft', analysisQaTaskRunId: uuid(21), freezeTaskRunId: uuid(22),
  answeredQuestionIds: ['audience'], unresolvedQuestionIds: [], questions: [], taskRunIds: [qaTaskRunId], documentVersionIds: [postVersionId], agentRunIds: [], spentPln: 1 }
const getPostReview = jest.fn()
const invite = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { getPostReview }, agencyPostReviewService: { invite } }
const container = { resolve: (name: string) => services[name] }
function arrange(result: unknown) {
  jest.mocked(findOneWithDecryption).mockReset()
    .mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId,
      original: { eventId: 'answer', text: 'Audience: agency owners', postReviewResponse: { taskId, channel: 'portal', kind: 'message', post: { documentId, versionId: previousPostVersionId }, externalEventId: 'answer', body: 'Audience: agency owners' } } } as never)
    .mockResolvedValueOnce({ id: workflowId, context: { [POST_REVISION_RESULT_KEY]: { executed: true, functionName: 'agency_operations.runPostRevision', result } } } as never)
    .mockResolvedValueOnce({ id: caseId } as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(userId)
  getPostReview.mockResolvedValue({ isCurrent: true, qa: { state: 'assessed', taskRunId: qaTaskRunId, verdict: 'pass_for_draft' } })
  invite.mockResolvedValue({ workflowInstanceId: uuid(30), taskId: uuid(31), replayed: false })
})

test('invites the actual new QA-reviewed version, never the old post or a stale result', async () => {
  arrange(completed)
  await expect(createPostRevisionReviewHandoff(container as never)({}, context)).resolves.toMatchObject({ status: 'invited', versionId: postVersionId })
  expect(invite).toHaveBeenCalledWith({ ...scope, userId, caseId, postVersionId })
  invite.mockClear()
  arrange({ ...completed, postVersionId: previousPostVersionId })
  await expect(createPostRevisionReviewHandoff(container as never)({}, context)).resolves.toMatchObject({ status: 'blocked', invitation: null })
  expect(invite).not.toHaveBeenCalled()
})

test('preserves recoverable configuration reasons but rejects malformed persisted results', async () => {
  const revision = { status: 'not_configured', orderRef: caseId, reason: 'missing_post_revision_authorization' }
  arrange(revision)
  await expect(createPostRevisionReviewHandoff(container as never)({}, context)).resolves.toEqual({ status: 'blocked', orderRef: caseId, invitation: null, reason: revision.reason, nextAction: 'review_configuration', revision })
  arrange({ status: 'completed', orderRef: caseId })
  await expect(createPostRevisionReviewHandoff(container as never)({}, context)).rejects.toThrow()
  expect(invite).not.toHaveBeenCalled()
})

test('shows the actual evidence prerequisite instead of inviting an unreviewed revision', async () => {
  arrange({ ...completed, readyForReview: false, qaVerdict: 'needs_fix', evidencePendingReason: 'requested_source_unavailable' })
  await expect(createPostRevisionReviewHandoff(container as never)({}, context)).resolves.toMatchObject({
    status: 'blocked', reason: 'requested_source_unavailable', invitation: null,
    revision: { submissionId, previousPostVersionId, postVersionId, evidencePendingReason: 'requested_source_unavailable' },
  })
  expect(invite).not.toHaveBeenCalled()
})
