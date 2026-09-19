/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode } from '@mikro-orm/core'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import type { TemplateId } from '../../../data/schemas/envelope'
import { planDataSchema } from '../../../data/schemas/plan'
import { briefDataSchema } from '../../../data/schemas/brief'
import { strategiaDataSchema } from '../../../data/schemas/strategia'
import { tovDataSchema } from '../../../data/schemas/tov'
import { zrodlaDataSchema } from '../../../data/schemas/zrodla'
import { readPlanAcceptance } from '../../planAcceptance/read'
import type { PlanReviewReady } from '../../planAcceptance/contracts'
import { documentIdFor } from '../../research/envelope'
import { assemblePostInstruction } from '../../research/steps/postInstruction'
import { renderZleceniePostu } from '../../research/render/zleceniePostu'
import { startTaskRun, saveDocumentVersion, finishTaskRun } from '../../store'
import { runPostInstructionExecution } from '../run'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../planAcceptance/read', () => ({ readPlanAcceptance: jest.fn() }))
jest.mock('../../research/steps/postInstruction', () => ({ assemblePostInstruction: jest.fn() }))
jest.mock('../../research/render/zleceniePostu', () => ({ renderZleceniePostu: jest.fn(() => '# Instruction') }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn(), saveDocumentVersion: jest.fn(), finishTaskRun: jest.fn() }))

const scope = { tenantId: 'tenant', organizationId: 'organization' }
const orderRef = 'case'
const planVersionId = '11111111-1111-4111-8111-111111111111'
const firstSubmission = '22222222-2222-4222-8222-222222222222'
const nextSubmission = '33333333-3333-4333-8333-333333333333'
const em = { transactional: jest.fn(), flush: jest.fn() } as unknown as EntityManager
let documents: AgencyResearchDocument[]
let versions: AgencyResearchDocumentVersion[]
let runs: AgencyResearchTaskRun[]
let acceptance: PlanReviewReady
let planData: { topics: { topic_id: string }[]; recommendation: { topic_id: string }; selected_topic: { topic_id: null; real_approval: false } }

const execute = (selectionSubmissionId?: string) => runPostInstructionExecution({ em, scope, request: { orderRef, planVersionId, ...(selectionSubmissionId ? { selectionSubmissionId } : {}) } })

beforeEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
  jest.mocked(em.transactional).mockImplementation(async (work) => work(em))
  runs = []
  const templates: TemplateId[] = ['WZR-PLAN', 'WZR-BRIEF', 'WZR-STRATEGIA', 'WZR-TOV', 'WZR-ZRODLA', 'WZR-KONKURENCJA', 'WZR-ZAMOWIENIE']
  documents = templates.map((templateId, index) => Object.assign(new AgencyResearchDocument(), {
    ...scope, orderRef, templateId, id: `document-${index}`, status: 'approved', currentVersionId: index === 0 ? planVersionId : `version-${index}`,
  }))
  planData = { topics: [{ topic_id: 'TOP01' }, { topic_id: 'TOP02' }], recommendation: { topic_id: 'TOP01' }, selected_topic: { topic_id: null, real_approval: false } }
  versions = documents.map((document) => Object.assign(new AgencyResearchDocumentVersion(), {
    ...scope, orderRef, id: document.currentVersionId, documentId: document.id, templateId: document.templateId,
    versionNo: 1, status: 'approved', simulationFlag: false, data: { source: document.templateId },
  }))
  versions[0].data = planData
  versions[0].inputVersions = templates.slice(1).map((templateId) => ({ document_id: documentIdFor(templateId, orderRef), version: '1.0', status: 'approved' }))
  versions[6].data = {
    product_selection: { sku: 'configured', offer_version: 'v1', price_net: 1, currency: 'PLN', result_limits: { topics: 2 } },
    brand: { display_name: 'Brand', website_url: 'https://example.test' }, market_language: { market: 'PL', language: 'pl' },
  }
  acceptance = {
    status: 'ready', orderRef,
    plan: { documentId: 'document-0', versionId: planVersionId, version: '1.0', templateId: 'WZR-PLAN',
      isCurrent: true, documentStatus: 'approved', versionStatus: 'approved', simulationFlag: false, clientViewMd: '# Plan' },
    topics: [{ topicId: 'TOP01', title: 'Recommended', recommended: true }, { topicId: 'TOP02', title: 'Chosen', recommended: false }],
    recommendedTopicId: 'TOP01', qaTaskRunId: 'plan-qa', briefVersionId: 'version-1', strategyVersionId: 'version-2', tovVersionId: 'version-3',
    receipt: { person: 'customer', at: '2026-09-19T12:00:00.000Z', scope: 'plan', version: '1.0', documentId: 'document-0', documentVersionId: planVersionId,
      approvePlan: true, selectedTopicId: 'TOP02', briefVersionId: 'version-1', strategyVersionId: 'version-2', tovVersionId: 'version-3', qaTaskRunId: 'plan-qa',
      source: { kind: 'agency_plan_acceptance', submissionId: firstSubmission, eventId: 'event', workflowInstanceId: 'workflow', agentRunId: 'agent', invitationTaskId: 'task' } },
  }
  jest.mocked(readPlanAcceptance).mockImplementation(async () => acceptance)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    const rows = entity === AgencyResearchDocument ? documents : versions
    return (rows.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
  for (const schema of [planDataSchema, briefDataSchema, strategiaDataSchema, tovDataSchema, zrodlaDataSchema]) {
    jest.spyOn(schema, 'safeParse').mockImplementation((data: unknown) => ({ success: true, data }) as never)
  }
  jest.mocked(assemblePostInstruction).mockImplementation((input) => ({ data: { selected_item: { topic_id: input.plan.selected_topic.topic_id } }, issues: [] }) as never)
  jest.mocked(startTaskRun).mockImplementation(async (_em, tenantScope, input) => {
    const run = Object.assign(new AgencyResearchTaskRun(), { ...tenantScope, ...input, id: `task-${runs.length + 1}`, status: 'running' })
    runs.unshift(run)
    return run
  })
  jest.mocked(saveDocumentVersion).mockImplementation(async () => {
    let document = documents.find((row) => row.templateId === 'WZR-ZLECENIE-POSTU')
    if (!document) {
      document = Object.assign(new AgencyResearchDocument(), { ...scope, orderRef, id: 'instruction-document', templateId: 'WZR-ZLECENIE-POSTU' })
      documents.push(document)
    }
    const versionId = `instruction-${runs.length}`
    document.currentVersionId = versionId
    document.status = 'ready_for_review'
    return { document, version: { id: versionId }, envelope: { version: `${runs.length}.0` } } as never
  })
  jest.mocked(finishTaskRun).mockImplementation(async (_em, run, outcome) => { Object.assign(run, outcome) })
})

test('uses the recorded choice, not the recommendation, without mutating the approved plan', async () => {
  const result = await execute(firstSubmission)
  expect(result).toMatchObject({ status: 'ready', selectedTopicId: 'TOP02', selectionSubmissionId: firstSubmission, instructionVersionId: 'instruction-1' })
  expect(planData.selected_topic).toEqual({ topic_id: null, real_approval: false })
  expect(assemblePostInstruction).toHaveBeenCalledWith(expect.objectContaining({
    plan: expect.objectContaining({ selected_topic: expect.objectContaining({ topic_id: 'TOP02', real_approval: true, decision_id: firstSubmission }) }),
    planVersion: { document_id: 'KLI-PLAN@case', version: '1.0', status: 'approved' },
  }))
  expect(saveDocumentVersion).toHaveBeenCalledWith(em, scope, expect.objectContaining({ templateId: 'WZR-ZLECENIE-POSTU', simulation: false }))
  expect(startTaskRun).toHaveBeenCalledWith(em, scope, expect.objectContaining({ stepId: '6.7', runner: 'system', models: {} }))
  expect(findOneWithDecryption).toHaveBeenNthCalledWith(1, em, AgencyResearchDocument, expect.objectContaining({ ...scope, orderRef, templateId: 'WZR-BRIEF' }), { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
  expect(runs[0].summary).toMatchObject({ selectionReceipt: acceptance.receipt, inputVersions: expect.arrayContaining([{ document_id: 'KLI-TOV@case', version: '1.0', status: 'approved' }]) })
  expect(renderZleceniePostu).toHaveBeenCalledTimes(1)
})

test('replays the same selection without creating another task or instruction', async () => {
  await execute(firstSubmission)
  expect(await execute(firstSubmission)).toMatchObject({ status: 'ready', instructionVersionId: 'instruction-1', replayed: true })
  expect(startTaskRun).toHaveBeenCalledTimes(1)
  expect(assemblePostInstruction).toHaveBeenCalledTimes(1)
})

test('a new explicit choice supersedes the instruction through the same document', async () => {
  await execute(firstSubmission)
  acceptance.receipt = { ...acceptance.receipt!, selectedTopicId: 'TOP01', source: { ...acceptance.receipt!.source, submissionId: nextSubmission } }
  expect(await execute(nextSubmission)).toMatchObject({ status: 'ready', selectedTopicId: 'TOP01', instructionDocumentId: 'instruction-document', instructionVersionId: 'instruction-2' })
  expect(documents.filter((row) => row.templateId === 'WZR-ZLECENIE-POSTU')).toHaveLength(1)
  expect(planData.selected_topic.real_approval).toBe(false)
})

test('rejects a superseded native selection before compilation', async () => {
  expect(await execute(nextSubmission)).toMatchObject({ status: 'not_ready', reason: 'selection_superseded' })
  expect(assemblePostInstruction).not.toHaveBeenCalled()
  expect(startTaskRun).not.toHaveBeenCalled()
})

test('missing consent never adopts the recommended topic', async () => {
  acceptance.receipt = null
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'selection_missing' })
  expect(assemblePostInstruction).not.toHaveBeenCalled()
})

test('stale evidence blocks readiness even when an instruction was previously saved', async () => {
  await execute()
  documents[4].currentVersionId = 'newer-sources'
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'dependency_not_current', templateId: 'WZR-ZRODLA' })
  expect(assemblePostInstruction).toHaveBeenCalledTimes(1)
})

test('retains compiler blockers instead of exposing a ready production handoff', async () => {
  jest.mocked(assemblePostInstruction).mockReturnValue({ data: {}, issues: [{ code: 'NO_EVIDENCE', severity: 'blocking', detail: 'Missing evidence' }] } as never)
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'compiler_blocked', instructionVersionId: 'instruction-1', issueCodes: ['NO_EVIDENCE'] })
  expect(saveDocumentVersion).toHaveBeenCalledWith(em, scope, expect.objectContaining({ status: 'blocked' }))
  expect(await execute()).toMatchObject({ status: 'not_ready', reason: 'compiler_blocked' })
  expect(assemblePostInstruction).toHaveBeenCalledTimes(1)
})
