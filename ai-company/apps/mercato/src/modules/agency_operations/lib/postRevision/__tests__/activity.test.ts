/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPostRevisionBinding } from '../binding'
import { createPostRevisionActivity } from '../activity'
import { postRevisionActivityResultSchema } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
jest.mock('../binding', () => ({ createPostRevisionBinding: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, postVersionId, taskId, analysisId, definitionId, principalId] = Array.from({ length: 12 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const request = { orderRef: caseId, postVersionId, originalText: 'Shorten the opening sentence', source: { submissionId, eventId: 'post:source-event', customerUserId, workflowInstanceId: workflowId, invitationTaskId: taskId, agentRunId: uuid(13) } }
const decision = { kind: 'change', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Client answers', message: 'Updating', targets: { caseId, submissionId, documentVersionReference: postVersionId }, effectsApplied: false }
const context = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const runPostRevision = jest.fn()
const runPostEvidence = jest.fn()
const load = jest.fn()
const container = { resolve: (name: string) => name === 'agencyResearchService' ? { runPostRevision, runPostEvidence } : {} }
const originalFlag = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
function arrange(postRevision: unknown = { maxCostPln: 2 }, changeScope = 'post_content', postEvidence: unknown = { maxCostPln: 0.5 }) {
  jest.mocked(findOneWithDecryption).mockReset()
    .mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId } as never)
    .mockResolvedValueOnce({ id: workflowId, context: { nativeClientTriageInterpretation: { changeScope }, clientTriageResult: { result: decision } } } as never)
    .mockResolvedValueOnce({ id: caseId, workflowInstanceId: analysisId } as never)
    .mockResolvedValueOnce({ id: analysisId, definitionId, workflowId: 'agency_operations.analysis.v1', version: 2 } as never)
    .mockResolvedValueOnce({ id: definitionId, workflowId: 'agency_operations.analysis.v1', version: 2, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } }, definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: 'agency_operations.runAnalysis', args: { policy: { maxCostPln: 999, postRevision, postEvidence } } } }] }] } } as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  jest.mocked(createPostRevisionBinding).mockReturnValue({ load } as never)
  load.mockResolvedValue(request)
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  runPostRevision.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'post_not_current' })
  arrange()
})
afterAll(() => {
  if (originalFlag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = originalFlag
})

test.each(['upstream', 'uncertain'])('keeps a saved %s change blocked without invoking post workers', async (changeScope) => {
  arrange({ maxCostPln: 2 }, changeScope)
  await expect(createPostRevisionActivity(container as never)({}, context)).resolves.toMatchObject({
    status: 'not_ready', reason: changeScope === 'upstream' ? 'post_change_scope_requires_upstream_review' : 'post_change_scope_requires_clarification',
  })
  expect(runPostRevision).not.toHaveBeenCalled()
})

test('passes only the saved response and separately pinned revision budget under native execution identity', async () => {
  await expect(createPostRevisionActivity(container as never)({ originalText: 'forged', maxCostPln: 999 }, context)).resolves.toMatchObject({ status: 'not_ready', reason: 'post_not_current' })
  expect(runPostRevision).toHaveBeenCalledWith({ context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'post_revision' }, request: { ...request, process: { workflowDefinitionId: definitionId, workflowId: 'agency_operations.analysis.v1', version: 2 }, maxCostPln: 2 } })
})

test('missing revision authorization and disabled execution cannot spend the original analysis budget', async () => {
  arrange(null)
  await expect(createPostRevisionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_post_revision_authorization' })
  arrange()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'false'
  await expect(createPostRevisionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'execution_disabled' })
  expect(runPostRevision).not.toHaveBeenCalled()
})

test('the persisted G disposition cannot replace the original invited post version', async () => {
  load.mockResolvedValue({ ...request, postVersionId: uuid(90) })
  await expect(createPostRevisionActivity(container as never)({}, context)).rejects.toThrow('saved G disposition')
  expect(runPostRevision).not.toHaveBeenCalled()
})

const revised = {
  status: 'completed', orderRef: caseId, submissionId, previousPostVersionId: postVersionId,
  instructionVersionId: uuid(20), postVersionId: uuid(21), qaTaskRunId: uuid(22),
  qaVerdict: 'needs_fix', readyForReview: false, taskRunIds: [uuid(23), uuid(22)],
  documentVersionIds: [uuid(21)], agentRunIds: [uuid(24)], spentPln: 0.25,
  evidenceRequest: { claim: 'The new claim', question: 'Does the saved source support this?',
    targetStep: '3.2', sourceRefs: ['SRC01'], returnStep: '7.3' },
}
const supplemented = {
  status: 'completed', orderRef: caseId, instructionVersionId: uuid(20), selectionSubmissionId: uuid(25),
  requestedPostVersionId: uuid(21), requestedQaTaskRunId: uuid(22), evidenceTaskRunId: uuid(26),
  postVersionId: uuid(27), qaTaskRunId: uuid(28), qaVerdict: 'pass_for_draft', readyForReview: true,
  taskRunIds: [uuid(22), uuid(26), uuid(28)], documentVersionIds: [uuid(21), uuid(27)],
  agentRunIds: [uuid(29)], spentPln: 0.125,
}

test('returns the revised post evidence to its saved QA with separately configured budget and preserves revision identity', async () => {
  runPostRevision.mockResolvedValue(revised)
  runPostEvidence.mockResolvedValue(supplemented)
  const actual = postRevisionActivityResultSchema.parse(await createPostRevisionActivity(container as never)({}, { ...context, stepInstanceId: uuid(30) }))
  expect(runPostEvidence).toHaveBeenCalledWith({
    context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'post_revision', invocationId: uuid(30) },
    request: { orderRef: caseId, instructionVersionId: uuid(20), postVersionId: uuid(21), qaTaskRunId: uuid(22), maxCostPln: 0.5 },
  })
  expect(actual).toMatchObject({ status: 'completed', submissionId, previousPostVersionId: postVersionId,
    postVersionId: uuid(27), qaTaskRunId: uuid(28), qaVerdict: 'pass_for_draft', readyForReview: true,
    taskRunIds: [uuid(23), uuid(22), uuid(26), uuid(28)], documentVersionIds: [uuid(21), uuid(27)],
    agentRunIds: [uuid(24), uuid(29)], spentPln: 0.375 })
  expect('evidenceRequest' in actual ? actual.evidenceRequest : undefined).toBeUndefined()
})

test('keeps the original revised post and request on missing evidence authorization without spending the revision cap', async () => {
  arrange({ maxCostPln: 2 }, 'post_content', null)
  runPostRevision.mockResolvedValue(revised)
  const actual = postRevisionActivityResultSchema.parse(await createPostRevisionActivity(container as never)({}, context))
  expect(actual).toEqual({ ...revised, evidencePendingReason: 'missing_post_evidence_authorization' })
  expect(runPostEvidence).not.toHaveBeenCalled()
})

test.each([
  { status: 'not_ready', orderRef: caseId, reason: 'requested_source_unavailable' },
  { status: 'execution_incomplete', orderRef: caseId, activationTaskRunId: uuid(26), reason: 'failed' },
])('retains a real evidence hold ($status) without claiming a reviewable result', async (returned) => {
  runPostRevision.mockResolvedValue(revised)
  runPostEvidence.mockResolvedValue(returned)
  const actual = postRevisionActivityResultSchema.parse(await createPostRevisionActivity(container as never)({}, context))
  expect(actual).toEqual({ ...revised, evidencePendingReason: returned.reason })
})

test('passes an actual evidence budget escalation to the existing revision exception handoff', async () => {
  runPostRevision.mockResolvedValue(revised)
  runPostEvidence.mockResolvedValue({ ...supplemented, status: 'paused_budget', readyForReview: false,
    qaVerdict: null, escalationVersionId: uuid(31), documentVersionIds: [uuid(31)] })
  const actual = postRevisionActivityResultSchema.parse(await createPostRevisionActivity(container as never)({}, context))
  expect(actual).toMatchObject({ status: 'paused_budget', readyForReview: false, qaVerdict: null, escalationVersionId: uuid(31),
    submissionId, previousPostVersionId: postVersionId, documentVersionIds: [uuid(21), uuid(31)] })
})

test('does not run evidence extraction for a revised post that already passed QA', async () => {
  const ready = { ...revised, evidenceRequest: undefined, qaVerdict: 'pass_for_draft', readyForReview: true }
  runPostRevision.mockResolvedValue(ready)
  await expect(createPostRevisionActivity(container as never)({}, context)).resolves.toEqual(ready)
  expect(runPostEvidence).not.toHaveBeenCalled()
})
