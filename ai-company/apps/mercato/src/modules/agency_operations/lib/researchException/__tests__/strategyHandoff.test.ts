import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createStrategyResearchExceptionHandoff } from '../strategyHandoff'
import { STRATEGY_EXECUTION_RESULT_KEY, STRATEGY_EXECUTION_FUNCTION } from '../../strategyExecution/contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, workflowId, submissionId, customerEntityId] = Array.from({ length: 6 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const saved = { status: 'completed', orderRef: caseId, taskRunIds: ['exception-task'], documentVersionIds: ['exception-version'], agentRunIds: [], spentPln: 0,
  strategyVersionId: 'strategy-version', tovVersionId: 'tov-version', qaTaskRunId: 'qa-task', qaVerdict: 'needs_agent_fix', escalationVersionId: 'exception-version' }
const exception = { orderRef: caseId, versionId: 'exception-version', documentId: 'exception-document', version: '1.0', taskRunId: 'exception-task', isCurrent: true,
  documentStatus: 'blocked', versionStatus: 'blocked', data: { exception_type: { code: 'qa_exhausted' }, evidence: [{ fact: 'Pair contradiction' }], hold: { blocked_task_refs: ['5.5'] },
    decision_question: 'Which promise is supported?', allowed_resolutions: [], resolution: { state: 'open' }, resume: { state: 'pending' } } }
const getExceptionReview = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { getExceptionReview } }
const container = { resolve: (name: string) => services[name] }
const context = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1', context: { [STRATEGY_EXECUTION_RESULT_KEY]: 'ignored caller result' } } }

function arrange(result: unknown = saved) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: workflowId, context: { [STRATEGY_EXECUTION_RESULT_KEY]: { executed: true, functionName: STRATEGY_EXECUTION_FUNCTION, result } } } as never)
    .mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId } as never).mockResolvedValueOnce({ id: caseId, customerEntityId } as never)
}

test('binds the current escalation to saved strategy outputs; normal review creates none', async () => {
  arrange()
  getExceptionReview.mockResolvedValue(exception)
  const handoff = createStrategyResearchExceptionHandoff(container as never)
  await expect(handoff({ escalationVersionId: 'forged' }, context)).resolves.toMatchObject({ kind: 'employee_exception', caseId, sourceWorkflowInstanceId: workflowId, continuation: 'unsupported' })
  expect(getExceptionReview).toHaveBeenCalledWith(scope, caseId, 'exception-version')
  expect(jest.mocked(findOneWithDecryption).mock.calls[1][2]).toEqual({ ...scope, workflowInstanceId: workflowId, caseId, deletedAt: null })
  arrange()
  getExceptionReview.mockResolvedValue({ ...exception, taskRunId: 'unrelated-task' })
  await expect(handoff({}, context)).rejects.toThrow('saved strategy result')
  const { escalationVersionId: _unused, ...ready } = saved
  arrange({ ...ready, qaVerdict: 'ready_for_approval' })
  getExceptionReview.mockClear()
  await expect(handoff({}, context)).resolves.toEqual({ kind: 'none' })
  expect(getExceptionReview).not.toHaveBeenCalled()
})
