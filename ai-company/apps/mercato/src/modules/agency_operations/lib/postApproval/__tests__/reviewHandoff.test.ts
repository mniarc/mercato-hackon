/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPostReviewHandoff } from '../../postExecution/reviewHandoff'
import { POST_EXECUTION_RESULT_KEY, POST_EXECUTION_FUNCTION } from '../../postExecution/contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, principalId, postVersionId] = Array.from({ length: 8 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const execution = { status: 'completed', orderRef: caseId, instructionVersionId: uuid(9), selectionSubmissionId: submissionId,
  taskRunIds: [uuid(10)], documentVersionIds: [postVersionId], agentRunIds: [], spentPln: 0, postVersionId, qaTaskRunId: uuid(11), qaVerdict: 'pass_for_draft', readyForReview: true }
const nativeContext = { userId: uuid(99), workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1', context: { [POST_EXECUTION_RESULT_KEY]: { result: 'ignored caller data' } } } }
const invite = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyPostReviewService: { invite } }
const container = { resolve: (name: string) => services[name] }

function arrange(result: unknown = execution, submission: unknown = { id: submissionId, caseId, customerEntityId }, agencyCase: unknown = { id: caseId }) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: workflowId, context: { [POST_EXECUTION_RESULT_KEY]: { executed: true, functionName: POST_EXECUTION_FUNCTION, result } } } as never)
    .mockResolvedValueOnce(submission as never).mockResolvedValueOnce(agencyCase as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  invite.mockResolvedValue({ workflowInstanceId: uuid(20), taskId: uuid(21), replayed: false })
})

test('invites the exact persisted QA-ready post with native principal, ignoring caller references', async () => {
  await expect(createPostReviewHandoff(container as never)({ postVersionId: uuid(98) }, nativeContext)).resolves.toEqual({
    status: 'invited', orderRef: caseId, invitation: { workflowInstanceId: uuid(20), taskId: uuid(21), replayed: false },
  })
  expect(invite).toHaveBeenCalledWith({ ...scope, userId: principalId, caseId, postVersionId })
})

test.each([{ status: 'paused_budget' }, { readyForReview: false }, { qaVerdict: 'needs_fix' }, { postVersionId: null }])('does not invite a non-ready execution: %j', async (change) => {
  arrange({ ...execution, ...change })
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).resolves.toEqual({
    status: 'blocked', orderRef: caseId, invitation: null,
    reason: 'status' in change ? 'paused_budget' : 'post_not_ready', nextAction: 'review_qa', execution: { ...execution, ...change },
  })
  expect(invite).not.toHaveBeenCalled()
})

test.each([
  [{ status: 'not_configured', orderRef: caseId, reason: 'missing_post_authorization' }, 'review_configuration'],
  [{ status: 'not_ready', orderRef: caseId, reason: 'compiler_blocked', issueCodes: ['MISSING_EVIDENCE'] }, 'review_dependencies'],
  [{ status: 'execution_incomplete', orderRef: caseId, reason: 'in_progress_or_interrupted', activationTaskRunId: uuid(30) }, 'reconcile_execution'],
] as const)('preserves the saved expected outcome and inspection guidance: %j', async (result, nextAction) => {
  arrange(result)
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).resolves.toEqual({
    status: 'blocked', orderRef: caseId, invitation: null, reason: result.reason, nextAction, execution: result,
  })
  expect(invite).not.toHaveBeenCalled()
})

test('retains a scoped reconciliation hold for malformed output, never claiming invitation', async () => {
  arrange({ status: 'completed', readyForReview: true })
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).resolves.toEqual({
    status: 'blocked', orderRef: caseId, invitation: null, reason: 'missing_post_execution', nextAction: 'reconcile_execution', execution: null,
  })
  expect(invite).not.toHaveBeenCalled()
})

test('does not turn a foreign expected outcome into this case hold', async () => {
  arrange({ status: 'not_configured', orderRef: uuid(99), reason: 'execution_disabled' })
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).rejects.toThrow('originating case selection')
  expect(invite).not.toHaveBeenCalled()
})

test('does not invite without originating selection and current scoped case', async () => {
  arrange(execution, { id: uuid(99), caseId, customerEntityId })
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).rejects.toThrow('originating case selection')
  arrange(execution, { id: submissionId, caseId, customerEntityId }, null)
  await expect(createPostReviewHandoff(container as never)({}, nativeContext)).rejects.toThrow('outside the submission scope')
  expect(invite).not.toHaveBeenCalled()
})
