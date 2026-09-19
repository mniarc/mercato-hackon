/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPostReviewHandoff } from '../../postExecution/reviewHandoff'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, principalId, postVersionId] = Array.from({ length: 8 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const execution = { status: 'completed', orderRef: caseId, instructionVersionId: uuid(9), selectionSubmissionId: submissionId,
  taskRunIds: [uuid(10)], documentVersionIds: [postVersionId], agentRunIds: [], spentPln: 0, postVersionId, qaTaskRunId: uuid(11), qaVerdict: 'pass_for_draft', readyForReview: true }
const nativeContext = { userId: uuid(99), workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1', context: { agencyPostExecution: { result: 'ignored caller data' } } } }
const invite = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyPostReviewService: { invite } }
const container = { resolve: (name: string) => services[name] }

function arrange(result: unknown = execution, submission: unknown = { id: submissionId, caseId, customerEntityId }, agencyCase: unknown = { id: caseId }) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: workflowId, context: { agencyPostExecution: { result } } } as never)
    .mockResolvedValueOnce(submission as never).mockResolvedValueOnce(agencyCase as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  invite.mockResolvedValue({ workflowInstanceId: uuid(20), taskId: uuid(21), replayed: false })
})

test('invites the exact persisted QA-ready post with native principal, ignoring caller references', async () => {
  await createPostReviewHandoff(container as never)({ postVersionId: uuid(98) }, nativeContext)
  expect(invite).toHaveBeenCalledWith({ ...scope, userId: principalId, caseId, postVersionId })
})

test.each([{ status: 'paused_budget' }, { readyForReview: false }, { qaVerdict: 'needs_fix' }, { postVersionId: null }])('does not invite a non-ready execution: %j', async (change) => {
  arrange({ ...execution, ...change })
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).resolves.toEqual({ invitation: null, reason: 'post_not_ready' })
  expect(invite).not.toHaveBeenCalled()
})

test('does not invite without originating selection and current scoped case', async () => {
  arrange(execution, { id: uuid(99), caseId, customerEntityId })
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).rejects.toThrow('originating case selection')
  arrange(execution, { id: submissionId, caseId, customerEntityId }, null)
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).rejects.toThrow('outside the submission scope')
  expect(invite).not.toHaveBeenCalled()
})
