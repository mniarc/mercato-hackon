import { zrodlaDataSchema, type ZrodlaData } from '../data/schemas/zrodla'
import type { QaFinding } from '../data/schemas/qa'
import { mergeQaVerdict, reclassifyRecordedClaims } from '../lib/research/steps/qa'

const fact = (id: string, kind: ZrodlaData['facts'][number]['kind'], limitation: string | null): ZrodlaData['facts'][number] => ({
  fact_id: id, entity: 'Open Mercato', claim: `claim ${id}`, source_ids: ['S-01'], locator: { source_id: 'S-01', quote: `claim ${id}`, char_offset: 0 }, paraphrase: `claim ${id}`, kind, use_scope: [], limitation,
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

describe('Q-S finding reclassification', () => {
  it('sends an honest `unknown` buyer criterion to the client instead of the strategy writer', async () => {
    const { reclassifyStrategyFindings } = await import('../lib/research/steps/strategyQa')
    const [out] = reclassifyStrategyFindings([finding({ code: 'missing_must_field', path: 'KLI-STRATEGIA.buyer_tension.decision_criterion', owner: 'agent', fix_step: '5.2', gap: 'decision_criterion is unknown with no evidence_ids' })])
    expect(out.owner).toBe('client')
    expect(out.fix_step).toBeNull()
  })

  it('keeps a contradiction with the brief on the strategy writer', async () => {
    const { reclassifyStrategyFindings } = await import('../lib/research/steps/strategyQa')
    const [out] = reclassifyStrategyFindings([finding({ code: 'contradiction', path: 'KLI-BRIEF.promise_constraints', owner: 'agent', fix_step: '5.2', gap: 'the strategy names partners the brief forbids naming' })])
    expect(out.owner).toBe('agent')
    expect(out.fix_step).toBe('5.2')
  })
})

describe('pending client decisions', () => {
  it('a gap the QA itself attributes to an undecided client is the client\'s question (3.7 and Q-S)', async () => {
    const { reclassifyStrategyFindings } = await import('../lib/research/steps/strategyQa')
    const [a] = reclassifyRecordedClaims([finding({ code: 'missing_must_field', path: 'WEW-AUDYT.journey', owner: 'agent', fix_step: '3.3', gap: 'no destination exists; the candidates are all undecided by the client' })], zrodla)
    const [b] = reclassifyStrategyFindings([finding({ code: 'missing_must_field', path: 'KLI-STRATEGIA.strategic_choice.decision', owner: 'agent', fix_step: '5.2', gap: 'the three anchor decisions are all marked awaiting_client in the brief' })])
    expect([a.owner, b.owner]).toEqual(['client', 'client'])
    expect([a.fix_step, b.fix_step]).toEqual([null, null])
  })
})

describe('production-QA reclassification (shared by Q-S and Q-P)', () => {
  const production = async () => (await import('../lib/research/steps/qa')).reclassifyProductionFindings
  const strategy = async () => (await import('../lib/research/steps/strategyQa')).reclassifyStrategyFindings

  it('keeps a writer-invented number on the writer even when the gap says "no proof card"', async () => {
    const [out] = (await production())([finding({ code: 'invented_effectiveness', path: 'KLI-PLAN.topics[TOP04].main_message', fix_step: '6.2', gap: 'TOP04 promises 40 % faster onboarding; no proof card backs the number' })])
    expect(out.owner).toBe('agent')
  })

  it('sends a recorded case lacking independent verification to the client', async () => {
    const [out] = (await production())([finding({ code: 'invented_effectiveness', path: 'KLI-STRATEGIA.proof_architecture[CL04]', fix_step: '5.2', gap: 'P03 is a single-customer self-reported case, not independently verified' })])
    expect(out.owner).toBe('client')
  })

  it('downgrades a concession only when nothing follows it', async () => {
    const [pure, reversed] = (await production())([
      finding({ code: 'contradiction', path: 'KLI-STRATEGIA.uvp', fix_step: '5.2', gap: 'The UVP explanation states the mechanism is unverified. This is correct.' }),
      finding({ code: 'contradiction', path: 'KLI-PLAN.topics[TOP07]', fix_step: '6.2', gap: 'The strategy correctly identifies the priority audience, but TOP07 targets SMB owners instead' }),
    ])
    expect(pure.severity).toBe('major')
    expect(reversed.severity).toBe('blocking')
  })

  it('a writer ignoring a recorded client decision stays a writer fault', async () => {
    const [out] = (await production())([finding({ code: 'contradiction', path: 'KLI-PLAN.topics[TOP02]', fix_step: '6.2', gap: 'the plan ignores the client decision recorded in the brief (no partner naming)' })])
    expect(out.owner).toBe('agent')
  })

  it('Q-S goes through the shared rules and keeps the buyer-criterion exception', async () => {
    const [criterion, length] = (await strategy())([
      finding({ code: 'missing_must_field', path: 'KLI-STRATEGIA.buyer_tension.decision_criterion', fix_step: '5.2', gap: 'marked unknown with no evidence_ids' }),
      finding({ code: 'limit_exceeded', path: 'KLI-STRATEGIA.strategic_choice', fix_step: '5.2', gap: 'section exceeds recommended depth' }),
    ])
    expect(criterion.owner).toBe('client')
    expect(length.severity).toBe('major')
  })
})

describe('recorded conflicts and bare-id paths', () => {
  it('a finding about the register\'s own conflict entry goes to the client; a downstream document taking a side stays with the writer', () => {
    const withConflict = zrodlaDataSchema.parse({ ...zrodla, conflicts: [{ conflict_id: 'X01', facts: ['F14', 'F20'], dates: ['2026-09-19'], detail: 'd', impact: 'i', question: 'q', state: 'open' }] })
    const [entry, downstream] = reclassifyRecordedClaims(
      [
        finding({ code: 'contradiction', path: 'documents.WEW-ZRODLA.conflicts.X01', owner: 'research', fix_step: '3.3', gap: 'F14 and F20 disagree on the timeline' }),
        finding({ code: 'contradiction', path: 'WEW-AUDYT.message_map[0]', fix_step: '3.3', gap: 'asserts F14 as fact while X01 (F14 vs F20) is unresolved' }),
      ],
      withConflict,
    )
    expect(entry.owner).toBe('client')
    expect(entry.path).toBe('WEW-ZRODLA.conflicts.X01')
    expect(downstream.owner).toBe('agent')
  })

  it('routes a bare id path by the id alphabet', () => {
    const [proof, competitor, question] = reclassifyRecordedClaims(
      [
        finding({ code: 'other', path: 'P03, P04 (case studies)', owner: 'research', fix_step: '3.4', gap: 'cards lack a recorded artifact detail' }),
        finding({ code: 'other', path: 'C12', fix_step: '3.2', gap: 'competitor fact paraphrased' }),
        finding({ code: 'other', path: 'Q03', fix_step: '3.2', gap: 'question repeats Q01' }),
      ],
      zrodla,
    )
    expect([proof.fix_step, competitor.fix_step, question.fix_step]).toEqual(['3.2', '3.4', '3.6'])
  })
})
