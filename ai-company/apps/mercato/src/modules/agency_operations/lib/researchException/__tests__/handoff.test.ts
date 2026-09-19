import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createResearchExceptionHandoff } from '../handoff'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const find = jest.mocked(findOneWithDecryption)
const caseId = '10000000-0000-4000-8000-000000000001'
const workflowId = '10000000-0000-4000-8000-000000000002'
const tenantId = '10000000-0000-4000-8000-000000000003'
const organizationId = '10000000-0000-4000-8000-000000000004'
const saved = { caseId, requestedThrough: '3.8', state: 'waiting', completedThrough: null, taskRunIds: ['run'], documentVersionIds: ['exception'], agentRunIds: [], spentPln: 0, escalationVersionId: 'exception' }
const exception = {
  versionId: 'exception', documentId: 'doc', version: '1.0', taskRunId: 'run', isCurrent: true, documentStatus: 'blocked', versionStatus: 'blocked',
  data: {
    exception_type: { code: 'qa_exhausted', summary: 'Conflicting evidence', trigger_step: '3.7' },
    evidence: [{ ref: 'source', fact: 'Conflict' }], hold: { blocked_task_refs: ['3.8'], independent_task_refs: [], external_action_lock: false },
    decision_question: 'Which source is correct?', allowed_resolutions: [{ code: 'keep_blocked', required_evidence: 'Reason', permitted_next_step: 'none' }],
    resolution: { state: 'open' }, resume: { state: 'pending', next_step_or_null: null },
  },
}
const getExceptionReview = jest.fn()
const container = { resolve: (name: string) => {
  if (name === 'em') return {}
  if (name === 'agencyResearchService') return { getExceptionReview }
  throw new Error(`Unexpected dependency ${name}`)
} }
const context = (result = saved) => ({ workflowInstance: {
  id: workflowId, workflowId: 'agency_operations.analysis.v1', tenantId, organizationId,
  context: { agencyAnalysisResult: { result } },
} })

beforeEach(() => {
  find.mockReset().mockResolvedValue({ id: caseId, customerEntityId: 'customer' } as never)
  getExceptionReview.mockReset().mockResolvedValue(exception)
})

test('prepares exact persisted exception evidence without scheduling anything on replay', async () => {
  const handoff = createResearchExceptionHandoff(container as never)
  const first = await handoff({ caseId: 'forged', versionId: 'forged' }, context())
  await expect(handoff({}, context())).resolves.toEqual(first)
  expect(first).toMatchObject({ kind: 'employee_exception', caseId, sourceWorkflowInstanceId: workflowId, continuation: 'unsupported' })
  expect(getExceptionReview).toHaveBeenCalledWith({ tenantId, organizationId }, caseId, 'exception')
  expect(find.mock.calls[0][2]).toEqual({ tenantId, organizationId, id: caseId, workflowInstanceId: workflowId, deletedAt: null })
})

test('ordinary client waits do not create staff exceptions', async () => {
  const { escalationVersionId: _unused, ...ordinaryWait } = saved
  await expect(createResearchExceptionHandoff(container as never)({}, context(ordinaryWait as typeof saved))).resolves.toEqual({ kind: 'none' })
  expect(getExceptionReview).not.toHaveBeenCalled()
})

test('rejects a case outside the originating workflow', async () => {
  find.mockResolvedValue(null)
  await expect(createResearchExceptionHandoff(container as never)({}, context())).rejects.toThrow('outside the originating case')
  expect(getExceptionReview).not.toHaveBeenCalled()
})

test.each([
  { isCurrent: false }, { data: { ...exception.data, resolution: { state: 'decided' } } },
  { versionStatus: 'approved' }, { taskRunId: 'unrelated-run' }, { versionId: 'unrelated-version' },
])('rejects ineligible or unrelated exception %j', async (override) => {
  getExceptionReview.mockResolvedValue({ ...exception, ...override })
  await expect(createResearchExceptionHandoff(container as never)({}, context())).rejects.toThrow()
})
