/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../../data/entities'
import { limits } from '../../../data/templates'
import { readPostReview } from '../../postReview/read'
import { BudgetPausedError, createLedger } from '../../research/ledger'
import type { StepContext } from '../../research/steps/context'
import { runPostStep } from '../../research/steps/post'
import { runPostQaLoop } from '../../research/steps/postQa'
import { startTaskRun, finishTaskRun } from '../../store'
import { readPostExecutionInputs, type PostExecutionReady } from '../readiness'
import { runPostExecution } from '../run'
import type { PostExecutionRequest } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../readiness', () => ({ readPostExecutionInputs: jest.fn() }))
jest.mock('../../research/steps/post', () => ({ runPostStep: jest.fn() }))
jest.mock('../../research/steps/postQa', () => ({ runPostQaLoop: jest.fn() }))
jest.mock('../../postReview/read', () => ({ readPostReview: jest.fn() }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn(), finishTaskRun: jest.fn() }))

const scope = { tenantId: 'tenant', organizationId: 'organization' }
const request: PostExecutionRequest = {
  orderRef: 'case', instructionVersionId: '11111111-1111-4111-8111-111111111111',
  selectionSubmissionId: '22222222-2222-4222-8222-222222222222', maxCostPln: 3,
  process: { workflowDefinitionId: '33333333-3333-4333-8333-333333333333', workflowId: 'analysis', version: 1 },
}
const models = { extract: 'extract', synthesis: 'synthesis', qa: 'qa' }
const transaction = jest.fn()
const em = { transactional: transaction, flush: jest.fn() } as unknown as EntityManager
let runs: AgencyResearchTaskRun[]
let ready: PostExecutionReady
let context: StepContext
const execute = (override: Partial<PostExecutionRequest> = {}) => runPostExecution({
  em, scope, request: { ...request, ...override }, models, runner: 'orchestrator', runAgent: jest.fn(),
})

beforeEach(() => {
  jest.resetAllMocks()
  runs = []
  let tail = Promise.resolve()
  transaction.mockImplementation(async (work: (manager: EntityManager) => Promise<unknown>) => {
    const previous = tail
    let release = () => {}
    tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    try { return await work(em) } finally { release() }
  })
  ready = {
    status: 'ready', order: { brand: 'Pinned brand' },
    instruction: { document_id: 'WEW-ZLECENIE-POSTU@case', version: '2.0', versionId: request.instructionVersionId, status: 'ready_for_review', data: { exact: 'instruction' } },
    tov: { document_id: 'KLI-TOV@case', version: '3.0', versionId: 'tov', status: 'approved', data: { exact: 'voice' } },
    orderInput: { document_id: 'KLI-ZAMOWIENIE@case', version: '1.0', versionId: 'order', status: 'approved', data: {} },
    planVersionId: 'plan', selectedTopicId: 'chosen-topic', instructionTaskRunId: 'compiler',
  } as PostExecutionReady
  jest.mocked(readPostExecutionInputs).mockImplementation(async () => ready)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    if (entity === AgencyResearchDocument) return Object.assign(new AgencyResearchDocument(), { id: 'brief' }) as never
    return (runs.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
  jest.mocked(startTaskRun).mockImplementation(async (_em, tenantScope, input) => {
    const run = Object.assign(new AgencyResearchTaskRun(), { ...tenantScope, ...input, id: `activation-${runs.length}`, status: 'running' })
    runs.push(run)
    return run
  })
  jest.mocked(finishTaskRun).mockImplementation(async (_em, run, result) => { Object.assign(run, result) })
  jest.mocked(runPostStep).mockImplementation(async (ctx) => {
    context = ctx
    ctx.postOutputs!.post = { document_id: 'KLI-POST@case', version: '1.0', versionId: 'draft', status: 'draft', data: {} }
    ctx.taskRunIds.push('author'); ctx.documentVersionIds.push('draft')
    return { taskRunId: 'author', versionId: 'draft', status: 'done' }
  })
  jest.mocked(runPostQaLoop).mockImplementation(async (ctx) => {
    ctx.taskRunIds.push('editor'); ctx.documentVersionIds.push('reviewed')
    return { taskRunId: 'editor', postVersionId: 'reviewed', verdict: 'pass_for_draft', findings: [], repairs: 0 }
  })
  jest.mocked(readPostReview).mockResolvedValue({ orderRef: 'case', documentId: 'post', versionId: 'reviewed', version: '2.0',
    templateId: 'WZR-POST', isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'ready_for_review',
    clientViewMd: 'Draft', simulationFlag: false, qa: { state: 'assessed', taskRunId: 'editor', status: 'done', verdict: 'pass_for_draft' } })
})

test('pins the accepted instruction/voice, snapshots limits, and replays without another model run', async () => {
  const result = await execute()
  expect(result).toMatchObject({ status: 'completed', postVersionId: 'reviewed', qaTaskRunId: 'editor', readyForReview: true })
  expect(context.postInputs).toEqual({ instruction: ready.instruction, tov: ready.tov })
  expect(context.postQaRepairAttempts).toBe(limits.content.postRepairAttempts)
  expect(runs[0].summary).toMatchObject({ selectedTopicId: 'chosen-topic', limits: { maxCostPln: 3, postRepairAttempts: limits.content.postRepairAttempts } })
  expect(await execute({ maxCostPln: 99 })).toEqual(result)
  expect(runPostStep).toHaveBeenCalledTimes(1)
  expect(startTaskRun).toHaveBeenCalledTimes(1)
})

test('concurrent calls reserve one activation and do not spend twice', async () => {
  const results = await Promise.all([execute(), execute()])
  expect(results.some((result) => result.status === 'completed')).toBe(true)
  expect(results.every((result) => result.status === 'completed' || result.status === 'execution_incomplete')).toBe(true)
  expect(runPostStep).toHaveBeenCalledTimes(1)
  expect(startTaskRun).toHaveBeenCalledTimes(1)
})

test('failed author retains an interrupted receipt rather than relaunching on retry', async () => {
  jest.mocked(runPostStep).mockRejectedValueOnce(new Error('author failed'))
  await expect(execute()).rejects.toThrow('author failed')
  expect(await execute()).toMatchObject({ status: 'execution_incomplete', reason: 'failed', activationTaskRunId: 'activation-0' })
  expect(runPostStep).toHaveBeenCalledTimes(1)
})

test('a missing current selection stops before activation', async () => {
  jest.mocked(readPostExecutionInputs).mockResolvedValue({ status: 'not_ready', orderRef: 'case', reason: 'selection_superseded' })
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'selection_superseded' })
  expect(startTaskRun).not.toHaveBeenCalled()
  expect(runPostStep).not.toHaveBeenCalled()
})

test('a budget pause saves the authored version and replays it without entering QA again', async () => {
  jest.mocked(runPostQaLoop).mockRejectedValueOnce(new BudgetPausedError(createLedger({ maxPln: 3 }).snapshot(), 4))
  const result = await execute()
  expect(result).toMatchObject({ status: 'paused_budget', postVersionId: 'draft', readyForReview: false })
  expect(await execute()).toEqual(result)
  expect(runPostQaLoop).toHaveBeenCalledTimes(1)
})
