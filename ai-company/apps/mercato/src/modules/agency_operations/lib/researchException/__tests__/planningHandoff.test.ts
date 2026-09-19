import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createPlanningResearchExceptionHandoff } from '../planningHandoff'
import { PLANNING_EXECUTION_RESULT_KEY, PLANNING_EXECUTION_FUNCTION } from '../../planningExecution/contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, workflowId, submissionId, customerEntityId] = Array.from({ length: 6 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const saved = { status: 'completed', orderRef: caseId, taskRunIds: ['plan-qa', 'exception-task'], documentVersionIds: ['plan-version', 'exception-version'], agentRunIds: [], spentPln: 0,
  strategyVersionId: 'strategy-version', tovVersionId: 'tov-version', planVersionId: 'plan-version', qaTaskRunId: 'plan-qa', qaVerdict: 'needs_agent_fix',
  readyForApproval: false, escalationVersionId: 'exception-version' }
const exception = { orderRef: caseId, versionId: 'exception-version', documentId: 'exception-document', version: '1.0', taskRunId: 'exception-task', isCurrent: true,
  documentStatus: 'blocked', versionStatus: 'blocked', data: { exception_type: { code: 'qa_exhausted' }, evidence: [{ ref: 'plan-version', fact: 'Missing source' }], hold: { blocked_task_refs: ['6.4'] },
    decision_question: 'Who must supply the missing evidence?', allowed_resolutions: [{ code: 'keep_blocked', required_evidence: 'Reason', permitted_next_step: 'none' }],
    resolution: { state: 'open' }, resume: { state: 'pending', next_step_or_null: '6.2' } } }
const getExceptionReview = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { getExceptionReview } }
const container = { resolve: (name: string) => services[name] }
const context = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1', context: { [PLANNING_EXECUTION_RESULT_KEY]: 'ignored caller result' } } }

function arrange(result: unknown = saved) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: workflowId, context: { [PLANNING_EXECUTION_RESULT_KEY]: { executed: true, functionName: PLANNING_EXECUTION_FUNCTION, result } } } as never)
    .mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId } as never).mockResolvedValueOnce({ id: caseId, customerEntityId } as never)
  getExceptionReview.mockReset().mockResolvedValue(exception)
}

test('hands the exact saved planning exception to native employee handling without authorizing continuation', async () => {
  arrange()
  const result = await createPlanningResearchExceptionHandoff(container as never)({ escalationVersionId: 'forged' }, context)
  expect(result).toMatchObject({ kind: 'employee_exception', caseId, sourceWorkflowInstanceId: workflowId, continuation: 'unsupported', exception })
  expect(getExceptionReview).toHaveBeenCalledWith(scope, caseId, 'exception-version')
  expect(jest.mocked(findOneWithDecryption).mock.calls[1][2]).toEqual({ ...scope, workflowInstanceId: workflowId, caseId, deletedAt: null })
  expect(result.kind === 'employee_exception' && result.evidenceText).toContain('plan-version')
})

test('does not escalate ordinary review or old results without an exception; rejects unrelated saved evidence', async () => {
  const { escalationVersionId: _unused, ...ready } = saved
  arrange({ ...ready, qaVerdict: 'ready_for_approval', readyForApproval: true })
  const handoff = createPlanningResearchExceptionHandoff(container as never)
  await expect(handoff({}, context)).resolves.toEqual({ kind: 'none' })
  expect(getExceptionReview).not.toHaveBeenCalled()
  arrange()
  getExceptionReview.mockResolvedValue({ ...exception, taskRunId: 'unrelated-task' })
  await expect(handoff({}, context)).rejects.toThrow('saved planning result')
  arrange()
  getExceptionReview.mockResolvedValue({ ...exception, isCurrent: false })
  await expect(handoff({}, context)).rejects.toThrow('current open blocked version')
  arrange()
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: workflowId, context: { [PLANNING_EXECUTION_RESULT_KEY]: { result: saved } } } as never).mockResolvedValueOnce(null)
  await expect(handoff({}, context)).rejects.toThrow('originating case submission')
})
