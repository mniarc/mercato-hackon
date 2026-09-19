/** @jest-environment node */
import { zrodla, orderOf } from '../../../__fixtures__/planJourney'
import type { UstaleniaData } from '../../../data/schemas/ustalenia'
import { createStepRunner } from '../../research/pipeline'
import { createLedger } from '../../research/ledger'
import { appendMaterialEvidence, applyMaterialField } from '../append'
import { materialRevisionRequestSchema, type MaterialRevisionRequest } from '../contracts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const text = 'Our documented service is a monthly accessibility audit for small organizations.'
const request: MaterialRevisionRequest = { orderRef: 'case', briefVersionId: id(1),
  source: { submissionId: id(2), eventId: 'upload-1', customerUserId: id(3), workflowInstanceId: id(4) },
  material: { attachmentId: id(5), submissionId: id(2), fileName: 'service.txt', text, submittedAt: '2026-09-19T12:00:00.000Z' },
  directive: { question: 'What service is documented?', briefField: 'priority_offer' }, maxCostPln: 2 }
const runner = jest.fn(async () => ({ result: { kind: 'research', data: { facts: [{ local_ref: 'new', claim: text, quote: text, kind: 'first_party_claim', use_scope: ['internal'], limitation: 'Client supplied claim' }], language_samples: [], audience_signals: [], page_summary: 'Private service description' } }, usage: null }))
const step = () => createStepRunner({ runAgent: runner, ledger: createLedger(), models: { extract: 'mistralai/mistral-nemo', synthesis: 'mistralai/mistral-nemo', qa: 'mistralai/mistral-nemo' }, groundingRetries: 0,
  onEvent: () => {}, timeouts: { extract: 1000, synthesis: 1000, qa: 1000 }, stats: { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 } })

beforeEach(() => jest.clearAllMocks())

it('uses the existing grounded extractor and appends private evidence without resetting any prior IDs', async () => {
  const original = zrodla()
  const result = await appendMaterialEvidence({ existing: original, order: orderOf('LinkedIn'), request, step: step() })
  expect(result.data.facts.slice(0, original.facts.length)).toEqual(original.facts)
  expect(result.data.sources.slice(0, original.sources.length)).toEqual(original.sources)
  expect(result.data.proof_cards).toEqual(original.proof_cards)
  expect(new Set(result.data.facts.map((fact) => fact.fact_id)).size).toBe(result.data.facts.length)
  expect(result.data.sources.at(-1)).toMatchObject({ source_visibility: 'client_private', url_or_file: `attachment://${id(5)}` })
  expect(result.data.facts.at(-1)?.locator.quote).toBe(text)
  expect(runner).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ page: expect.objectContaining({ content_md: text }) }), expect.anything())
})

it('records unavailable text without an extractor call or invented fact', async () => {
  const original = zrodla()
  const result = await appendMaterialEvidence({ existing: original, order: orderOf('LinkedIn'), request: { ...request, material: { ...request.material, text: null } }, step: step() })
  expect(result.source).toMatchObject({ access: 'unavailable', text: null, source_visibility: 'client_private' })
  expect(result.newFactIds).toEqual([])
  expect(result.data.facts).toEqual(original.facts)
  expect(runner).not.toHaveBeenCalled()
})

it('preserves client decisions and unrelated fields instead of interpreting a file as a new choice', () => {
  const field: UstaleniaData['field_map'][number] = { field_key: 'priority_offer', proposed_value: 'Chosen service', evidence_ids: ['F01'], provenance: 'client_answer', readiness: 'ready', decision_state: 'client_selected', priority: 'must', reason: 'Explicit decision', status: 'client_decision' }
  const findings: UstaleniaData = { field_map: [field, { ...field, field_key: 'priority_audience' }], questions: [], evidence_requests: [], readiness: [], research_return: [] }
  const result = applyMaterialField(findings, { ...field, proposed_value: 'Different service', evidence_ids: ['F99'], status: 'fact', provenance: 'observed', decision_state: 'not_required' }, request)
  expect(result.field_map[0]).toMatchObject({ proposed_value: 'Chosen service', status: 'client_decision', decision_state: 'client_selected', evidence_ids: ['F01', 'F99'] })
  expect(result.field_map[1]).toEqual(findings.field_map[1])
  expect(findings.field_map[0].evidence_ids).toEqual(['F01'])
})

it('binds the material to its exact original submission', () => {
  expect(materialRevisionRequestSchema.safeParse({ ...request, material: { ...request.material, submissionId: id(99) } }).success).toBe(false)
})
