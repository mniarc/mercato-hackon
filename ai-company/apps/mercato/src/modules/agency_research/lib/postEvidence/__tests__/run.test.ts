/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../../data/entities'
import { readPostReview } from '../../postReview/read'
import { runSourcesStep } from '../../research/steps/sources'
import { runPostQaLoop } from '../../research/steps/postQa'
import { runPostStep } from '../../research/steps/post'
import { BudgetPausedError, createLedger } from '../../research/ledger'
import { openEscalation } from '../../research/escalate'
import { startTaskRun, finishTaskRun } from '../../store'
import { readPostEvidenceInputs } from '../readiness'
import { runPostEvidence } from '../run'
import { runPostEvidenceRequestSchema, type RunPostEvidenceRequest } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../readiness', () => ({ readPostEvidenceInputs: jest.fn() }))
jest.mock('../../research/steps/sources', () => ({ runSourcesStep: jest.fn(), proofSourceVisibility: jest.requireActual('../../research/steps/sources').proofSourceVisibility }))
jest.mock('../../research/steps/postQa', () => ({ runPostQaLoop: jest.fn() }))
jest.mock('../../research/steps/post', () => ({ runPostStep: jest.fn() }))
jest.mock('../../postReview/read', () => ({ readPostReview: jest.fn() }))
jest.mock('../../research/escalate', () => ({ openEscalation: jest.fn() }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn(), finishTaskRun: jest.fn() }))

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const request: RunPostEvidenceRequest = { orderRef: 'case', postVersionId: uuid(3), instructionVersionId: uuid(4), qaTaskRunId: uuid(5), maxCostPln: 2 }
const models = { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }
const transaction = jest.fn()
const em = { transactional: transaction, flush: jest.fn() } as unknown as EntityManager
type Ready = Exclude<Awaited<ReturnType<typeof readPostEvidenceInputs>>, { status: 'not_ready' }>
let ready: Ready
let runs: AgencyResearchTaskRun[]
const execute = (override: Partial<RunPostEvidenceRequest> = {}) => runPostEvidence({
  em, scope, request: { ...request, ...override }, models, runner: 'orchestrator', runAgent: jest.fn(),
})

beforeEach(() => {
  jest.resetAllMocks()
  runs = []
  transaction.mockImplementation(async (work: (manager: EntityManager) => Promise<unknown>) => work(em))
  const pin = (id: string) => ({ document_id: id, version: '1.0', versionId: id, status: 'approved', data: {} })
  ready = {
    status: 'ready', order: { brand: 'Exact brand' }, orderInput: pin('order'), instruction: pin(request.instructionVersionId),
    tov: pin('tov'), selectionSubmissionId: uuid(6), previousPost: { ...pin(request.postVersionId), status: 'draft', data: { text: 'Exact unchanged post.' } },
    qa: Object.assign(new AgencyResearchTaskRun(), { id: request.qaTaskRunId, status: 'to_fix',
      outputVersionId: request.postVersionId, qaResult: { verdict: 'needs_fix', original: true }, agentRunIds: ['original-editor'],
      cost: { total: 0.1, entries: [{ costPln: 0.1 }] } }),
    evidence: { claim: 'Exact unchanged post.', question: 'Does the original source support this?', targetStep: '3.2', sourceRefs: ['S01'], returnStep: '7.3' },
    sources: [{ source_id: 'S01', text: 'Exact unchanged post.', source_visibility: 'client_private' }],
  } as Ready
  jest.mocked(readPostEvidenceInputs).mockImplementation(async () => ready)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    if (entity === AgencyResearchDocument) return Object.assign(new AgencyResearchDocument(), { currentVersionId: request.postVersionId }) as never
    const id = (query as { id: string }).id
    return (id === ready.qa.id ? ready.qa : runs.find((run) => run.id === id)) as never
  })
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
  jest.mocked(startTaskRun).mockImplementation(async (_em, tenantScope, input) => {
    const run = Object.assign(new AgencyResearchTaskRun(), { ...tenantScope, ...input, id: uuid(7), status: 'running' })
    runs.push(run); return run
  })
  jest.mocked(finishTaskRun).mockImplementation(async (_em, run, outcome) => { Object.assign(run, outcome) })
  jest.mocked(runSourcesStep).mockResolvedValue({ data: {
    facts: [{ fact_id: 'F01', claim: 'Exact unchanged post.', source_ids: ['S01'], locator: { quote: 'Exact unchanged post.' },
      limitation: 'Private company declaration.', kind: 'first_party_claim', use_scope: ['internal'] }],
    sources: [{ source_id: 'S01', source_visibility: 'client_private' }],
  }, issues: [] } as never)
  jest.mocked(runPostQaLoop).mockImplementation(async (ctx, deps) => {
    expect(deps.evidenceReturn?.task).toBe(ready.qa)
    ready.qa.cost = { total: 0.2, entries: [{ costPln: 0.2 }] }
    ready.qa.agentRunIds = ['return-editor']
    ctx.taskRunIds.push(ready.qa.id); ctx.documentVersionIds.push(uuid(8))
    return { taskRunId: ready.qa.id, postVersionId: uuid(8), verdict: 'pass_for_draft', findings: [], repairs: 0 }
  })
  jest.mocked(readPostReview).mockResolvedValue({ isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'ready_for_review', simulationFlag: false,
    qa: { state: 'assessed', taskRunId: ready.qa.id, verdict: 'pass_for_draft' } } as never)
  jest.mocked(openEscalation).mockResolvedValue({ versionId: uuid(9) } as never)
})

test('extracts only scoped saved sources and returns grounded evidence to the original QA, preserving history and replay', async () => {
  const result = await execute()
  expect(result).toMatchObject({ status: 'completed', requestedQaTaskRunId: request.qaTaskRunId,
    requestedPostVersionId: request.postVersionId, postVersionId: uuid(8), readyForReview: true })
  expect(runSourcesStep).toHaveBeenCalledWith(expect.objectContaining({ sources: ready.sources, order: ready.order }))
  expect(runPostQaLoop).toHaveBeenCalledWith(expect.objectContaining({ postInputs: { instruction: ready.instruction, tov: ready.tov } }), {
    postStep: runPostStep, evidenceReturn: { task: ready.qa, packet: expect.objectContaining({ request: ready.evidence,
      facts: [expect.objectContaining({ quote: 'Exact unchanged post.', sourceVisibility: 'client_private', factId: `${uuid(7)}:F01` })] }) },
  })
  expect(ready.qa.summary).toMatchObject({ evidenceContinuation: { sourceTaskRunId: uuid(7),
    originalQa: { qaResult: { verdict: 'needs_fix', original: true }, outputVersionId: request.postVersionId } } })
  expect(ready.qa.agentRunIds).toEqual(['original-editor', 'return-editor'])
  expect((ready.qa.cost as { total: number }).total).toBeCloseTo(0.3)
  expect(startTaskRun).toHaveBeenCalledTimes(1)
  expect(startTaskRun).toHaveBeenCalledWith(em, scope, expect.objectContaining({ stepId: '3.2' }))
  expect(await execute({ maxCostPln: 99 })).toEqual(result)
  expect(runSourcesStep).toHaveBeenCalledTimes(1)
  expect(runPostStep).not.toHaveBeenCalled()
})

test('replay cannot change the original post or instruction and missing cap is not defaulted', async () => {
  await execute()
  await expect(execute({ postVersionId: uuid(98) })).rejects.toThrow('saved post/instruction')
  await expect(execute({ instructionVersionId: uuid(99) })).rejects.toThrow('saved post/instruction')
  expect(runPostEvidenceRequestSchema.safeParse({ ...request, maxCostPln: undefined }).success).toBe(false)
  expect(runPostEvidenceRequestSchema.safeParse({ ...request, claim: 'Caller fabricated' }).success).toBe(false)
})

test('unavailable scoped request stops before extraction or spending', async () => {
  jest.mocked(readPostEvidenceInputs).mockResolvedValue({ status: 'not_ready', orderRef: 'case', reason: 'saved_evidence_request_missing' })
  await expect(execute()).resolves.toMatchObject({ status: 'not_ready', reason: 'saved_evidence_request_missing' })
  expect(startTaskRun).not.toHaveBeenCalled()
  expect(runSourcesStep).not.toHaveBeenCalled()
})

test('budget exhaustion retains the original evidence request and uses the existing owned exception', async () => {
  jest.mocked(runSourcesStep).mockRejectedValue(new BudgetPausedError(createLedger({ maxPln: 2 }).snapshot(), 3))
  await expect(execute()).resolves.toMatchObject({ status: 'paused_budget', readyForReview: false, escalationVersionId: uuid(9) })
  expect(openEscalation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: 'budget_exhausted', evidence: expect.arrayContaining([
    expect.objectContaining({ ref: request.qaTaskRunId, fact: ready.evidence.claim }),
  ]) }), expect.anything())
  expect(runPostQaLoop).not.toHaveBeenCalled()
})
