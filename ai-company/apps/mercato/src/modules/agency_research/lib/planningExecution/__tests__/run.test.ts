/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import type { SpecialistTovDocument } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { documentIdFor } from '../../research/envelope'
import { openEscalation } from '../../research/escalate'
import type { StepContext } from '../../research/steps/context'
import { runPlanStep } from '../../research/steps/plan'
import { runPlanQaLoop } from '../../research/steps/planQa'
import { readPlanningReadiness } from '../../planningReadiness/read'
import type { PlanningReadiness } from '../../planningReadiness/contracts'
import { startTaskRun, finishTaskRun } from '../../store'
import { runPlanningExecution } from '../run'
import type { PlanningExecutionRequest } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../planningReadiness/read', () => ({ readPlanningReadiness: jest.fn() }))
jest.mock('../../research/steps/plan', () => ({ runPlanStep: jest.fn() }))
jest.mock('../../research/steps/planQa', () => ({ runPlanQaLoop: jest.fn() }))
jest.mock('../../research/escalate', () => ({ openEscalation: jest.fn() }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn(), finishTaskRun: jest.fn() }))

const scope = { tenantId: 'tenant', organizationId: 'organization' }
const request: PlanningExecutionRequest = { orderRef: 'case', strategyVersionId: '11111111-1111-4111-8111-111111111111',
  tovVersionId: '22222222-2222-4222-8222-222222222222', maxCostPln: 3,
  process: { workflowDefinitionId: '33333333-3333-4333-8333-333333333333', workflowId: 'analysis', version: 1 } }
const models = { extract: 'extract', synthesis: 'synthesis', qa: 'qa' }
const transaction = jest.fn()
const em = { transactional: transaction, flush: jest.fn() } as unknown as EntityManager
let rows: AgencyResearchDocumentVersion[]
let runs: AgencyResearchTaskRun[]
let ctx: StepContext
let ready: Extract<PlanningReadiness, { status: 'ready' }>
const execute = (overrides: Partial<PlanningExecutionRequest> = {}, readSpecialistTov?: Parameters<typeof runPlanningExecution>[0]['readSpecialistTov']) => runPlanningExecution({
  em, scope, request: { ...request, ...overrides }, models, runner: 'orchestrator', runAgent: jest.fn(), ...(readSpecialistTov ? { readSpecialistTov } : {}),
})

beforeEach(() => {
  jest.clearAllMocks()
  runs = []
  let tail = Promise.resolve()
  transaction.mockImplementation(async (work: (manager: EntityManager) => Promise<unknown>) => {
    const previous = tail
    let release = () => {}
    tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    try { return await work(em) } finally { release() }
  })
  rows = ['WZR-STRATEGIA', 'WZR-TOV', 'WZR-BRIEF', 'WZR-ZRODLA', 'WZR-KONKURENCJA', 'WZR-ZAMOWIENIE'].map((templateId, index) => Object.assign(new AgencyResearchDocumentVersion(), {
    ...scope, orderRef: 'case', templateId, id: index === 0 ? request.strategyVersionId : index === 1 ? request.tovVersionId : `version-${index}`,
    documentId: `document-${index}`, versionNo: 2, simulationFlag: false, status: index < 3 ? 'approved' : 'draft', data: {},
  }))
  rows[0].inputVersions = rows.slice(2).map((row) => ({ document_id: documentIdFor(row.templateId as 'WZR-BRIEF', 'case'), version: '2.0', status: row.status }))
  rows[5].data = { product_selection: { sku: 'pinned', offer_version: '1', price_net: 1, currency: 'PLN', result_limits: { topics: 7 } },
    brand: { display_name: 'Pinned brand', website_url: 'https://example.test' }, market_language: { market: 'PL', language: 'pl' } }
  const reference = (row: AgencyResearchDocumentVersion) => ({ documentId: row.documentId, versionId: row.id, version: '2.0', isCurrent: true, documentStatus: 'approved', versionStatus: 'approved', simulationFlag: false })
  ready = { status: 'ready', orderRef: 'case', process: request.process, accepted: {
    status: 'accepted', orderRef: 'case', pair: { strategy: { ...reference(rows[0]), templateId: 'WZR-STRATEGIA' }, tov: { ...reference(rows[1]), templateId: 'WZR-TOV' } },
    brief: reference(rows[2]), qaTaskRunId: 'pair-qa', remainingDocuments: [],
    acceptances: { strategy: { source: { submissionId: 'strategy-acceptance' } }, tov: { source: { submissionId: 'tov-acceptance' } } },
  } } as unknown as typeof ready
  jest.mocked(readPlanningReadiness).mockImplementation(async () => ready)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    const brief = Object.assign(new AgencyResearchDocument(), { ...scope, orderRef: 'case', templateId: 'WZR-BRIEF', deletedAt: null })
    const candidates = entity === AgencyResearchDocument ? [brief] : entity === AgencyResearchTaskRun ? runs : rows
    return (candidates.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) => {
      if (typeof value === 'object' && value !== null && '$in' in value && Array.isArray(value.$in)) return value.$in.includes(Reflect.get(row, key))
      return Reflect.get(row, key) === value
    })) ?? null) as never
  })
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
  jest.mocked(startTaskRun).mockImplementation(async (_em, tenantScope, input) => {
    const run = Object.assign(new AgencyResearchTaskRun(), { ...tenantScope, ...input, id: `activation-${runs.length}`, status: 'running' })
    runs.push(run)
    return run
  })
  jest.mocked(finishTaskRun).mockImplementation(async (_em, run, result) => { Object.assign(run, result) })
  jest.mocked(runPlanStep).mockImplementation(async (context) => {
    ctx = context
    ctx.planningOutputs!.plan = { document_id: 'KLI-PLAN@case', version: '1.0', versionId: 'plan', status: 'draft', data: {} }
    ctx.taskRunIds.push('plan-task'); ctx.documentVersionIds.push('plan')
    return { taskRunId: 'plan-task', versionId: 'plan', status: 'done' }
  })
  jest.mocked(runPlanQaLoop).mockImplementation(async (context) => {
    context.taskRunIds.push('plan-qa')
    return { taskRunId: 'plan-qa', planVersionId: 'repaired-plan', verdict: 'ready_for_approval', findings: [], repairs: 1, readyForApproval: true }
  })
})

test('runs only planning on the accepted pair and exact strategy lineage with explicit product count', async () => {
  expect(await execute()).toMatchObject({ status: 'completed', planVersionId: 'repaired-plan', qaTaskRunId: 'plan-qa', readyForApproval: true })
  expect(ctx.order.topics).toBe(7)
  expect(ctx.planningInputs?.strategy.versionId).toBe(request.strategyVersionId)
  expect(ctx.planningInputs?.zrodla.versionId).toBe('version-3')
  expect(ctx.orderVersion.version).toBe('2.0')
  expect(startTaskRun).toHaveBeenCalledWith(em, scope, expect.objectContaining({ stepId: '6.1' }))
  expect(runPlanQaLoop).toHaveBeenCalledWith(ctx, { planStep: runPlanStep })
  expect(openEscalation).not.toHaveBeenCalled()
  expect(readPlanningReadiness).toHaveBeenCalledWith(em, scope, { orderRef: 'case', strategyVersionId: request.strategyVersionId, tovVersionId: request.tovVersionId, process: request.process })
})
test('planning consumes the exact current specialist ToV version without a research ToV row', async () => {
  const specialistReference = { owner: 'agency_tov' as const, kind: 'KLI-TOV' as const,
    researchRunId: '44444444-4444-4444-8444-444444444444', documentId: '55555555-5555-4555-8555-555555555555',
    versionId: request.tovVersionId, version: '3.0' }
  ready.accepted.pair.tov = { ...ready.accepted.pair.tov, documentId: specialistReference.documentId,
    versionId: specialistReference.versionId, version: specialistReference.version, documentStatus: 'ready_for_review',
    versionStatus: 'draft', specialistReference }
  const specialist = { ...specialistReference, brand: 'Pinned brand', isCurrent: true, body: {}, renderedMd: '# ToV', citations: [] } as unknown as SpecialistTovDocument
  const readSpecialistTov = jest.fn(async () => specialist)
  await expect(execute({}, readSpecialistTov)).resolves.toMatchObject({ status: 'completed', tovVersionId: specialistReference.versionId })
  expect(ctx.planningInputs?.tov).toMatchObject({ document_id: `agency_tov:${specialistReference.documentId}`,
    version: specialistReference.version, versionId: specialistReference.versionId, specialistTov: specialistReference })
  expect(ctx.planningInputs?.tov.data).toBe(specialist.body)
  expect(readPlanningReadiness).toHaveBeenCalledWith(em, scope, expect.objectContaining({ tovVersionId: specialistReference.versionId }), readSpecialistTov)
  expect(readSpecialistTov).toHaveBeenCalledWith(scope, specialistReference)
})
test.each([undefined, 0, -1])('does not use fallback topic count (%s)', async (topics) => {
  const order = rows[5].data as { product_selection: { result_limits: { topics?: number } } }
  order.product_selection.result_limits = { topics }
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'topic_count_missing' })
  expect(startTaskRun).not.toHaveBeenCalled()
})
test('missing historical source does not substitute a latest version', async () => {
  rows[3].versionNo = 3
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'pinned_input_missing', templateId: 'WZR-ZRODLA' })
  expect(runPlanStep).not.toHaveBeenCalled()
})
test('partial acceptance does not activate planning', async () => {
  jest.mocked(readPlanningReadiness).mockResolvedValue({ status: 'not_ready', orderRef: 'case', reason: 'pair_acceptance_incomplete', remainingDocuments: ['tov'] })
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'pair_acceptance_incomplete' })
  expect(startTaskRun).not.toHaveBeenCalled()
})
test('saved result replays without rerunning models even after readiness changes', async () => {
  const original = await execute()
  jest.mocked(readPlanningReadiness).mockResolvedValue({ status: 'not_ready', orderRef: 'case', reason: 'pair_not_current' })
  expect(await execute()).toEqual(original)
  expect(runPlanStep).toHaveBeenCalledTimes(1)
})

test('exhausted plan QA saves exact exception evidence and replays without creating another exception', async () => {
  jest.mocked(runPlanQaLoop).mockImplementation(async (context) => {
    context.taskRunIds.push('plan-qa')
    return { taskRunId: 'plan-qa', planVersionId: 'plan', verdict: 'needs_agent_fix', repairs: 2, readyForApproval: false,
      findings: [{ code: 'missing_evidence', path: 'KLI-PLAN.topics[0]', gap: 'No supporting source', severity: 'blocking', owner: 'agent' }] as never }
  })
  jest.mocked(openEscalation).mockImplementation(async (context) => {
    context.taskRunIds.push('exception-task')
    context.documentVersionIds.push('exception-version')
    return { versionId: 'exception-version', taskRunId: 'exception-task', data: {} as never }
  })
  const result = await execute()
  expect(result).toMatchObject({ status: 'completed', readyForApproval: false, escalationVersionId: 'exception-version',
    taskRunIds: expect.arrayContaining(['plan-qa', 'exception-task']), documentVersionIds: expect.arrayContaining(['plan', 'exception-version']) })
  expect(openEscalation).toHaveBeenCalledWith(ctx, expect.objectContaining({
    code: 'qa_exhausted', triggerStep: '6.3', blockedSteps: ['6.4'], resumeStep: '6.2',
    allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: expect.any(String), permittedNextStep: 'none' }],
    evidence: expect.arrayContaining([{ ref: 'plan-qa', fact: expect.any(String) }, { ref: 'plan', fact: expect.any(String) },
      { ref: 'KLI-PLAN.topics[0]', fact: 'missing_evidence: No supporting source' }]),
  }), expect.arrayContaining([{ document_id: 'KLI-PLAN@case', version: '1.0', status: 'draft' }]))
  expect(await execute()).toEqual(result)
  expect(openEscalation).toHaveBeenCalledTimes(1)
  expect(runPlanQaLoop).toHaveBeenCalledTimes(1)
})
test('concurrent duplicate calls claim once and preserve the in-flight run', async () => {
  const results = await Promise.all([execute(), execute()])
  expect(startTaskRun).toHaveBeenCalledTimes(1)
  expect(runPlanStep).toHaveBeenCalledTimes(1)
  expect(results.some((result) => result.status === 'completed')).toBe(true)
})
test('paused budget saves its task evidence with the generated plan and replays without invented QA or extra spend', async () => {
  jest.mocked(runPlanQaLoop).mockImplementation(async (context) => {
    runs.push(Object.assign(new AgencyResearchTaskRun(), { ...scope, orderRef: 'case', id: 'paused-plan-qa', stepId: '6.3', status: 'paused_budget',
      inputVersions: [context.orderVersion, { document_id: 'KLI-PLAN@case', version: '1.0', status: 'draft' }],
    }))
    runs.push(Object.assign(new AgencyResearchTaskRun(), { ...scope, orderRef: 'case', id: 'done-plan-repair', stepId: '6.2', status: 'done' }))
    context.taskRunIds.push('paused-plan-qa', 'done-plan-repair')
    context.ledger.assertCanSpend('6.3', 'qa', 4)
    throw new Error('unreachable')
  })
  jest.mocked(openEscalation).mockImplementation(async (context) => {
    context.taskRunIds.push('budget-exception-task')
    context.documentVersionIds.push('budget-exception-version')
    return { versionId: 'budget-exception-version', taskRunId: 'budget-exception-task', data: {} as never }
  })
  const paused = await execute()
  expect(paused).toMatchObject({ status: 'paused_budget', planVersionId: 'plan', qaTaskRunId: null, readyForApproval: false, escalationVersionId: 'budget-exception-version',
    taskRunIds: expect.arrayContaining(['paused-plan-qa', 'budget-exception-task']), documentVersionIds: expect.arrayContaining(['plan', 'budget-exception-version']) })
  expect(openEscalation).toHaveBeenCalledWith(ctx, expect.objectContaining({
    code: 'budget_exhausted', triggerStep: '6.3', resumeStep: '6.3', blockedSteps: ['6.3', '6.4'],
    summary: expect.stringContaining('0.00 PLN spent of 3 PLN'), evidence: [expect.objectContaining({ ref: 'paused-plan-qa' })],
    allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: 'The reason and who must act.', permittedNextStep: 'none' }],
  }), expect.arrayContaining([{ document_id: 'KLI-PLAN@case', version: '1.0', status: 'draft' }]))
  expect(await execute({ maxCostPln: 50 })).toEqual(paused)
  expect(runPlanStep).toHaveBeenCalledTimes(1)
  expect(runPlanQaLoop).toHaveBeenCalledTimes(1)
  expect(openEscalation).toHaveBeenCalledTimes(1)
})
test('interrupted failed activation is not retried', async () => {
  jest.mocked(runPlanStep).mockRejectedValue(new Error('interrupted'))
  await expect(execute()).rejects.toThrow('interrupted')
  expect(await execute()).toMatchObject({ status: 'execution_incomplete', reason: 'failed' })
  expect(runPlanStep).toHaveBeenCalledTimes(1)
})
