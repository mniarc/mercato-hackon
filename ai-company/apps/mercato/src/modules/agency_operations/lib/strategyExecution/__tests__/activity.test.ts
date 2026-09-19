import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { assertAnalysisExecutionEnabled } from '../../analysisProcess/activity'
import { createStrategyExecutionActivity } from '../activity'
import { strategyExecutionActivityResultSchema } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../analysisProcess/activity', () => ({ assertAnalysisExecutionEnabled: jest.fn() }))
const find = jest.mocked(findOneWithDecryption)
const guard = jest.mocked(assertAnalysisExecutionEnabled)
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerId, versionId, analysisId, definitionId, principalId, stepId] = Array.from({ length: 11 }, (_, i) => uuid(i + 1))
const scope = { tenantId, organizationId }
const processRef = { workflowDefinitionId: definitionId, workflowId: 'agency_operations.analysis.v1', version: 3 }
const readiness = { status: 'ready', orderRef: caseId, brief: { versionId },
  acceptance: { documentVersionId: versionId, source: { submissionId, workflowInstanceId: workflowId } }, process: processRef }
const context = { userId: principalId, stepInstanceId: stepId, workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const runStrategy = jest.fn()
const container = { resolve: (key: string) => {
  if (key === 'em') return {}
  if (key === 'agencyResearchService') return { runStrategy }
  throw new Error(`Unexpected dependency ${key}`)
} }
const completed = { status: 'completed', orderRef: caseId, taskRunIds: ['run'], documentVersionIds: ['strategy', 'tov'], agentRunIds: ['agent'], spentPln: 0.1,
  strategyVersionId: 'strategy', tovVersionId: 'tov', qaTaskRunId: 'qa', qaVerdict: 'ready_for_approval' }
const definition = (strategyExecution: unknown = { maxCostPln: 2 }) => ({
  metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } },
  definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: {
    functionName: 'agency_operations.runAnalysis', args: { policy: { maxCostPln: 999, strategyExecution } },
  } }] }] },
})
function arrange(options: { ready?: unknown; definition?: unknown; analysis?: unknown } = {}) {
  find.mockReset().mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId: customerId } as never)
    .mockResolvedValueOnce({ id: workflowId, context: { agencyStrategyReadiness: { result: options.ready ?? readiness } } } as never)
    .mockResolvedValueOnce({ id: caseId, workflowInstanceId: analysisId } as never)
    .mockResolvedValueOnce((options.analysis ?? { id: analysisId, definitionId, workflowId: processRef.workflowId, version: 3 }) as never)
    .mockResolvedValueOnce((options.definition ?? definition()) as never)
  runStrategy.mockReset().mockResolvedValue(completed)
  guard.mockReset()
}
beforeEach(() => arrange())

test('uses exact original process authorization and native principal, not caller budget', async () => {
  await expect(createStrategyExecutionActivity(container as never)({ maxCostPln: 9000, userId: uuid(99) }, context)).resolves.toEqual(completed)
  expect(runStrategy).toHaveBeenCalledWith({
    context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'strategy_execution', invocationId: stepId },
    request: { orderRef: caseId, briefVersionId: versionId, acceptanceSubmissionId: submissionId, process: processRef, maxCostPln: 2 },
  })
  expect(guard).toHaveBeenCalledTimes(1)
  expect(find.mock.calls[4][2]).toEqual({ ...scope, id: definitionId, workflowId: processRef.workflowId, version: 3, deletedAt: null })
})

test.each([undefined, { maxCostPln: -1 }, { maxCostPln: 0 }])('missing/invalid strategy cap never inherits analysis cap: %j', async (authorization) => {
  const original = definition()
  original.definition.transitions[0].activities[0].config.args.policy.strategyExecution = authorization as never
  arrange({ definition: original })
  await expect(createStrategyExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_strategy_authorization' })
  expect(runStrategy).not.toHaveBeenCalled()
  expect(guard).not.toHaveBeenCalled()
})

test('wrong process version cannot use another version budget', async () => {
  arrange({ analysis: { id: analysisId, definitionId, workflowId: processRef.workflowId, version: 4 } })
  await expect(createStrategyExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_process_configuration' })
  expect(runStrategy).not.toHaveBeenCalled()
})

test('foreign owner cannot authorize execution', async () => {
  arrange({ definition: { ...definition(), metadata: { generatedBy: { module: 'other', ownerId: 'analysis' } } } })
  await expect(createStrategyExecutionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_process_configuration' })
  expect(runStrategy).not.toHaveBeenCalled()
})

test('readiness from another acceptance cannot execute', async () => {
  arrange({ ready: { ...readiness, acceptance: { ...readiness.acceptance, source: { ...readiness.acceptance.source, submissionId: uuid(99) } } } })
  await expect(createStrategyExecutionActivity(container as never)({}, context)).rejects.toThrow('original acceptance')
  expect(runStrategy).not.toHaveBeenCalled()
})

test('execution disabled is a saved configuration hold without model calls', async () => {
  guard.mockImplementation(() => { throw new CrudHttpError(409, { error: 'Agency analysis execution is not enabled' }) })
  await expect(createStrategyExecutionActivity(container as never)({}, context)).resolves.toEqual({
    status: 'not_configured', orderRef: caseId, reason: 'execution_disabled',
  })
  expect(runStrategy).not.toHaveBeenCalled()
})

test('unexpected guard faults are not disguised as a configuration hold', async () => {
  guard.mockImplementation(() => { throw new Error('Unexpected guard failure') })
  await expect(createStrategyExecutionActivity(container as never)({}, context)).rejects.toThrow('Unexpected guard failure')
  expect(runStrategy).not.toHaveBeenCalled()
})

test('saved readiness failure remains explicit without invoking producer', async () => {
  const notReady = { status: 'not_ready', orderRef: caseId, reason: 'brief_not_current' }
  arrange({ ready: notReady })
  await expect(createStrategyExecutionActivity(container as never)({}, context)).resolves.toEqual(notReady)
  expect(runStrategy).not.toHaveBeenCalled()
})

test.each([
  { ...completed, status: 'paused_budget', qaVerdict: null, escalationVersionId: 'exception' },
  { status: 'execution_incomplete', orderRef: caseId, activationTaskRunId: 'activation', reason: 'in_progress_or_interrupted' },
])('preserves producer saved/partial result, without retry: %j', async (result) => {
  runStrategy.mockResolvedValue(result)
  await expect(createStrategyExecutionActivity(container as never)({}, context)).resolves.toEqual(result)
  expect(runStrategy).toHaveBeenCalledTimes(1)
  expect(strategyExecutionActivityResultSchema.safeParse(result).success).toBe(true)
})
