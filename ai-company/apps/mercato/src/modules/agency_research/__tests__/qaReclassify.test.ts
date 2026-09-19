import { zrodlaDataSchema, type ZrodlaData } from '../data/schemas/zrodla'
import type { QaFinding } from '../data/schemas/qa'
import { mergeQaVerdict, reclassifyRecordedClaims } from '../lib/research/steps/qa'

const fact = (id: string, kind: ZrodlaData['facts'][number]['kind'], limitation: string | null): ZrodlaData['facts'][number] => ({
  fact_id: id, entity: 'Open Mercato', claim: `claim ${id}`, source_ids: ['S-01'], locator: { source_id: 'S-01', quote: `claim ${id}`, char_offset: 0 }, paraphrase: null, kind, use_scope: [], limitation,
})

const zrodla = zrodlaDataSchema.parse({
  sources: [{ source_id: 'S-01', canonical_source_id: 'S-01', independent_material_id: 'M1', url_or_file: 'https://x', publisher: 'x', kind: 'www', title: null, retrieved_at: '2026-09-19', published_at: null, access: 'full', read_scope: 'read', limitation: null, source_visibility: 'public', duplicate_of: null, origin: 'purchase_form' }],
  facts: [fact('F14', 'first_party_claim', 'unsupported by case evidence'), fact('F20', 'observed', null)],
  proof_cards: [], language_samples: [], audience_signals: [], content_bank: [], conflicts: [], coverage: [],
})

const finding = (partial: Partial<QaFinding>): QaFinding => ({ code: 'other', path: 'WEW-ZRODLA.facts', severity: 'blocking', gap: 'gap', owner: 'agent', fix_step: '3.2', fix_hint: null, ...partial })

describe('3.7 finding reclassification', () => {
  it('turns a recorded first-party claim with its limitation into a client question', () => {
    const [out] = reclassifyRecordedClaims([finding({ code: 'invented_effectiveness', path: 'WEW-ZRODLA.facts[F14]', gap: '"10x faster" has no methodology' })], zrodla)
    expect(out.owner).toBe('client')
    expect(out.fix_step).toBeNull()
  })

  it('keeps an observed fact without limitation on the author step', () => {
    const [out] = reclassifyRecordedClaims([finding({ code: 'fact_vs_interpretation', path: 'WEW-ZRODLA.facts[F20]', gap: 'interpretation beyond the source' })], zrodla)
    expect(out.owner).toBe('agent')
    expect(out.fix_step).toBe('3.2')
  })

  it('sends requests for interviews, benchmarks or a methodology to the client, never to a reading step', () => {
    const [out] = reclassifyRecordedClaims([finding({ code: 'missing_must_field', path: 'WEW-AUDYT.buyer_map', owner: 'research', gap: 'no interview, survey, or conversion data validates the scenarios' })], zrodla)
    expect(out.owner).toBe('client')
    expect(out.fix_step).toBeNull()
  })

  it('routes an author-owned finding to the step that owns the document in its path', () => {
    const [out] = reclassifyRecordedClaims([finding({ code: 'unresolved_reference', path: 'WEW-KONKURENCJA.cards[0].service.fact_ids', gap: 'C99 is not a stored id' })], zrodla)
    expect(out.fix_step).toBe('3.5')
  })

  it('client-owned blockers alone leave the analysis ready', () => {
    const result = mergeQaVerdict({ verdict: 'to_fix', summary: 's', findings: [finding({ owner: 'client', fix_step: null })] }, [])
    expect(result.verdict).toBe('ready')
  })
})
