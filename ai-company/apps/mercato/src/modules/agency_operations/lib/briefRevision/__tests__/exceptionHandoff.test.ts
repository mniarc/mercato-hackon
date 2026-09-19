/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createBriefRevisionResearchExceptionHandoff } from '../exceptionHandoff'
import { BRIEF_REVISION_RESULT_KEY } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, previousBriefVersionId, documentId, taskId, escalationVersionId, exceptionTaskId] = Array.from({ length: 12 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const context = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const saved = { status: 'paused_budget', orderRef: caseId, submissionId, previousBriefVersionId, briefVersionId: null,
  findingsVersionId: null, qaTaskRunId: null, qaVerdict: null, analysisQaTaskRunId: null, freezeTaskRunId: null,
  answeredQuestionIds: [], unresolvedQuestionIds: ['audience'], questions: [{ questionId: 'audience', question: 'Who is your audience?' }],
  taskRunIds: [exceptionTaskId], documentVersionIds: [escalationVersionId], agentRunIds: [], spentPln: 2, escalationVersionId }
const exception = { orderRef: caseId, documentId: uuid(20), versionId: escalationVersionId, version: '1.0', taskRunId: exceptionTaskId,
  isCurrent: true, documentStatus: 'blocked', versionStatus: 'blocked', data: { resolution: { state: 'open' }, exception_type: 'budget', evidence: [], hold: { blocked_steps: ['4.1'] },
    decision_question: 'Keep blocked?', allowed_resolutions: [{ resolution_id: 'keep_blocked' }], resume: { step: '4.1' } } }
const getExceptionReview = jest.fn()
const container = { resolve: (name: string) => name === 'agencyResearchService' ? { getExceptionReview } : {} }
function arrange(result: unknown = saved) {
  jest.mocked(findOneWithDecryption).mockReset()
    .mockResolvedValueOnce({ id: workflowId, context: { [BRIEF_REVISION_RESULT_KEY]: { executed: true, functionName: 'agency_operations.runBriefRevision', result } } } as never)
    .mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId,
      original: { eventId: 'brief-answer', text: 'Audience: agency owners', reviewResponse: { taskId, channel: 'portal', kind: 'message', documentId, versionId: previousBriefVersionId, externalEventId: 'answer', body: 'Audience: agency owners' } } } as never)
    .mockResolvedValueOnce({ id: caseId, customerEntityId } as never)
}

test('routes only the real saved scoped revision exception into existing employee evidence', async () => {
  getExceptionReview.mockResolvedValue(exception)
  arrange()
  await expect(createBriefRevisionResearchExceptionHandoff(container as never)({}, context)).resolves.toMatchObject({ kind: 'employee_exception', caseId, sourceWorkflowInstanceId: workflowId, exception, continuation: 'unsupported' })
  expect(getExceptionReview).toHaveBeenCalledWith(scope, caseId, escalationVersionId)
  arrange({ ...saved, taskRunIds: [] })
  await expect(createBriefRevisionResearchExceptionHandoff(container as never)({}, context)).rejects.toThrow('not an output')
  arrange({ ...saved, submissionId: uuid(90) })
  await expect(createBriefRevisionResearchExceptionHandoff(container as never)({}, context)).rejects.toThrow('original brief response')
})
