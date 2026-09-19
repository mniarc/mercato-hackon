/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPlanningExecutionActivity } from '../activity'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerId, strategyId, strategyVersionId, tovId, tovVersionId, analysisId, definitionId, principalId, stepId, taskId] = Array.from({ length: 15 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const processRef = { workflowDefinitionId: definitionId, workflowId: 'agency_operations.analysis.v1', version: 3 }
const pair = { strategy: { documentId: strategyId, versionId: strategyVersionId }, tov: { documentId: tovId, versionId: tovVersionId } }
const accepted = { status: 'accepted', orderRef: caseId, pair }
const continuation = { status: 'accepted', orderRef: caseId, cumulative: accepted, planningReadiness: { status: 'ready', orderRef: caseId, process: processRef, accepted } }
const context = { userId: uuid(99), stepInstanceId: stepId, workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const runPlanning = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { runPlanning } }
const container = { resolve: (name: string) => services[name] }
const definition = (planningExecution: unknown = { maxCostPln: 2 }) => ({
  metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } },
  definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: 'agency_operations.runAnalysis', args: { policy: { maxCostPln: 999, strategyExecution: { maxCostPln: 999 }, planningExecution } } } }] }] },
})
const savedEnv = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
function arrange(options: { saved?: unknown; definition?: unknown; analysis?: unknown } = {}) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId: customerId, original: {
    eventId: 'pair-decision', text: 'Approved', strategyReviewResponse: { ...pair, taskId, channel: 'portal', kind: 'approval', approvedDocuments: ['tov'], externalEventId: 'last-click' },
  } } as never)
    .mockResolvedValueOnce({ id: workflowId, context: { agencyStrategyPairContinuation: { result: options.saved ?? continuation } } } as never)
    .mockResolvedValueOnce({ id: caseId, workflowInstanceId: analysisId } as never)
    .mockResolvedValueOnce((options.analysis ?? { id: analysisId, definitionId, workflowId: processRef.workflowId, version: 3 }) as never)
    .mockResolvedValueOnce((options.definition ?? definition()) as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  runPlanning.mockResolvedValue({ status: 'execution_incomplete', orderRef: caseId, activationTaskRunId: 'activation', reason: 'in_progress_or_interrupted' })
})
afterAll(() => {
  if (savedEnv === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = savedEnv
})

test('uses the exact accepted pair, separate planning budget and resolved native principal', async () => {
  await createPlanningExecutionActivity(container as never)({ maxCostPln: 9999, process: { workflowId: 'forged' } }, context)
  expect(runPlanning).toHaveBeenCalledWith({
    context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'planning_execution', invocationId: stepId },
    request: { orderRef: caseId, strategyVersionId, tovVersionId, process: processRef, maxCostPln: 2 },
  })
})

test.each([undefined, { maxCostPln: 0 }, { maxCostPln: -1 }])('no planning authorization never inherits either earlier phase budget: %j', async (authorization) => {
  const configured = definition()
  configured.definition.transitions[0].activities[0].config.args.policy.planningExecution = authorization as never
  arrange({ definition: configured })
  await expect(createPlanningExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_planning_authorization' })
  expect(runPlanning).not.toHaveBeenCalled()
})

test.each([undefined, 'false'])('execution stays default-off: %s', async (flag) => {
  if (flag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = flag
  await expect(createPlanningExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'execution_disabled' })
  expect(runPlanning).not.toHaveBeenCalled()
})

test('partial acceptance cannot invoke planning', async () => {
  arrange({ saved: { status: 'partial', orderRef: caseId } })
  await expect(createPlanningExecutionActivity(container as never)({}, context)).resolves.toEqual({ status: 'not_ready', orderRef: caseId, reason: 'pair_acceptance_incomplete' })
  expect(runPlanning).not.toHaveBeenCalled()
})

test('preserves explicit readiness failure and does not execute', async () => {
  arrange({ saved: { ...continuation, planningReadiness: { status: 'not_ready', orderRef: caseId, reason: 'brief_not_current_or_accepted' } } })
  await expect(createPlanningExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_ready', reason: 'brief_not_current_or_accepted' })
  expect(runPlanning).not.toHaveBeenCalled()
})

test('saved pair cannot drift from the original reviewed pair', async () => {
  arrange({ saved: { ...continuation, cumulative: { ...accepted, pair: { ...pair, tov: { ...pair.tov, versionId: uuid(98) } } } } })
  await expect(createPlanningExecutionActivity(container as never)({}, context)).rejects.toThrow('original pair')
  expect(runPlanning).not.toHaveBeenCalled()
})

test('another analysis version cannot provide spending authority', async () => {
  arrange({ analysis: { id: analysisId, definitionId, workflowId: processRef.workflowId, version: 4 } })
  await expect(createPlanningExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_process_configuration' })
  expect(runPlanning).not.toHaveBeenCalled()
})

test('foreign generated owner cannot authorize planning', async () => {
  arrange({ definition: { ...definition(), metadata: { generatedBy: { module: 'other', ownerId: 'analysis' } } } })
  await expect(createPlanningExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_process_configuration' })
  expect(runPlanning).not.toHaveBeenCalled()
})

test('passes no fabricated step invocation ID when native transition omits it', async () => {
  const { stepInstanceId: _step, ...transitionContext } = context
  const result = await createPlanningExecutionActivity(container as never)({}, transitionContext)
  expect(runPlanning.mock.calls[0][0].context).not.toHaveProperty('invocationId')
  expect(result).toEqual({ status: 'execution_incomplete', orderRef: caseId, activationTaskRunId: 'activation', reason: 'in_progress_or_interrupted' })
})

test('caller userId cannot replace a missing native workflow principal', async () => {
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(null)
  await expect(createPlanningExecutionActivity(container as never)({}, context)).rejects.toThrow('native workflow execution principal')
  expect(runPlanning).not.toHaveBeenCalled()
})
