/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { zrodla } from '../../../__fixtures__/planJourney'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, saveSources } from '../../store'
import { readBriefReview } from '../../briefReview/read'
import { runQaLoop } from '../../research/steps/qa'
import { runFreezeStep } from '../../research/steps/freeze'
import { runBriefStep } from '../../research/steps/brief'
import { runBriefQaLoop } from '../../research/steps/briefQa'
import { createStepRunner } from '../../research/pipeline'
import { documentIdFor } from '../../research/envelope'
import { claimMaterialRevision, savedMaterialRevision } from '../claim'
import { appendMaterialEvidence } from '../append'
import { runMaterialRevision } from '../run'
import type { MaterialRevisionRequest } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../store', () => ({ currentInputVersion: jest.fn(), finishTaskRun: jest.fn(), saveDocumentVersion: jest.fn(), saveSources: jest.fn() }))
jest.mock('../../briefReview/read', () => ({ readBriefReview: jest.fn() }))
jest.mock('../claim', () => ({ MATERIAL_REVISION_STEP: '4.5', claimMaterialRevision: jest.fn(), savedMaterialRevision: jest.fn() }))
jest.mock('../append', () => ({ ...jest.requireActual('../append'), appendMaterialEvidence: jest.fn() }))
jest.mock('../../research/pipeline', () => ({ ...jest.requireActual('../../research/pipeline'), createStepRunner: jest.fn() }))
jest.mock('../../research/steps/qa', () => ({ runQaLoop: jest.fn() }))
jest.mock('../../research/steps/freeze', () => ({ runFreezeStep: jest.fn() }))
jest.mock('../../research/steps/brief', () => ({ runBriefStep: jest.fn() }))
jest.mock('../../research/steps/briefQa', () => ({ runBriefQaLoop: jest.fn() }))

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: id(1), organizationId: id(2) }
const request: MaterialRevisionRequest = { orderRef: 'case', briefVersionId: id(3), source: { submissionId: id(4), eventId: 'upload', customerUserId: id(5), workflowInstanceId: id(6) },
  material: { attachmentId: id(7), submissionId: id(4), fileName: 'file.txt', text: 'The service has independently documented scope.', submittedAt: '2026-09-19T12:00:00.000Z' }, directive: { question: 'What service is documented?', briefField: 'priority_offer' }, maxCostPln: 2 }
const field = { field_key: 'priority_offer', proposed_value: 'Documented service', evidence_ids: ['F01'], provenance: 'inferred', readiness: 'conditional', decision_state: 'awaiting_client', priority: 'must', reason: 'Evidence is not a client choice', status: 'hypothesis' }
const dimension = { finding: 'Unknown', sample_ids: [], interpretation_limit: null }
const inputs = {
  'WZR-ZAMOWIENIE': { product_selection: { sku: 'TEST', offer_version: 'v1', price_net: 1, currency: 'PLN' }, brand: { display_name: 'Client', website_url: 'https://example.test' }, market_language: { market: 'PL', language: 'pl' } },
  'WZR-ZRODLA': zrodla(),
  'WZR-USTALENIA': { field_map: [field], questions: [], evidence_requests: [], readiness: [], research_return: [] },
  'WZR-AUDYT': { offer_map: [], buyer_map: [], message_map: [], voice_audit: { sample_size: 'one', formality: dimension, directness: dimension, technical_level: dimension, emotion: dimension, claim_certainty: dimension, recurring_phrases: dimension, channel_difference: dimension, future_voice_status: 'Client decides' }, journey: [], relationship: [], gaps: [], reusable_assets: [] },
  'WZR-KONKURENCJA': { selection: [], cards: [], parity_claims: [], alternative_routes: [], difference_candidates: [], channels: [], implications: [] },
}
const versions = Object.entries(inputs).map(([templateId, data], i) => ({ templateId, versionId: id(20 + i), document_id: documentIdFor(templateId as 'WZR-BRIEF', 'case'), version: '1.0', status: 'ready_for_review' as const, data }))
const em = { flush: jest.fn(), transactional: async (work: (manager: EntityManager) => unknown) => work(em) } as unknown as EntityManager
const activation = { id: id(10), summary: { submissionId: id(4) } } as AgencyResearchTaskRun
const execute = () => runMaterialRevision({ em, scope, request, runAgent: jest.fn(), runner: 'orchestrator', models: { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' } })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(savedMaterialRevision).mockResolvedValue(null)
  jest.mocked(claimMaterialRevision).mockResolvedValue({ activationTaskRunId: activation.id })
  jest.mocked(readBriefReview).mockResolvedValue({ isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'draft', documentId: id(9), versionId: request.briefVersionId, version: '1.0', orderRef: 'case', templateId: 'WZR-BRIEF', clientViewMd: 'Brief', questions: [], qa: { state: 'assessed', taskRunId: id(11), status: 'done', verdict: 'needs_client_data' } })
  jest.mocked(currentInputVersion).mockImplementation(async (_em, _scope, _orderRef, templateId) => versions.find((version) => version.templateId === templateId) ?? null)
  jest.mocked(findWithDecryption).mockResolvedValue([])
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    if (entity === AgencyResearchDocumentVersion) return { status: 'draft', inputVersions: versions } as never
    if (entity === AgencyResearchDocument) return { status: 'draft', currentVersionId: request.briefVersionId } as never
    if (entity === AgencyResearchTaskRun && (where as { stepId?: string }).stepId === '3.2') return { summary: { businessProfile: { category: 'Services', offer_summary: 'Scope', audience_hint: 'Client', market_hint: 'PL', fact_ids: ['F01'] } } } as never
    return activation as never
  })
  jest.mocked(appendMaterialEvidence).mockResolvedValue({ data: zrodla(), source: { source_id: 'S-99', text: request.material.text, source_visibility: 'client_private', url: `attachment://${id(7)}` } as never, newFactIds: ['F99'] })
  jest.mocked(createStepRunner).mockReturnValue((async ({ label }: { label: string }) => ({ value: label === 'material_target_field' ? { field_map: [field] } : { readiness: [], research_return: [] }, issues: [], cached: false })) as never)
  jest.mocked(saveDocumentVersion).mockImplementation(async (_em, _scope, input) => ({ version: { id: input.templateId === 'WZR-ZRODLA' ? id(30) : id(31) }, document: {}, envelope: { document_id: documentIdFor(input.templateId, 'case'), version: '2.0', status: input.status } }) as never)
  jest.mocked(runQaLoop).mockResolvedValue({ verdict: 'ready', findings: [], taskRunId: id(40), repairs: 0 })
  jest.mocked(runFreezeStep).mockResolvedValue({ taskRunId: id(41), versionId: null, status: 'done', setHash: 'set', frozen: [], reused: false })
  jest.mocked(runBriefStep).mockResolvedValue({ taskRunId: id(42), versionId: id(43), status: 'done' })
  jest.mocked(runBriefQaLoop).mockResolvedValue({ taskRunId: id(44), briefVersionId: id(43), verdict: 'ready_for_approval', findings: [], repairs: 0 })
})

it('connects the scoped source update to existing QA, freeze and same-brief producers', async () => {
  await expect(execute()).resolves.toMatchObject({ status: 'completed', sourcesVersionId: id(30), findingsVersionId: id(31), briefVersionId: id(43), analysisQaTaskRunId: id(40), freezeTaskRunId: id(41) })
  expect(saveSources).toHaveBeenCalledWith(em, scope, 'case', activation.id, expect.any(Array))
  expect(runQaLoop).toHaveBeenCalledWith(expect.objectContaining({ orderRef: 'case' }), { authorSteps: {} })
  expect(runFreezeStep).toHaveBeenCalledTimes(1)
  expect(runBriefStep).toHaveBeenCalledTimes(1)
  expect(finishTaskRun).toHaveBeenCalledWith(em, activation, expect.objectContaining({ status: 'done', summary: expect.objectContaining({ executionResult: expect.objectContaining({ submissionId: request.source.submissionId }) }) }))
})

it('does not refresh the frozen package or brief when native analysis QA blocks the supplement', async () => {
  jest.mocked(runQaLoop).mockResolvedValue({ verdict: 'exception', findings: [], taskRunId: id(40), repairs: 0, escalationVersionId: id(50) })
  await expect(execute()).resolves.toMatchObject({ status: 'analysis_blocked', escalationVersionId: id(50), briefVersionId: null })
  expect(runFreezeStep).not.toHaveBeenCalled()
  expect(runBriefStep).not.toHaveBeenCalled()
})
