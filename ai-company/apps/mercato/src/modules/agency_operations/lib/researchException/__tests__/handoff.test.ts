import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createResearchExceptionHandoff, createPostResearchExceptionHandoff } from '../handoff'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_FUNCTION_NAME } from '../../analysisProcess/workflow'
import { POST_EXECUTION_RESULT_KEY, POST_EXECUTION_FUNCTION } from '../../postExecution/contracts'

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
  context: { [AGENCY_ANALYSIS_RESULT_KEY]: { executed: true, functionName: AGENCY_ANALYSIS_FUNCTION_NAME, result } },
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

describe('post-production exception in the original G workflow', () => {
  const selectionSubmissionId = '10000000-0000-4000-8000-000000000005'
  const postResult = { status: 'completed', orderRef: caseId, instructionVersionId: 'instruction', selectionSubmissionId,
    taskRunIds: ['run'], documentVersionIds: ['post', 'exception'], agentRunIds: [], spentPln: 0,
    postVersionId: 'post', qaTaskRunId: 'qa', qaVerdict: 'needs_fix', readyForReview: false, escalationVersionId: 'exception' }
  const postContext = { workflowInstance: { id: workflowId, workflowId: 'agency_operations.client-submission.native.v1', tenantId, organizationId,
    context: { [POST_EXECUTION_RESULT_KEY]: { result: { escalationVersionId: 'forged' } } } } }
  function arrangePost(result: unknown = postResult) {
    find.mockReset().mockResolvedValueOnce({ id: workflowId, context: { [POST_EXECUTION_RESULT_KEY]: { executed: true, functionName: POST_EXECUTION_FUNCTION, result } } } as never)
      .mockResolvedValueOnce({ id: selectionSubmissionId, caseId, customerEntityId: 'customer' } as never)
      .mockResolvedValueOnce({ id: caseId, customerEntityId: 'customer' } as never)
    getExceptionReview.mockResolvedValue({ ...exception, orderRef: caseId })
  }

  test('uses DB-saved post outputs and preserves evidence without creating another workflow', async () => {
    arrangePost()
    const result = await createPostResearchExceptionHandoff(container as never)({ escalationVersionId: 'forged' }, postContext)
    expect(result).toMatchObject({ kind: 'employee_exception', caseId, sourceWorkflowInstanceId: workflowId, continuation: 'unsupported' })
    expect(getExceptionReview).toHaveBeenCalledWith({ tenantId, organizationId }, caseId, 'exception')
    expect(find.mock.calls[1][2]).toEqual({ tenantId, organizationId, id: selectionSubmissionId, workflowInstanceId: workflowId, caseId, deletedAt: null })
    expect(result.kind === 'employee_exception' && result.evidenceText).toContain('Which source is correct?')
  })

  test('normal review readiness or disabled execution does not invent an escalation', async () => {
    const { escalationVersionId: _unused, ...ready } = postResult
    arrangePost({ ...ready, readyForReview: true, qaVerdict: 'pass_for_draft' })
    await expect(createPostResearchExceptionHandoff(container as never)({}, postContext)).resolves.toEqual({ kind: 'none' })
    arrangePost({ status: 'not_configured', orderRef: caseId, reason: 'execution_disabled' })
    await expect(createPostResearchExceptionHandoff(container as never)({}, postContext)).resolves.toEqual({ kind: 'none' })
    expect(getExceptionReview).not.toHaveBeenCalled()
  })

  test('rejects a foreign selection or exception task outside the saved post output', async () => {
    find.mockReset().mockResolvedValueOnce({ id: workflowId, context: { [POST_EXECUTION_RESULT_KEY]: { result: postResult } } } as never).mockResolvedValueOnce(null)
    await expect(createPostResearchExceptionHandoff(container as never)({}, postContext)).rejects.toThrow('originating case selection')
    arrangePost()
    getExceptionReview.mockResolvedValue({ ...exception, orderRef: caseId, taskRunId: 'other-run' })
    await expect(createPostResearchExceptionHandoff(container as never)({}, postContext)).rejects.toThrow('saved post result')
  })
})
