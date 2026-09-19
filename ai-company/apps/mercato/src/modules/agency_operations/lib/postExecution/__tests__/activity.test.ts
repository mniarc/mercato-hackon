/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPostExecutionActivity } from '../activity'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerId, customerUserId, planId, planVersionId, instructionVersionId, analysisId, definitionId, principalId, stepId, taskId] = Array.from({ length: 15 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const instruction = { status: 'ready', orderRef: caseId, planVersionId, selectedTopicId: 'topic-2', selectionSubmissionId: submissionId,
  taskRunId: uuid(20), instructionDocumentId: uuid(21), instructionVersionId, instructionVersion: '1.0', replayed: false }
const receipt = { status: 'plan_accepted', orderRef: caseId, replayed: false, record: {
  person: customerUserId, at: '2026-09-19T12:00:00.000Z', scope: 'plan', version: '1.0', documentId: planId, documentVersionId: planVersionId,
  approvePlan: true, selectedTopicId: 'topic-2', briefVersionId: uuid(22), strategyVersionId: uuid(23), tovVersionId: uuid(24), qaTaskRunId: uuid(25),
  source: { kind: 'agency_plan_acceptance', submissionId, eventId: 'selection', workflowInstanceId: workflowId, agentRunId: uuid(26), invitationTaskId: taskId },
} }
const decision = { kind: 'approve', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Explicit choice', message: 'Recorded', targets: { caseId, submissionId, documentVersionReference: planVersionId }, effectsApplied: true, acceptance: receipt }
const context = { userId: uuid(99), stepInstanceId: stepId, workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const runPostExecution = jest.fn()
const runPostEvidence = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { runPostExecution, runPostEvidence } }
const container = { resolve: (name: string) => services[name] }
const definition = (postExecution: unknown = { maxCostPln: 3 }) => ({
  metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } },
  definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: 'agency_operations.runAnalysis', args: {
    policy: { maxCostPln: 999, strategyExecution: { maxCostPln: 999 }, planningExecution: { maxCostPln: 999 }, postExecution },
  } } }] }] },
})
const originalFlag = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
function arrange(options: { instruction?: unknown; decision?: unknown; definition?: unknown } = {}) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId: customerId, submittedByCustomerUserId: customerUserId, eventId: 'selection' } as never)
    .mockResolvedValueOnce({ id: workflowId, context: { agencyPostInstruction: { result: options.instruction ?? instruction }, clientTriageResult: { result: options.decision ?? decision } } } as never)
    .mockResolvedValueOnce({ id: caseId, workflowInstanceId: analysisId } as never)
    .mockResolvedValueOnce({ id: analysisId, definitionId, workflowId: 'agency_operations.analysis.v1', version: 4 } as never)
    .mockResolvedValueOnce((options.definition ?? definition()) as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  runPostExecution.mockResolvedValue({ status: 'execution_incomplete', orderRef: caseId, activationTaskRunId: 'activation', reason: 'in_progress_or_interrupted' })
})
afterAll(() => {
  if (originalFlag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = originalFlag
})

test('uses the exact saved instruction/selection and original definition budget under the native principal', async () => {
  await createPostExecutionActivity(container as never)({ maxCostPln: 9000, instructionVersionId: uuid(98) }, context)
  expect(runPostExecution).toHaveBeenCalledWith({
    context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'post_production', invocationId: stepId },
    request: { orderRef: caseId, instructionVersionId, selectionSubmissionId: submissionId,
      process: { workflowDefinitionId: definitionId, workflowId: 'agency_operations.analysis.v1', version: 4 }, maxCostPln: 3 },
  })
  expect(jest.mocked(findOneWithDecryption).mock.calls[4][2]).toEqual({ ...scope, id: definitionId, workflowId: 'agency_operations.analysis.v1', version: 4, deletedAt: null })
})

test.each([undefined, { maxCostPln: 0 }])('does not inherit earlier phase budgets when post authorization is absent/invalid: %j', async (authorization) => {
  const configured = definition()
  configured.definition.transitions[0].activities[0].config.args.policy.postExecution = authorization as never
  arrange({ definition: configured })
  await expect(createPostExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_post_authorization' })
  expect(runPostExecution).not.toHaveBeenCalled()
})

test.each([undefined, 'false'])('keeps post model calls disabled by default: %s', async (flag) => {
  if (flag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = flag
  await expect(createPostExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'execution_disabled' })
  expect(runPostExecution).not.toHaveBeenCalled()
})

test('preserves blocked compiler evidence without executing', async () => {
  const blocked = { status: 'not_ready', orderRef: caseId, reason: 'compiler_blocked', taskRunId: uuid(20), instructionVersionId, issueCodes: ['MISSING_EVIDENCE'] }
  arrange({ instruction: blocked })
  await expect(createPostExecutionActivity(container as never)({}, context)).resolves.toEqual(blocked)
  expect(runPostExecution).not.toHaveBeenCalled()
})

test.each(['selectionSubmissionId', 'planVersionId', 'selectedTopicId'] as const)('rejects instruction with a different %s from the saved customer decision', async (field) => {
  arrange({ instruction: { ...instruction, [field]: field === 'selectedTopicId' ? 'topic-other' : uuid(99) } })
  await expect(createPostExecutionActivity(container as never)({}, context)).rejects.toThrow('original plan/topic selection')
  expect(runPostExecution).not.toHaveBeenCalled()
})

test('an unapplied G recommendation cannot authorize post execution', async () => {
  arrange({ decision: { ...decision, effectsApplied: false } })
  await expect(createPostExecutionActivity(container as never)({}, context)).rejects.toThrow('persisted plan approval')
  expect(runPostExecution).not.toHaveBeenCalled()
})

test('a foreign generated definition or missing native principal cannot authorize spending', async () => {
  arrange({ definition: { ...definition(), metadata: { generatedBy: { module: 'other', ownerId: 'analysis' } } } })
  await expect(createPostExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_process_configuration' })
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(null)
  await expect(createPostExecutionActivity(container as never)({}, context)).rejects.toThrow('native workflow execution principal')
  expect(runPostExecution).not.toHaveBeenCalled()
})

test('preserves interrupted producer outcome and omits an absent native step identity', async () => {
  const { stepInstanceId: _step, ...transitionContext } = context
  await expect(createPostExecutionActivity(container as never)({}, transitionContext)).resolves.toEqual({ status: 'execution_incomplete', orderRef: caseId, activationTaskRunId: 'activation', reason: 'in_progress_or_interrupted' })
  expect(runPostExecution.mock.calls[0][0].context).not.toHaveProperty('invocationId')
})

test('returns an exact saved QA evidence request only under its separate configured cap', async () => {
  const produced = { status: 'completed', orderRef: caseId, instructionVersionId, selectionSubmissionId: submissionId,
    postVersionId: uuid(30), qaTaskRunId: uuid(31), qaVerdict: 'needs_fix', readyForReview: false,
    taskRunIds: ['author', uuid(31)], documentVersionIds: [uuid(30)], agentRunIds: ['editor'], spentPln: 2,
    evidenceRequest: { claim: 'Exact post claim', question: 'Find its source evidence', sourceRefs: ['S01'], targetStep: '3.2', returnStep: '7.3' } }
  runPostExecution.mockResolvedValue(produced)
  await expect(createPostExecutionActivity(container as never)({}, context)).resolves.toMatchObject({
    ...produced, evidencePendingReason: 'missing_post_evidence_authorization', readyForReview: false,
  })
  expect(runPostEvidence).not.toHaveBeenCalled()
  const configured = definition()
  Object.assign(configured.definition.transitions[0].activities[0].config.args.policy, { postEvidence: { maxCostPln: 1.5 } })
  arrange({ definition: configured })
  runPostEvidence.mockResolvedValue({ ...produced, evidenceRequest: undefined, readyForReview: true, qaVerdict: 'pass_for_draft',
    postVersionId: uuid(32), taskRunIds: ['source', uuid(31)], documentVersionIds: [uuid(32)], agentRunIds: ['extractor'], spentPln: 1 })
  await expect(createPostExecutionActivity(container as never)({ maxCostPln: 999 }, context)).resolves.toMatchObject({
    readyForReview: true, postVersionId: uuid(32), spentPln: 3, taskRunIds: ['author', uuid(31), 'source'],
  })
  expect(runPostEvidence).toHaveBeenCalledWith({ context: expect.objectContaining({ userId: principalId, workflowInstanceId: workflowId }),
    request: { orderRef: caseId, instructionVersionId, postVersionId: uuid(30), qaTaskRunId: uuid(31), maxCostPln: 1.5 } })
})
