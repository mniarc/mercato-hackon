/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { limits } from '../../../data/templates'
import { documentIdFor } from '../../research/envelope'
import type { StepContext } from '../../research/steps/context'
import { runStrategyStep } from '../../research/steps/strategy'
import { runTovStep } from '../../research/steps/tov'
import { runStrategyQaLoop } from '../../research/steps/strategyQa'
import { finishTaskRun, startTaskRun } from '../../store'
import { resolveStrategyReadiness, type StrategyReadiness } from '../../strategyReadiness'
import { strategyExecutionRequestSchema, type StrategyExecutionRequest } from '../contracts'
import { runStrategyExecution } from '../run'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../strategyReadiness', () => ({ resolveStrategyReadiness: jest.fn() }))
jest.mock('../../research/steps/strategy', () => ({ runStrategyStep: jest.fn() }))
jest.mock('../../research/steps/tov', () => ({ runTovStep: jest.fn() }))
jest.mock('../../research/steps/strategyQa', () => ({ runStrategyQaLoop: jest.fn() }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn(), finishTaskRun: jest.fn() }))

const scope = { tenantId: 'tenant', organizationId: 'organization' }
const em = {} as EntityManager
const orderRef = 'case'
const request: StrategyExecutionRequest = {
  orderRef,
  briefVersionId: '11111111-1111-4111-8111-111111111111',
  acceptanceSubmissionId: '22222222-2222-4222-8222-222222222222',
  process: { workflowDefinitionId: '33333333-3333-4333-8333-333333333333', workflowId: 'native-analysis', version: 2 },
  maxCostPln: 3,
}
const models = { extract: 'configured-extract', synthesis: 'configured-synthesis', qa: 'configured-qa' }
const runAgent = jest.fn()
const findOne = jest.mocked(findOneWithDecryption)
let ready: Extract<StrategyReadiness, { status: 'ready' }>
let versions: AgencyResearchDocumentVersion[]
let freeze: AgencyResearchTaskRun
let contexts: StepContext[]

function execute() { return runStrategyExecution({ em, scope, request, models, runAgent, runner: 'orchestrator' }) }

beforeEach(() => {
  jest.clearAllMocks()
  contexts = []
  versions = ['WZR-BRIEF', 'WZR-ZRODLA', 'WZR-AUDYT', 'WZR-KONKURENCJA', 'WZR-USTALENIA', 'WZR-ZAMOWIENIE'].map((templateId, index) => Object.assign(new AgencyResearchDocumentVersion(), {
    ...scope, orderRef, id: index === 0 ? request.briefVersionId : `version-${index}`, documentId: `document-${index}`,
    templateId, versionNo: 2, status: index === 0 ? 'approved' : 'draft', data: { source: templateId },
  }))
  versions[5].data = {
    product_selection: { sku: 'configured-sku', offer_version: '1', price_net: 1, currency: 'PLN' },
    brand: { display_name: 'Persisted brand', website_url: 'https://example.test' },
    market_language: { market: 'PL', language: 'pl' },
  }
  const refs = versions.slice(0, 5).map((row) => ({
    documentId: row.documentId, versionId: row.id, documentRef: documentIdFor(row.templateId as 'WZR-BRIEF', orderRef),
    version: '2.0', templateId: row.templateId,
  }))
  ready = {
    status: 'ready', orderRef, brief: refs[0], process: request.process!,
    acceptance: {
      person: 'customer', at: '2026-09-19T12:00:00.000Z', scope: 'brief', version: '2.0', documentVersionId: request.briefVersionId,
      source: { kind: 'agency_brief_acceptance', submissionId: request.acceptanceSubmissionId, eventId: 'event', workflowInstanceId: 'workflow', agentRunId: 'agent', invitationTaskId: 'task' },
    },
    analysis: { freezeTaskRunId: 'freeze', qaTaskRunId: 'analysis-qa', setHash: 'frozen-hash', documents: refs.slice(1) },
  }
  freeze = Object.assign(new AgencyResearchTaskRun(), {
    ...scope, orderRef, id: 'freeze', stepId: '3.8', status: 'done',
    inputVersions: [{ document_id: documentIdFor('WZR-ZAMOWIENIE', orderRef), version: '2.0' }],
  })
  findOne.mockImplementation(async (_em, entity, query) => {
    const rows = entity === AgencyResearchTaskRun ? [freeze] : versions
    return (rows.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(resolveStrategyReadiness).mockImplementation(async () => ready)
  jest.mocked(startTaskRun).mockResolvedValue(Object.assign(new AgencyResearchTaskRun(), { id: 'activation' }))
  jest.mocked(finishTaskRun).mockResolvedValue(undefined)
  jest.mocked(runStrategyStep).mockImplementation(async (ctx) => {
    contexts.push(ctx)
    ctx.strategyOutputs!.strategy = { document_id: 'KLI-STRATEGIA@case', version: '1.0', versionId: 'strategy', data: {}, status: 'draft' }
    ctx.taskRunIds.push('strategy-task')
    ctx.documentVersionIds.push('strategy')
    return { taskRunId: 'strategy-task', versionId: 'strategy', status: 'done' }
  })
  jest.mocked(runTovStep).mockImplementation(async (ctx) => {
    contexts.push(ctx)
    ctx.strategyOutputs!.tov = { document_id: 'KLI-TOV@case', version: '1.0', versionId: 'tov', data: {}, status: 'draft' }
    ctx.taskRunIds.push('tov-task')
    ctx.documentVersionIds.push('tov')
    return { taskRunId: 'tov-task', versionId: 'tov', status: 'done' }
  })
  jest.mocked(runStrategyQaLoop).mockImplementation(async (ctx) => {
    contexts.push(ctx)
    ctx.taskRunIds.push('pair-qa')
    return { taskRunId: 'pair-qa', verdict: 'ready_for_approval', findings: [], repairs: 0, strategyVersionId: 'strategy', tovVersionId: 'tov' }
  })
})

test('starts only 5.1 and reuses the original author and QA steps on exact frozen inputs', async () => {
  expect(await execute()).toEqual({
    status: 'completed', orderRef, taskRunIds: ['activation', 'strategy-task', 'tov-task', 'pair-qa'],
    documentVersionIds: ['strategy', 'tov'], agentRunIds: [], spentPln: 0,
    strategyVersionId: 'strategy', tovVersionId: 'tov', qaTaskRunId: 'pair-qa', qaVerdict: 'ready_for_approval',
  })
  expect(startTaskRun).toHaveBeenCalledTimes(1)
  expect(startTaskRun).toHaveBeenCalledWith(em, scope, expect.objectContaining({
    orderRef, stepId: '5.1', brand: 'Persisted brand', models,
    inputVersions: expect.arrayContaining([{ document_id: 'KLI-BRIEF@case', version: '2.0', status: 'approved' }]),
  }))
  expect(finishTaskRun).toHaveBeenCalledWith(em, expect.anything(), expect.objectContaining({
    status: 'done', summary: expect.objectContaining({
      process: request.process, briefVersionId: request.briefVersionId, acceptanceSubmissionId: request.acceptanceSubmissionId,
      freezeTaskRunId: 'freeze', limits: { maxCostPln: 3, qaRepairAttemptsPerRun: limits.generation.qaRepairAttemptsPerRun },
    }),
  }))
  expect(contexts).toHaveLength(3)
  expect(contexts[1]).toBe(contexts[0])
  expect(contexts[2]).toBe(contexts[0])
  expect(contexts[0].strategyInputs?.brief.versionId).toBe(request.briefVersionId)
  expect(contexts[0].strategyInputs?.zrodla.versionId).toBe('version-1')
  expect(contexts[0].orderVersion.version).toBe('2.0')
  expect(contexts[0].runAgent).toBe(runAgent)
  expect(contexts[0].ledger.snapshot().cap).toBe(3)
  expect(runStrategyQaLoop).toHaveBeenCalledWith(contexts[0], { strategyStep: runStrategyStep, tovStep: runTovStep })
  for (const call of findOne.mock.calls) {
    expect(call[2]).toMatchObject({ ...scope, orderRef })
    expect(call[4]).toEqual(scope)
  }
})

test('does not write or invoke agents when accepted-brief readiness is missing', async () => {
  jest.mocked(resolveStrategyReadiness).mockResolvedValue({ status: 'not_ready', orderRef, reason: 'brief_not_approved' })
  expect(await execute()).toEqual({ status: 'not_ready', orderRef, reason: 'brief_not_approved' })
  expect(findOne).not.toHaveBeenCalled()
  expect(startTaskRun).not.toHaveBeenCalled()
  expect(runStrategyStep).not.toHaveBeenCalled()
})

test('will not substitute a newer or foreign version when a pinned foundation is missing', async () => {
  versions[1].id = 'a-new-current-source-version'
  expect(await execute()).toEqual({ status: 'not_ready', orderRef, reason: 'pinned_input_missing', templateId: 'WZR-ZRODLA' })
  expect(startTaskRun).not.toHaveBeenCalled()
  expect(runStrategyStep).not.toHaveBeenCalled()
})

test.each(['absent', 'ambiguous'])('requires one frozen order pin, not latest order data (%s)', async (kind) => {
  const pins = freeze.inputVersions as unknown[]
  freeze.inputVersions = kind === 'absent' ? [] : [...pins, ...pins]
  expect(await execute()).toEqual({ status: 'not_ready', orderRef, reason: 'order_version_missing' })
  expect(startTaskRun).not.toHaveBeenCalled()
})

test('keeps the generated strategy reference when the following step pauses for budget', async () => {
  jest.mocked(runTovStep).mockImplementation(async (ctx) => {
    ctx.ledger.assertCanSpend('5.3', 'tov-agent', 4)
    throw new Error('unreachable')
  })
  expect(await execute()).toMatchObject({ status: 'paused_budget', strategyVersionId: 'strategy', tovVersionId: null, qaTaskRunId: null })
  expect(runStrategyQaLoop).not.toHaveBeenCalled()
})

test('returns negative QA and the teammate escalation without synthesizing approval', async () => {
  jest.mocked(runStrategyQaLoop).mockResolvedValue({
    taskRunId: 'pair-qa', verdict: 'needs_agent_fix', findings: [], repairs: 2,
    strategyVersionId: 'strategy', tovVersionId: 'tov', escalationVersionId: 'exception-version',
  })
  expect(await execute()).toMatchObject({ status: 'completed', qaVerdict: 'needs_agent_fix', escalationVersionId: 'exception-version' })
})

test('does not swallow non-budget step failures', async () => {
  jest.mocked(runStrategyStep).mockRejectedValue(new Error('persisted step failure'))
  await expect(execute()).rejects.toThrow('persisted step failure')
  expect(runTovStep).not.toHaveBeenCalled()
})

test('requires an explicit positive cap instead of adopting the legacy default', () => {
  expect(strategyExecutionRequestSchema.safeParse({ ...request, maxCostPln: undefined }).success).toBe(false)
  expect(strategyExecutionRequestSchema.safeParse({ ...request, maxCostPln: 0 }).success).toBe(false)
  expect(strategyExecutionRequestSchema.safeParse({ ...request, maxCostPln: Number.POSITIVE_INFINITY }).success).toBe(false)
})
