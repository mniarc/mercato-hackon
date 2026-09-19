/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../../data/entities'
import { readPostReview } from '../../postReview/read'
import { BudgetPausedError, createLedger } from '../../research/ledger'
import { openEscalation } from '../../research/escalate'
import type { StepContext } from '../../research/steps/context'
import { runPostStep } from '../../research/steps/post'
import { runPostQaLoop } from '../../research/steps/postQa'
import { startTaskRun, finishTaskRun } from '../../store'
import { readPostRevisionInputs, type PostRevisionReady } from '../readiness'
import { runPostRevision } from '../run'
import { postRevisionRequestSchema, type PostRevisionRequest } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../readiness', () => ({ readPostRevisionInputs: jest.fn() }))
jest.mock('../../research/steps/post', () => ({ runPostStep: jest.fn() }))
jest.mock('../../research/steps/postQa', () => ({ runPostQaLoop: jest.fn() }))
jest.mock('../../postReview/read', () => ({ readPostReview: jest.fn() }))
jest.mock('../../research/escalate', () => ({ openEscalation: jest.fn() }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn(), finishTaskRun: jest.fn() }))

const uuid = (last: number) => `11111111-1111-4111-8111-${String(last).padStart(12, '0')}`
const scope = { tenantId: 'tenant', organizationId: 'organization' }
const request: PostRevisionRequest = {
  orderRef: 'case', postVersionId: uuid(1), maxCostPln: 2,
  process: { workflowDefinitionId: uuid(4), workflowId: 'analysis', version: 1 },
  source: { submissionId: uuid(5), customerUserId: uuid(6), workflowInstanceId: uuid(7), invitationTaskId: uuid(8), agentRunId: uuid(9), eventId: 'post:task:hash' },
  originalText: '  Skróć pierwsze zdanie. Pozostałą treść zachowaj.  ',
}
const transaction = jest.fn()
const em = { transactional: transaction, flush: jest.fn() } as unknown as EntityManager
const models = { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }
let runs: AgencyResearchTaskRun[]
let ready: PostRevisionReady
let authorContext: StepContext
const execute = (override: Partial<PostRevisionRequest> = {}) => runPostRevision({ em, scope,
  request: { ...request, ...override }, models, runner: 'orchestrator', runAgent: jest.fn() })

beforeEach(() => {
  jest.resetAllMocks()
  runs = []
  transaction.mockImplementation(async (work: (manager: EntityManager) => Promise<unknown>) => work(em))
  ready = {
    status: 'ready', order: { brand: 'Pinned brand' }, planVersionId: 'plan', selectedTopicId: 'TOP02', instructionTaskRunId: 'compiler', selectionSubmissionId: uuid(3),
    orderInput: { document_id: 'WEW-DANE-ZAMOWIENIA@case', version: '1.0', versionId: 'order', status: 'approved', data: {} },
    instruction: { document_id: 'WEW-ZLECENIE-POSTU@case', version: '2.0', versionId: uuid(2), status: 'ready_for_review', data: {} },
    tov: { document_id: 'KLI-TOV@case', version: '3.0', versionId: 'tov', status: 'approved', data: {} },
    previousPost: { document_id: 'KLI-POST@case', version: '4.0', versionId: request.postVersionId, status: 'ready_for_review', data: { text: 'Previous exact text' } },
  } as PostRevisionReady
  jest.mocked(readPostRevisionInputs).mockImplementation(async () => ready)
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    if (entity === AgencyResearchDocument) return Object.assign(new AgencyResearchDocument(), { currentVersionId: request.postVersionId }) as never
    return (runs.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) =>
      value && typeof value === 'object' && '$in' in value ? (value.$in as unknown[]).includes(Reflect.get(row, key)) : Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(startTaskRun).mockImplementation(async (_em, tenantScope, input) => {
    const run = Object.assign(new AgencyResearchTaskRun(), { ...tenantScope, ...input, id: 'activation', status: 'running' })
    runs.push(run); return run
  })
  jest.mocked(finishTaskRun).mockImplementation(async (_em, run, result) => { Object.assign(run, result) })
  jest.mocked(runPostStep).mockImplementation(async (ctx) => {
    authorContext = { ...ctx, postOutputs: { ...ctx.postOutputs! } }
    ctx.postOutputs!.post = { ...ready.previousPost, version: '5.0', versionId: 'draft', status: 'draft', data: {} }
    ctx.taskRunIds.push('author'); ctx.documentVersionIds.push('draft')
    return { status: 'done', taskRunId: 'author', versionId: 'draft' }
  })
  jest.mocked(runPostQaLoop).mockImplementation(async (ctx) => {
    ctx.taskRunIds.push('editor'); ctx.documentVersionIds.push('reviewed')
    return { taskRunId: 'editor', postVersionId: 'reviewed', verdict: 'pass_for_draft', findings: [], repairs: 0 }
  })
  jest.mocked(readPostReview).mockResolvedValue({ orderRef: 'case', documentId: 'post', versionId: 'reviewed', version: '6.0', templateId: 'WZR-POST',
    isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'ready_for_review', clientViewMd: 'Review', simulationFlag: false,
    qa: { state: 'assessed', taskRunId: 'editor', status: 'done', verdict: 'pass_for_draft' } })
})

test('reuses exact previous text and pinned producers, preserving directive and replaying without new spend', async () => {
  const result = await execute()
  expect(result).toMatchObject({ status: 'completed', previousPostVersionId: request.postVersionId, postVersionId: 'reviewed', readyForReview: true })
  expect(authorContext.postOutputs?.post).toEqual(ready.previousPost)
  expect(authorContext.postInputs).toEqual({ instruction: ready.instruction, tov: ready.tov })
  expect(authorContext.repairFindings).toEqual([expect.objectContaining({ owner: 'client', fix_step: '7.2', fix_hint: request.originalText })])
  expect(runs[0].summary).toMatchObject({ originalText: request.originalText, source: request.source, limits: { maxCostPln: 2 } })
  expect(await execute({ maxCostPln: 99 })).toEqual(result)
  expect(runPostStep).toHaveBeenCalledTimes(1)
  expect(runPostQaLoop).toHaveBeenCalledWith(expect.anything(), { postStep: runPostStep })
})

test('same saved submission cannot be replayed with a different source or directive', async () => {
  await execute()
  await expect(execute({ source: { ...request.source, invitationTaskId: uuid(10) } })).rejects.toThrow('saved client directive')
  await expect(execute({ originalText: 'Replace the whole topic' })).rejects.toThrow('saved client directive')
  expect(runPostStep).toHaveBeenCalledTimes(1)
})

test('stale foundation prevents activation; no cap is silently supplied', async () => {
  jest.mocked(readPostRevisionInputs).mockResolvedValue({ status: 'not_ready', orderRef: 'case', reason: 'post_input_changed' })
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'post_input_changed' })
  expect(startTaskRun).not.toHaveBeenCalled()
  expect(postRevisionRequestSchema.safeParse({ ...request, maxCostPln: undefined }).success).toBe(false)
})

test('negative QA retains the saved exception without inviting or inheriting acceptance', async () => {
  jest.mocked(runPostQaLoop).mockResolvedValue({ taskRunId: 'editor', postVersionId: 'reviewed', verdict: 'reject', findings: [], repairs: 2, escalationVersionId: 'exception' })
  jest.mocked(readPostReview).mockResolvedValue(null)
  expect(await execute()).toMatchObject({ status: 'completed', readyForReview: false, qaVerdict: 'reject', escalationVersionId: 'exception' })
})

test('budget pause keeps the draft and exact task evidence; replay cannot silently resume', async () => {
  jest.mocked(runPostQaLoop).mockImplementationOnce(async (ctx) => {
    runs.push(Object.assign(new AgencyResearchTaskRun(), { ...scope, orderRef: request.orderRef, id: 'paused-editor', stepId: '7.3', status: 'paused_budget', inputVersions: [ctx.orderVersion] }))
    ctx.taskRunIds.push('paused-editor')
    throw new BudgetPausedError(createLedger({ maxPln: 2 }).snapshot(), 3)
  })
  jest.mocked(openEscalation).mockResolvedValue({ taskRunId: 'exception-task', versionId: 'exception', data: {} } as never)
  const result = await execute()
  expect(result).toMatchObject({ status: 'paused_budget', postVersionId: 'draft', readyForReview: false, escalationVersionId: 'exception' })
  expect(openEscalation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ triggerStep: '7.3', code: 'budget_exhausted' }), [expect.objectContaining({ document_id: ready.orderInput.document_id })])
  expect(await execute()).toEqual(result)
  expect(runPostStep).toHaveBeenCalledTimes(1)
})
