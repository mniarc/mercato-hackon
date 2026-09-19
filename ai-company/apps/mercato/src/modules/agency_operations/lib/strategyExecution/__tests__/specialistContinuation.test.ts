import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { prepareStrategyExecution } from '../activity'
import { createQueueSpecialistCheckActivity, createSpecialistContinuationHandler } from '../specialistContinuation'
import { STRATEGY_EXECUTION_RESULT_KEY, STRATEGY_SPECIALIST_SIGNAL_KEY } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../activity', () => ({ prepareStrategyExecution: jest.fn() }))

const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const caseId = uuid(3), workflowId = uuid(4), specialistWorkflowInstanceId = uuid(5), actorId = uuid(6)
const reference = { owner: 'agency_tov', kind: 'KLI-TOV', researchRunId: uuid(7), documentId: uuid(8), versionId: uuid(9), version: '1.0' }

function fixture() {
  const tx = {}
  const em = { transactional: async (work: (transaction: unknown) => unknown) => work(tx) }
  const workflow = { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1',
    status: 'PAUSED', currentStepId: 'strategy_specialist_waiting', context: {
      [STRATEGY_EXECUTION_RESULT_KEY]: { result: { status: 'not_ready', reason: 'specialist_tov_pending',
        orderRef: caseId, templateId: 'KLI-TOV', specialistWorkflowInstanceId, executionUserId: actorId, nextAction: 'wait_for_specialist' } },
    } as Record<string, unknown>,
  }
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, _entity, where) => (
    Object.entries(where).every(([key, value]) => key === 'deletedAt' ? value === null : workflow[key as keyof typeof workflow] === value) ? workflow : null
  ) as never)
  jest.mocked(findWithDecryption).mockResolvedValue([{ workflowInstanceId: workflowId }] as never)
  const resolveForCase = jest.fn().mockResolvedValue({ status: 'ready', workflowInstanceId: specialistWorkflowInstanceId, reference })
  const allowed = jest.fn().mockResolvedValue(true)
  const getStrategyReadiness = jest.fn().mockResolvedValue({ status: 'ready' })
  jest.mocked(prepareStrategyExecution).mockResolvedValue({ status: 'authorized', source: workflow, run: {
    context: { ...scope, userId: actorId }, request: { orderRef: caseId, briefVersionId: uuid(10), acceptanceSubmissionId: uuid(11),
      process: { workflowDefinitionId: uuid(12), workflowId: 'agency_operations.analysis.v1', version: 1 }, maxCostPln: 2 },
  } } as never)
  const sendSignal = jest.fn(async () => {
    workflow.status = 'WAITING_FOR_ACTIVITIES'
    workflow.currentStepId = 'strategy_execution'
    workflow.context[STRATEGY_SPECIALIST_SIGNAL_KEY] = { workflowInstanceId: specialistWorkflowInstanceId }
  })
  const container = { resolve: (key: string) => {
    if (key === 'em') return em
    if (key === 'agencyStaffTovIntakeService') return { resolveForCase }
    if (key === 'rbacService') return { userHasAllFeatures: allowed }
    if (key === 'agencyResearchService') return { getStrategyReadiness }
    if (key === 'signalHandler') return { sendSignal }
    throw new Error(`Unexpected dependency ${key}`)
  } }
  return { workflow, resolveForCase, allowed, getStrategyReadiness, sendSignal, tx, container,
    handler: createSpecialistContinuationHandler(container as never) }
}

beforeEach(() => jest.clearAllMocks())

test('completes only the exact case intake and resumes once with original actor and policy rechecked', async () => {
  const { handler, sendSignal, container, tx, resolveForCase, allowed, getStrategyReadiness } = fixture()
  const input = { ...scope, caseId, specialistWorkflowInstanceId }
  await handler.complete(input)
  await handler.complete(input)
  expect(resolveForCase).toHaveBeenCalledWith({ ...scope, caseId, workflowInstanceId: specialistWorkflowInstanceId })
  expect(allowed).toHaveBeenCalledWith(actorId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope)
  expect(getStrategyReadiness).toHaveBeenCalledWith(scope, expect.objectContaining({ briefVersionId: uuid(10), acceptanceSubmissionId: uuid(11) }))
  expect(sendSignal).toHaveBeenCalledTimes(1)
  expect(sendSignal).toHaveBeenCalledWith(tx, container, {
    ...scope, instanceId: workflowId, userId: actorId, signalName: 'agency.strategy-specialist.ready',
    payload: { [STRATEGY_SPECIALIST_SIGNAL_KEY]: { workflowInstanceId: specialistWorkflowInstanceId } },
  })
})

test('a completion for another intake, case or scope cannot resume this wait', async () => {
  const { handler, sendSignal } = fixture()
  await handler.checkWaiting({ ...scope, workflowInstanceId: workflowId, specialistWorkflowInstanceId: uuid(99) })
  await handler.checkWaiting({ ...scope, workflowInstanceId: workflowId, caseId: uuid(99) })
  await handler.checkWaiting({ ...scope, tenantId: uuid(99), workflowInstanceId: workflowId })
  expect(sendSignal).not.toHaveBeenCalled()
})

test('entry race retries native delivery, then resumes when the same wait is persisted', async () => {
  const { handler, workflow, sendSignal } = fixture()
  workflow.status = 'RUNNING'
  workflow.currentStepId = 'strategy_execution'
  await expect(handler.checkWaiting({ ...scope, workflowInstanceId: workflowId })).rejects.toThrow('retry native event delivery')
  workflow.status = 'PAUSED'
  workflow.currentStepId = 'strategy_specialist_waiting'
  await handler.checkWaiting({ ...scope, workflowInstanceId: workflowId })
  expect(sendSignal).toHaveBeenCalledTimes(1)
})

test('missing specialist, changed authority, revoked actor or changed accepted brief leaves the wait intact', async () => {
  const { handler, resolveForCase, allowed, getStrategyReadiness, sendSignal } = fixture()
  const input = { ...scope, workflowInstanceId: workflowId }
  resolveForCase.mockResolvedValueOnce({ status: 'running', workflowInstanceId: specialistWorkflowInstanceId })
  await handler.checkWaiting(input)
  jest.mocked(prepareStrategyExecution).mockResolvedValueOnce({ status: 'not_configured', orderRef: caseId, reason: 'missing_strategy_authorization' })
  await handler.checkWaiting(input)
  allowed.mockResolvedValueOnce(false)
  await handler.checkWaiting(input)
  getStrategyReadiness.mockResolvedValueOnce({ status: 'not_ready', reason: 'brief_not_current' })
  await handler.checkWaiting(input)
  expect(sendSignal).not.toHaveBeenCalled()
})

test('wait-entry notification is durable and enqueue-only, with no client payload', async () => {
  const emit = jest.fn().mockResolvedValue(undefined)
  const resolve = jest.fn((key: string) => {
    if (key === 'eventBus') return { emit }
    throw new Error(`Unexpected dependency ${key}`)
  })
  await createQueueSpecialistCheckActivity({ resolve } as never)({ userId: uuid(99) }, { workflowInstance: {
    id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1',
  } })
  expect(emit).toHaveBeenCalledWith('agency_operations.strategy.specialist_waiting', {
    ...scope, workflowInstanceId: workflowId,
  }, { persistent: true, deliverInline: false, ...scope })
})
