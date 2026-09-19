/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { zrodla } from '../../../__fixtures__/planJourney'
import type { UstaleniaData } from '../../../data/schemas/ustalenia'
import { readBriefReview } from '../../briefReview/read'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { runBriefStep } from '../../research/steps/brief'
import { runBriefQaLoop } from '../../research/steps/briefQa'
import { runQaLoop } from '../../research/steps/qa'
import { runFreezeStep } from '../../research/steps/freeze'
import { documentIdFor } from '../../research/envelope'
import { BRIEF_ANSWER_AGENT_ID } from '../ids'
import { briefRevisionResultSchema, type BriefRevisionRequest } from '../contracts'
import { runBriefRevision } from '../run'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../briefReview/read', () => ({ readBriefReview: jest.fn() }))
jest.mock('../../store', () => ({ currentInputVersion: jest.fn(), startTaskRun: jest.fn(), finishTaskRun: jest.fn(), saveDocumentVersion: jest.fn() }))
jest.mock('../../research/steps/brief', () => ({ runBriefStep: jest.fn() }))
jest.mock('../../research/steps/briefQa', () => ({ runBriefQaLoop: jest.fn() }))
jest.mock('../../research/steps/qa', () => ({ runQaLoop: jest.fn() }))
jest.mock('../../research/steps/freeze', () => ({ runFreezeStep: jest.fn() }))

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const scope = { tenantId: id(1), organizationId: id(2) }
const request: BriefRevisionRequest = {
  orderRef: 'case', briefVersionId: id(3), originalText: 'Our audience is agency owners.', maxCostPln: 2,
  source: { submissionId: id(4), eventId: 'brief:task:hash', customerUserId: id(5), workflowInstanceId: id(6), invitationTaskId: id(7) },
}
const findings: UstaleniaData = {
  field_map: [{ field_key: 'priority_audience', proposed_value: 'proposal', evidence_ids: ['F01'], provenance: 'inferred', readiness: 'conditional', decision_state: 'awaiting_client', priority: 'must', reason: 'Client decides', status: 'hypothesis' }],
  questions: [{ question_id: 'Q01', question: 'Who is your audience?', hint: 'Choose', reason: 'Required', brief_field: 'priority_audience', priority: 'must', if_unanswered: 'Wait', state: 'open' }],
  evidence_requests: [], readiness: [], research_return: [],
}
const dim = { finding: 'Observed', sample_ids: [], interpretation_limit: null }
const inputs: Record<string, unknown> = {
  'WZR-ZAMOWIENIE': { product_selection: { sku: 'START', offer_version: 'v1', price_net: 1, currency: 'PLN' }, brand: { display_name: 'FLOW', website_url: 'https://example.test' }, market_language: { market: 'PL', language: 'pl' } },
  'WZR-USTALENIA': findings,
  'WZR-ZRODLA': zrodla(),
  'WZR-AUDYT': { offer_map: [], buyer_map: [], message_map: [], voice_audit: { sample_size: 'one', formality: dim, directness: dim, technical_level: dim, emotion: dim, claim_certainty: dim, recurring_phrases: dim, channel_difference: dim, future_voice_status: 'Client decides' }, journey: [], relationship: [], gaps: [], reusable_assets: [] },
  'WZR-KONKURENCJA': { selection: [], cards: [], parity_claims: [], alternative_routes: [], difference_candidates: [], channels: [], implications: [] },
}
const versions = Object.entries(inputs).map(([templateId, data], index) => ({ templateId, versionId: id(20 + index), document_id: documentIdFor(templateId as 'WZR-BRIEF', 'case'), version: '1.0', status: 'draft' as const, data }))
const transaction = jest.fn()
const em = { transactional: transaction, flush: jest.fn() } as unknown as EntityManager
const runs: AgencyResearchTaskRun[] = []
const runAgent = jest.fn()
const execute = (override = request) => runBriefRevision({ em, scope, request: override, runAgent, runner: 'orchestrator', models: { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' } })

beforeEach(() => {
  jest.clearAllMocks()
  runs.length = 0
  transaction.mockImplementation(async (work: (manager: EntityManager) => Promise<unknown>) => work(em))
  jest.mocked(readBriefReview).mockResolvedValue({
    orderRef: 'case', documentId: id(8), versionId: request.briefVersionId, version: '1.0', templateId: 'WZR-BRIEF',
    isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'draft', clientViewMd: 'Brief',
    questions: findings.questions, qa: { state: 'assessed', taskRunId: id(9), status: 'done', verdict: 'needs_client_data' },
  })
  jest.mocked(currentInputVersion).mockImplementation(async (_em, _scope, _orderRef, templateId) => templateId === 'WZR-BRIEF'
    ? { document_id: 'KLI-BRIEF@case', version: '1.0', status: 'draft', versionId: request.briefVersionId, data: {} }
    : versions.find((version) => version.templateId === templateId) ?? null)
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    if (entity === AgencyResearchDocumentVersion) return { status: 'draft', inputVersions: versions.map(({ document_id, version, status }) => ({ document_id, version, status })) } as never
    if (entity === AgencyResearchDocument) return { currentVersionId: request.briefVersionId, status: 'ready_for_review' } as never
    const query = where as Record<string, unknown>
    return (runs.find((run) => query.id ? run.id === query.id : run.status === query.status) ?? null) as never
  })
  jest.mocked(startTaskRun).mockImplementation(async (_em, tenantScope, input) => {
    const run = Object.assign(new AgencyResearchTaskRun(), { ...tenantScope, ...input, id: id(10), status: 'running' })
    runs.push(run)
    return run
  })
  jest.mocked(finishTaskRun).mockImplementation(async (_em, run, outcome) => { Object.assign(run, outcome) })
  jest.mocked(saveDocumentVersion).mockResolvedValue({ version: { id: id(11) }, document: {}, envelope: {} } as never)
  jest.mocked(runQaLoop).mockResolvedValue({ verdict: 'ready', findings: [], taskRunId: id(12), repairs: 0 })
  jest.mocked(runFreezeStep).mockResolvedValue({ taskRunId: id(13), versionId: null, status: 'done', frozen: [], setHash: 'current', reused: false })
  jest.mocked(runBriefStep).mockResolvedValue({ taskRunId: id(14), versionId: id(15), status: 'done' })
  jest.mocked(runBriefQaLoop).mockResolvedValue({ verdict: 'ready_for_approval', findings: [], taskRunId: id(16), repairs: 0, briefVersionId: id(15) })
  runAgent.mockImplementation(async (agentId: string) => ({ result: { kind: 'research', data: agentId === BRIEF_ANSWER_AGENT_ID
    ? { answers: [{ questionId: 'Q01', value: request.originalText, quote: request.originalText }] }
    : { readiness: ['UVP', 'strategia', 'ToV', 'plan', 'post'].map((output) => ({ output, input_fields: ['priority_audience'], state: 'conditional', missing: 'Evidence limits remain', owner: 'agency' })), research_return: [] } }, usage: null }))
})

test('saves new grounded findings, refreshes real QA/freeze and calls original brief producer/QA; replay does not run agents again', async () => {
  const result = await execute()
  expect(briefRevisionResultSchema.parse(result)).toMatchObject({ status: 'completed', briefVersionId: id(15), qaVerdict: 'ready_for_approval', freezeTaskRunId: id(13) })
  expect(saveDocumentVersion).toHaveBeenCalledWith(em, scope, expect.objectContaining({ templateId: 'WZR-USTALENIA', status: 'ready_for_review', data: expect.objectContaining({ field_map: [expect.objectContaining({ decision_state: 'client_selected', proposed_value: request.originalText })] }) }))
  expect(runQaLoop).toHaveBeenCalledWith(expect.objectContaining({ orderRef: 'case' }), { authorSteps: {} })
  expect(runFreezeStep).toHaveBeenCalledTimes(1)
  expect(runBriefQaLoop).toHaveBeenCalledWith(expect.anything(), { briefStep: runBriefStep })
  expect(await execute()).toEqual(result)
  expect(runAgent).toHaveBeenCalledTimes(2)
  await expect(execute({ ...request, originalText: 'Changed replay' })).rejects.toThrow('replay source differs')
})

test('no extracted answer returns the original questions without new versions or producer calls', async () => {
  runAgent.mockResolvedValue({ result: { kind: 'research', data: { answers: [] } }, usage: null })
  expect(await execute()).toMatchObject({ status: 'needs_client_data', briefVersionId: null, questions: [{ questionId: 'Q01', question: 'Who is your audience?' }] })
  expect(saveDocumentVersion).not.toHaveBeenCalled()
  expect(runBriefStep).not.toHaveBeenCalled()
})

test('negative analysis QA is saved as blocked and cannot mint a successful freeze or revised brief', async () => {
  jest.mocked(runQaLoop).mockResolvedValue({ verdict: 'to_fix', findings: [], taskRunId: id(12), repairs: 0, escalationVersionId: id(17) })
  expect(await execute()).toMatchObject({ status: 'analysis_blocked', escalationVersionId: id(17), briefVersionId: null })
  expect(runFreezeStep).not.toHaveBeenCalled()
  expect(runBriefStep).not.toHaveBeenCalled()
})

test('a stale brief does not invoke intelligence or claim a revision', async () => {
  jest.mocked(readBriefReview).mockResolvedValueOnce(null)
  expect(await execute()).toEqual({ status: 'not_ready', orderRef: 'case', reason: 'brief_not_current' })
  expect(startTaskRun).not.toHaveBeenCalled()
  expect(runAgent).not.toHaveBeenCalled()
})
