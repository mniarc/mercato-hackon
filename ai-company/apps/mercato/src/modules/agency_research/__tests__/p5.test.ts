import path from 'node:path'
import { audytDataSchema, type AudytData } from '../data/schemas/audyt'
import { briefDataSchema, type BriefData } from '../data/schemas/brief'
import { outputIdByTemplate } from '../data/schemas/envelope'
import { orderDataSchema, orderFactsOf } from '../data/schemas/zamowienie'
import { strategiaDataSchema, type StrategiaData } from '../data/schemas/strategia'
import { tovDataSchema, type TovData } from '../data/schemas/tov'
import { zrodlaDataSchema, type ZrodlaData } from '../data/schemas/zrodla'
import { createLedger } from '../lib/research/ledger'
import { GateError } from '../lib/research/gate'
import { renderStrategia, renderStrategiaClientView } from '../lib/research/render/strategia'
import { renderTov, renderTovClientView } from '../lib/research/render/tov'
import type { StepContext } from '../lib/research/steps/context'
import { assembleStrategy, gateStrategySection, knownStrategyIds, runStrategyPipeline, runStrategyStep, supportLevelOfProof } from '../lib/research/steps/strategy'
import { fixStepOf, mergeStrategyQaVerdict, runStrategyQa, runStrategyQaLoop, strategyValidatorFindings } from '../lib/research/steps/strategyQa'
import { runTovPipeline, STYLE_AXES } from '../lib/research/steps/tov'
import { createFixtureRunner } from '../lib/runners'
import { countClientWords } from '../lib/research/util'
import * as store from '../lib/store'

jest.mock('../lib/store', () => {
  const actual = jest.requireActual('../lib/store')
  return { ...actual, startTaskRun: jest.fn(), finishTaskRun: jest.fn(), currentInputVersion: jest.fn(), saveDocumentVersion: jest.fn() }
})

const canned = path.join(__dirname, '..', '__fixtures__', 'flow', 'canned')
const models = { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }
const order = orderFactsOf(
  orderDataSchema.parse({
    product_selection: { sku: 'START-KOMUNIKACJI-PL-01', offer_version: 'v1', price_net: 2500, currency: 'PLN' },
    brand: { display_name: 'FLOW Centrum Badawcze', website_url: 'https://makeitflow.pl/index.php' },
    market_language: { market: 'Polska', language: 'pl' },
    official_social: { url: 'https://www.linkedin.com/company/flow-centrum-badawcze/', platform: 'LinkedIn', provenance: 'client_provided' },
    purchase_goal: 'Wyjaśnić, jak FLOW pomaga dojść od problemu do rozwiązania.',
  }),
)

const src = (id: string, url: string): ZrodlaData['sources'][number] => ({
  source_id: id, canonical_source_id: id, independent_material_id: `MAT-${id}`, url_or_file: url, publisher: 'FLOW', kind: 'oficjalna strona', title: null,
  retrieved_at: '2026-09-19T10:00:00.000Z', published_at: null, access: 'full', read_scope: 'read', limitation: null, source_visibility: 'public', duplicate_of: null, origin: 'purchase_form',
})
const fact = (id: string, claim: string, kind: ZrodlaData['facts'][number]['kind'] = 'first_party_claim'): ZrodlaData['facts'][number] => ({
  fact_id: id, entity: 'FLOW', claim, source_ids: ['S-01'], locator: { source_id: 'S-01', quote: claim, char_offset: 0 }, paraphrase: claim, kind, use_scope: [], limitation: null,
})
const seed = (id: string, question: string): ZrodlaData['content_bank'][number] => ({
  seed_id: id, audience_question: question, angle: `ujęcie ${id}`, source_claim: { text: 'Punktem wyjścia są potrzeby użytkowników.', fact_ids: ['F03'], source_ids: ['S-01'], provenance: 'observed' },
  proposed_utility: { text: 'Autorska lista pytań.', provenance: 'creative_proposal' }, fact_ids: ['F03'], proof_ids: ['P01'], provenance: 'inferred',
  reuse_of_evidence: { note: null, shared_fact_ids: [], shared_proof_ids: [] }, prohibited_claims: [], readiness: 'ready', readiness_reason: null,
})

function zrodla(): ZrodlaData {
  return zrodlaDataSchema.parse({
    sources: [src('S-01', 'https://makeitflow.pl/index.php')],
    facts: [
      fact('F01', 'FLOW łączy badania, projektowanie i wdrażanie.'), fact('F02', 'Cztery obszary działania.'), fact('F03', 'Punktem wyjścia są potrzeby użytkowników.'),
      fact('F04', 'Można zgłosić się bez specyfikacji.'), fact('F05', 'AI tylko z uzasadnieniem biznesowym.'), fact('F06', 'Ceny po diagnozie.'), fact('F07', 'Kontakt e-mail i telefon.', 'observed'),
    ],
    proof_cards: [
      { proof_id: 'P01', proof_type: 'declaration', problem: 'p', actual_action: null, artifact_or_method: 'Cztery obszary diagnozy', observed_result: null, fact_ids: ['F03'], source_ids: ['S-01'], limitations: ['brak wyniku'], source_visibility: 'public', allowed_use: 'client_review', use_basis_ref: 'KLI-BRIEF.assets_and_permissions', client_name_permission: 'not_applicable', quote_permission: 'granted', provenance: 'inferred' },
      { proof_id: 'P02', proof_type: 'observed_artifact', problem: null, actual_action: null, artifact_or_method: 'AI tylko z uzasadnieniem', observed_result: null, fact_ids: ['F05'], source_ids: ['S-01'], limitations: [], source_visibility: 'public', allowed_use: 'internal_only', use_basis_ref: null, client_name_permission: 'unknown', quote_permission: 'unknown', provenance: 'inferred' },
    ],
    language_samples: [
      { sample_id: 'L01', independent_material_id: 'MAT-S-01', canonical_source_id: 'S-01', source_id: 'S-01', excerpt_or_paraphrase: 'Technologia jest narzędziem.', channel: 'WWW', suggested_audience: null, situation: null, linguistic_features: ['krótko'], observed_function: null, sample_limit: 'krótki fragment' },
    ],
    audience_signals: [{ signal_id: 'A01', role_or_organization: 'właściciel procesu', trigger: 't', problem: 'p', risk: null, objection: null, evidence_status: 'supplier_interpretation_not_customer_voice', fact_ids: ['F03'] }],
    content_bank: [seed('T01', 'Od czego zacząć?'), seed('T02', 'Co zmienić?'), seed('T03', 'Bez specyfikacji?'), seed('T04', 'Czy potrzebuję AI?'), seed('T05', 'Kiedy AI?')],
    conflicts: [],
    coverage: [],
  })
}

function audyt(): AudytData {
  const dim = (finding: string) => ({ finding, sample_ids: ['L01'], interpretation_limit: null })
  return audytDataSchema.parse({
    offer_map: [{ service: 'Diagnoza', described_audience: 'firmy B2B', problem: 'zakres', result: 'podstawa decyzji', mechanism: 'cztery obszary', limits: 'brak dowodu efektów', fact_ids: ['F01', 'F03'] }],
    buyer_map: [{ scenario_id: 'B01', status: 'hypothesis', initiator: 'właściciel procesu', user: 'zespół', decision_maker: 'unknown', purchase_moment: 'potrzeba poprawy', job: 'wyjaśnić problem', objections: ['musimy mieć specyfikację'], selection_criteria: null, selection_criteria_status: 'unknown', direct_customer_voice: false, fact_ids: ['F03', 'F04'] }],
    message_map: [{ message: 'Badania, projektowanie, wdrażanie', category: 'zakres', audience: 'szeroki', benefit: 'spójność', mechanism: 'zakres', proof_ids: ['P01'], risk: 'nie UVP', fact_ids: ['F01'] }],
    voice_audit: { sample_size: '1 fragment', formality: dim('przystępnie'), directness: dim('bezpośrednio'), technical_level: dim('prosto'), emotion: dim('spokojnie'), claim_certainty: dim('deklaratywnie'), recurring_phrases: dim('brak'), channel_difference: dim('brak danych'), future_voice_status: 'decyzja klienta' },
    journey: [{ stage: 'Zainteresowanie', material: 'WWW', promise: 'diagnoza', cta: 'kontakt', destination_status: 'widoczny', friction: null, friction_status: 'not_established', possible_improvement: 'ustalić krok', research_limitation: null, fact_ids: ['F07'] }],
    relationship: [],
    gaps: [{ gap_id: 'G01', observation: 'brak priorytetu', business_impact_hypothesis: null, evidence_ids: ['F02'], priority: 'must', needed: 'decyzja', destination: 'KLI-BRIEF.priority_offer', finding_type: 'pending_decision', consequence_for_work: 'nie ustalamy za klienta' }],
    reusable_assets: [],
  })
}

function brief(decisionState: 'client_selected' | 'awaiting_client' = 'client_selected'): BriefData {
  const decided = { decision_state: decisionState, decision_ref: decisionState === 'client_selected' ? 'WEW-USTALENIA.field_map' : null }
  return briefDataSchema.parse({
    priority_offer: { value: 'Diagnoza przed wdrożeniem', ...decided, fact_ids: ['F01', 'F03'], result_for_audience: 'Decyzja oparta na rozpoznaniu', excluded_from_scope: ['Realizacja gotowych specyfikacji'] },
    priority_audience: {
      value: 'Właściciele procesów w firmach B2B', ...decided, fact_ids: ['F03'],
      priority_choice: { segment: 'firmy B2B', target_role: ['właściciel procesu'], decision_ref: decided.decision_ref, decision_version: null, decision_state: decisionState },
      buyer_claims: [{ component: 'job', value: 'wyjaśnić problem', knowledge_status: 'hypothesis', provenance: 'inferred', evidence_ids: ['F03'], allowed_use: 'hipoteza' }],
      secondary_groups: null,
    },
    business_direction: { value: 'Od realizacji do rozpoznania', ...decided, fact_ids: ['F01'], from_to: 'od wykonawcy do doradcy', horizon: null, baseline: null, communication_role: 'wyjaśniać sposób pracy', not_promised: ['wyniki klientów'] },
    buyer_reality: [{ situation: 'Firma rozważa narzędzie bez specyfikacji', status: 'hypothesis', relevant_fact_ids: ['F04'], need_for_real_evidence: 'głos klientów' }],
    promise_constraints: {
      capabilities: 'Deklaracje metody', result_limits: 'Brak case study', prohibited_claims: ['Procentowe oszczędności', 'Gwarantowany czas realizacji', 'Jedyność na rynku'], allowed_proof_ids: ['P01', 'P02'],
      rights_by_proof: [{ proof_id: 'P01', source_visibility: 'public', allowed_use: 'client_review', use_basis_ref: 'KLI-BRIEF.assets_and_permissions', client_name_permission: 'not_applicable', quote_permission: 'granted' }], fact_ids: ['F03', 'F05'],
    },
    voice_preferences: {
      desired_traits: ['konkretny', 'ciekawy problemu'], unwanted_traits: ['nadęcie'], style_preferences: { jargon: 'wyjaśniać', humor: 'lekka metafora', formalness: null },
      proposed_examples: [{ variant_id: 'VOICE-A', label: 'A', text: 'a', fact_ids: ['F03'], provenance: 'creative_proposal' }, { variant_id: 'VOICE-B', label: 'B', text: 'b', fact_ids: ['F03'], provenance: 'creative_proposal' }],
      client_selection: null, decision_version: null, decision_state: decisionState, sample_ids: ['L01'],
    },
    channel_and_cta: {
      channel: 'LinkedIn firmy', audience_context: 'właściciele procesów', cta_goal: 'rozmowa o problemie', cta_text: null, destination: 'https://makeitflow.pl/index.php', destination_visibility: 'observed', destination_functionality: 'not_checked',
      owner: null, required_owner_before_publish: true, draft_readiness: 'conditional', publication_readiness: 'blocked', limits: ['jeden kanał'], fact_ids: ['F07'], decision_state: decisionState,
    },
    success_and_limits: { directional_goal: 'więcej rozmów bez specyfikacji', measurement_proposals: [], baseline: null, numerical_target: null, scope_limit: 'jeden post' },
    assets_and_permissions: [],
    open_assumptions: [{ assumption_id: 'A-01', text: 'kryterium decyzji nieznane', type: 'hypothesis', impact: 'buyer_reality', decision_owner: 'klient', allowed_use: 'propozycja', logical_deadline: 'przed freeze', state: 'open' }],
  })
}

const ledger = () => createLedger({ prices: {} })

async function strategy() {
  const calls: { agentId: string; input: unknown }[] = []
  const result = await runStrategyPipeline({ order, outputLanguage: 'pl', brief: brief(), zrodla: zrodla(), audyt: audyt(), konkurencja: null, runAgent: createFixtureRunner(canned, { calls }), ledger: ledger(), models })
  return { ...result, calls }
}

async function tov(strategyData: StrategiaData) {
  const calls: { agentId: string; input: unknown }[] = []
  const result = await runTovPipeline({ order, outputLanguage: 'pl', strategy: strategyData, brief: brief(), zrodla: zrodla(), audyt: audyt(), runAgent: createFixtureRunner(canned, { calls }), ledger: ledger(), models })
  return { ...result, calls }
}

describe('runStrategyPipeline (5.2)', () => {
  it('mints claim and pillar ids from three section calls and caps support by the cited proofs', async () => {
    const { data, issues, calls, stats } = await strategy()
    expect(strategiaDataSchema.safeParse(data).success).toBe(true)
    expect(calls.map((c) => (c.input as { section: string }).section)).toEqual(['choice_tension_uvp', 'proof_messages', 'pillars_channel_boundaries'])
    expect(stats.agentCalls).toBe(3)
    expect(data.uvp.claim_id).toBe('CL01')
    expect(data.proof_architecture.map((row) => row.claim_id)).toEqual(['CL01', 'CL02', 'CL03'])
    expect(data.pillars.map((p) => p.pillar_id)).toEqual(['PL01', 'PL02', 'PL03'])
    expect(data.pillars[0].claim_ids).toEqual(['CL01'])
    expect(data.message_hierarchy.supporting_messages[1].claim_ids).toEqual(['CL03'])
    expect(issues.some((i) => i.code === 'UNKNOWN_CLAIM_REF')).toBe(true)
    expect(data.strategic_choice.evidence_ids).toEqual(['F01', 'F03', 'F04'])
    expect(issues.filter((i) => i.code === 'UNKNOWN_ID').map((i) => i.path)).toEqual(expect.arrayContaining(['choice_tension_uvp.strategic_choice.evidence_ids', 'choice_tension_uvp.uvp.evidence_ids']))
    // P03 does not exist here and P01 is a declaration: the asserted demonstrated_result falls to a declared method.
    expect(data.uvp.support_level).toBe('declared_method')
    expect(data.message_hierarchy.main_promise.status).toBe('declared_method')
    expect(data.proof_architecture[2].status).toBe('documented_capability')
    expect(issues.filter((i) => i.code === 'NO_AUTO_PROMOTION').length).toBeGreaterThanOrEqual(2)
    expect(data.buyer_tension.objection_status).toBe('illustrative_hypothesis')
    expect(data.measurement_hypothesis.numerical_target).toBeNull()
    expect(issues.some((i) => i.code === 'TARGET_WITHOUT_BASELINE')).toBe(true)
    expect(data.options_considered).toHaveLength(2)
    expect(data.creative_boundaries.prohibited_promises).toEqual(expect.arrayContaining(['Oszczędności procentowe', 'Jedyność na rynku']))
    expect(issues.some((i) => i.code === 'UNIQUENESS_UNSUPPORTED')).toBe(false)
  })

  it('renders a client view within budget without ids and an internal view with the proof architecture', async () => {
    const { data, clientViewMd } = await strategy()
    expect(countClientWords(clientViewMd)).toBeLessThanOrEqual(1100)
    expect(clientViewMd).toContain('## Nasz wybór')
    expect(clientViewMd).not.toContain('CL01')
    expect(clientViewMd).not.toContain('F03')
    const en = renderStrategiaClientView({ outputLanguage: 'en', brand: 'FLOW', data })
    expect(en.markdown).toContain('## Our choice')
    expect(en.limit).toBe(1100)
    const internal = renderStrategia({ outputLanguage: 'pl', brand: 'FLOW', data, issues: [] })
    expect(internal).toContain('**CL01** [declared_method]')
    expect(internal).toContain('PL03')
  })

  it('flags uniqueness without a demonstrated proof and rejects a vague alternative', async () => {
    const { calls } = await strategy()
    const sections = Object.assign({}, ...calls.map(() => ({})))
    const runner = createFixtureRunner(canned)
    for (const section of ['choice_tension_uvp', 'proof_messages', 'pillars_channel_boundaries'] as const) {
      const { result } = await runner('agency_research.strategy_writer', { section }, { runTimeoutMs: 1, tier: 'synthesis' })
      Object.assign(sections, (result as { data: Record<string, unknown> }).data)
    }
    const known = knownStrategyIds(zrodla(), brief(), audyt(), null)
    const gated = { ...gateStrategySection('choice_tension_uvp', sections, known).value, ...gateStrategySection('proof_messages', sections, known).value, ...gateStrategySection('pillars_channel_boundaries', sections, known).value }
    const unique = { ...gated, uvp: { ...gated.uvp!, working_sentence: 'FLOW jako jedyna firma zaczyna od rozpoznania problemu.' } }
    const assembled = assembleStrategy({ outputLanguage: 'pl', sections: unique, zrodla: zrodla(), brief: brief() })
    expect(assembled.issues.some((i) => i.code === 'UNIQUENESS_UNSUPPORTED' && i.severity === 'blocking')).toBe(true)
    const vague = { ...sections, uvp: { ...(sections as { uvp: Record<string, unknown> }).uvp, alternative: 'wszyscy inni' } }
    expect(() => gateStrategySection('choice_tension_uvp', vague as never, known)).toThrow(GateError)
    expect(supportLevelOfProof({ proof_type: 'external_confirmation' })).toBe('demonstrated_result')
    expect(supportLevelOfProof({ proof_type: 'observed_artifact' })).toBe('documented_capability')
  })
})

describe('runTovPipeline (5.3)', () => {
  it('assembles four principles, the five axes in order, grounded and creative examples, and 6–8 checks', async () => {
    const { data: strategyData } = await strategy()
    const { data, issues, calls, stats } = await tov(strategyData)
    expect(tovDataSchema.safeParse(data).success).toBe(true)
    expect(calls.map((c) => (c.input as { section: string }).section)).toEqual(['principles_axes_wording', 'evidence_examples_checks'])
    expect(stats.agentCalls).toBe(2)
    expect((calls[0].input as { strategy: { uvp: { claim_id: string } } }).strategy.uvp.claim_id).toBe('CL01')
    expect(data.voice_principles).toHaveLength(4)
    expect(issues.some((i) => i.code === 'PRINCIPLES_TRIMMED')).toBe(true)
    expect(data.style_axes.map((a) => a.axis)).toEqual([...STYLE_AXES])
    expect(data.wording.cliches).not.toContain('rozpoznanie')
    expect(issues.some((i) => i.code === 'CLICHE_ALSO_PREFERRED')).toBe(true)
    expect(data.evidence_language.map((e) => e.type)).toEqual(['fact', 'first_party_claim', 'hypothesis', 'illustrative_example', 'limitation'])
    expect(data.before_after.map((p) => [p.status, p.fact_ids])).toEqual([
      ['grounded', ['F03']],
      ['grounded', ['F05']],
      ['creative_example', []],
    ])
    expect(issues.some((i) => i.code === 'EXAMPLE_NOT_GROUNDED')).toBe(true)
    expect(data.copy_checks).toHaveLength(8)
    expect(issues.some((i) => i.code === 'COPY_CHECKS_TRIMMED')).toBe(true)
  })

  it('renders a client view within 750 words with the do/don’t table and three pairs', async () => {
    const { data: strategyData } = await strategy()
    const { data, clientViewMd } = await tov(strategyData)
    expect(countClientWords(clientViewMd)).toBeLessThanOrEqual(750)
    expect(clientViewMd).toContain('| Piszemy | Nie piszemy |')
    expect(clientViewMd.match(/\*\*Przed:\*\*/g)).toHaveLength(3)
    const en = renderTovClientView({ outputLanguage: 'en', brand: 'FLOW', data })
    expect(en.markdown).toContain('## Four voice principles')
    expect(en.limit).toBe(750)
    expect(renderTov({ outputLanguage: 'pl', brand: 'FLOW', data, issues: [] })).toContain('[creative_example; —]')
  })
})

describe('strategy QA (5.4, Q-S)', () => {
  async function pair(): Promise<{ strategyData: StrategiaData; tovData: TovData; strategyView: string; tovView: string }> {
    const s = await strategy()
    const t = await tov(s.data)
    return { strategyData: s.data, tovData: t.data, strategyView: s.clientViewMd, tovView: t.clientViewMd }
  }

  it('computes deterministic findings and maps them to exactly one verdict with the author step', async () => {
    const { strategyData, tovData, strategyView, tovView } = await pair()
    const base = { brief: brief(), zrodla: zrodla(), audyt: audyt(), konkurencja: null, strategyClientViewMd: strategyView, tovClientViewMd: tovView }
    const clean = strategyValidatorFindings({ strategy: strategyData, tov: tovData, ...base })
    expect(clean.filter((f) => f.severity === 'blocking')).toEqual([])
    expect(mergeStrategyQaVerdict(clean)).toBe('ready_for_approval')

    const fewPillars: StrategiaData = { ...strategyData, pillars: strategyData.pillars.slice(0, 2) }
    const pillarFindings = strategyValidatorFindings({ strategy: fewPillars, tov: tovData, ...base })
    expect(pillarFindings.some((f) => f.code === 'limit_exceeded' && f.path === 'KLI-STRATEGIA.pillars' && f.fix_step === '5.2')).toBe(true)
    expect(mergeStrategyQaVerdict(pillarFindings)).toBe('needs_agent_fix')

    const promoted: StrategiaData = { ...strategyData, uvp: { ...strategyData.uvp, support_level: 'demonstrated_result' } }
    expect(strategyValidatorFindings({ strategy: promoted, tov: tovData, ...base }).some((f) => f.code === 'invented_effectiveness' && f.path === 'KLI-STRATEGIA.uvp.support_level')).toBe(true)
    const unique: StrategiaData = { ...strategyData, uvp: { ...strategyData.uvp, working_sentence: 'FLOW jako jedyna firma zaczyna od rozpoznania.' } }
    expect(strategyValidatorFindings({ strategy: unique, tov: tovData, ...base }).some((f) => f.code === 'unsourced_claim' && f.path === 'KLI-STRATEGIA.uvp')).toBe(true)

    const thinTov: TovData = { ...tovData, voice_principles: tovData.voice_principles.slice(0, 3), before_after: [{ ...tovData.before_after[2], status: 'grounded' }] }
    const tovFindings = strategyValidatorFindings({ strategy: strategyData, tov: thinTov, ...base })
    expect(tovFindings.filter((f) => f.fix_step === '5.3').map((f) => f.path)).toEqual(expect.arrayContaining(['KLI-TOV.voice_principles', 'KLI-TOV.before_after[0]']))

    const stray: StrategiaData = { ...strategyData, strategic_choice: { ...strategyData.strategic_choice, evidence_ids: ['F99'] } }
    expect(strategyValidatorFindings({ strategy: stray, tov: tovData, ...base }).some((f) => f.code === 'unresolved_reference' && f.fix_step === '5.2')).toBe(true)
    expect(fixStepOf({ code: 'other', path: 'KLI-TOV.wording', severity: 'blocking', gap: 'g', owner: 'agent', fix_step: null, fix_hint: null })).toBe('5.3')
  })

  it('merges the agent findings with the validator and drops findings that point outside the pair', async () => {
    const { strategyData, tovData } = await pair()
    const runAgent = createFixtureRunner(canned)
    const opts = { order, outputLanguage: 'pl' as const, strategy: strategyData, tov: tovData, brief: brief(), zrodla: zrodla(), audyt: audyt(), konkurencja: null, runAgent, ledger: ledger(), models }
    const first = await runStrategyQa(opts)
    expect(first.verdict).toBe('needs_agent_fix')
    expect(first.findings.some((f) => f.path.startsWith('WEW-AUDYT'))).toBe(false)
    expect(first.findings.filter((f) => f.owner === 'agent' && f.severity === 'blocking').map((f) => f.fix_step)).toEqual(['5.2'])
    const second = await runStrategyQa(opts)
    expect(second.verdict).toBe('ready_for_approval')
  })

  it('re-runs the strategy and the ToV once on an agent fault, then judges again and moves the pair on', async () => {
    const { strategyData, tovData } = await pair()
    const mocked = store as jest.Mocked<typeof store>
    const versions: Record<string, unknown> = { 'WZR-STRATEGIA': strategyData, 'WZR-TOV': tovData, 'WZR-BRIEF': brief(), 'WZR-ZRODLA': zrodla(), 'WZR-AUDYT': audyt() }
    mocked.currentInputVersion.mockImplementation(async (_em, _scope, _orderRef, templateId) => {
      if (!(templateId in versions)) return null
      return { document_id: `${outputIdByTemplate[templateId]}@o`, version: '1.0', status: 'draft', versionId: `v-${templateId}`, data: versions[templateId] }
    })
    mocked.startTaskRun.mockResolvedValue({ id: 'run-54' } as never)
    mocked.finishTaskRun.mockResolvedValue(undefined)
    const documents: Record<string, { status: string }> = { 'WZR-STRATEGIA': { status: 'draft' }, 'WZR-TOV': { status: 'draft' } }
    const em = { findOne: async (_entity: unknown, where: { templateId: string }) => documents[where.templateId], flush: jest.fn(), getConnection: () => ({ execute: async () => [{ client_view_md: null }] }) }
    const strategyStep = jest.fn(async (ctx: StepContext) => {
      expect(ctx.repairFindings.map((f) => f.fix_step)).toEqual(['5.2'])
      expect(ctx.attempt).toBe(2)
      return { taskRunId: 'run-52b', versionId: 'v-strategy-2', status: 'done' }
    })
    const tovStep = jest.fn(async (ctx: StepContext) => {
      expect(ctx.repairFindings).toEqual([])
      return { taskRunId: 'run-53b', versionId: 'v-tov-2', status: 'done' }
    })
    const ctx = {
      em, scope: { tenantId: 't', organizationId: 'o' }, orderRef: 'o', order, orderVersion: { document_id: 'WEW-DANE-ZAMOWIENIA@o', version: '1.0' },
      runAgent: createFixtureRunner(canned), runner: 'fixture', models, ledger: ledger(), onEvent: () => {}, log: () => {},
      agentRunIds: [], taskRunIds: [], documentVersionIds: [], fetchPage: async () => { throw new Error('no fetch') }, repairFindings: [], attempt: 1,
    } as unknown as StepContext
    const outcome = await runStrategyQaLoop(ctx, { strategyStep, tovStep })
    expect(strategyStep).toHaveBeenCalledTimes(1)
    expect(tovStep).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ verdict: 'ready_for_approval', repairs: 1, taskRunId: 'run-54', strategyVersionId: 'v-WZR-STRATEGIA', tovVersionId: 'v-WZR-TOV' })
    expect(outcome.escalationVersionId).toBeUndefined()
    expect(documents['WZR-STRATEGIA'].status).toBe('ready_for_review')
    expect(documents['WZR-TOV'].status).toBe('ready_for_review')
    expect(mocked.finishTaskRun).toHaveBeenCalledWith(em, { id: 'run-54' }, expect.objectContaining({ status: 'to_fix', qaResult: expect.objectContaining({ verdict: 'needs_agent_fix', repairs: 0 }) }))
    expect(mocked.finishTaskRun).toHaveBeenLastCalledWith(em, { id: 'run-54' }, expect.objectContaining({ status: 'done', qaResult: expect.objectContaining({ verdict: 'ready_for_approval', repairs: 1 }) }))
  })
})

describe('runStrategyStep (5.2, DB)', () => {
  it('marks the strategy as simulated when the brief it reads is not approved', async () => {
    const mocked = store as jest.Mocked<typeof store>
    const versions: Record<string, { status: string; data: unknown }> = {
      'WZR-BRIEF': { status: 'ready_for_review', data: brief('awaiting_client') },
      'WZR-ZRODLA': { status: 'ready_for_review', data: zrodla() },
      'WZR-AUDYT': { status: 'ready_for_review', data: audyt() },
    }
    mocked.currentInputVersion.mockImplementation(async (_em, _scope, _orderRef, templateId) => {
      const row = versions[templateId]
      return row ? { document_id: `${outputIdByTemplate[templateId]}@o`, version: '1.0', status: row.status, versionId: `v-${templateId}`, data: row.data } : null
    })
    mocked.startTaskRun.mockResolvedValue({ id: 'run-52' } as never)
    mocked.finishTaskRun.mockResolvedValue(undefined)
    mocked.saveDocumentVersion.mockResolvedValue({ version: { id: 'v-strategy-1' } } as never)
    const ctx = {
      em: {}, scope: { tenantId: 't', organizationId: 'o' }, orderRef: 'o', order, orderVersion: { document_id: 'WEW-DANE-ZAMOWIENIA@o', version: '1.0', status: 'approved' },
      runAgent: createFixtureRunner(canned), runner: 'fixture', models, ledger: ledger(), onEvent: () => {}, log: () => {},
      agentRunIds: [], taskRunIds: [], documentVersionIds: [], fetchPage: async () => { throw new Error('no fetch') }, repairFindings: [], attempt: 1,
    } as unknown as StepContext
    const outcome = await runStrategyStep(ctx)
    expect(outcome).toEqual({ taskRunId: 'run-52', versionId: 'v-strategy-1', status: 'done' })
    const saved = mocked.saveDocumentVersion.mock.calls[0][2]
    expect(saved.templateId).toBe('WZR-STRATEGIA')
    expect(saved.simulation).toBe(true)
    expect(saved.status).toBe('draft')
    expect(saved.issues.some((i) => i.code === 'SIMULATED_INPUT' && /KLI-BRIEF@o v1\.0 \(ready_for_review\)/.test(i.detail))).toBe(true)
    expect(saved.inputVersions.map((v) => v.document_id)).toEqual(['WEW-DANE-ZAMOWIENIA@o', 'KLI-BRIEF@o', 'WEW-ZRODLA@o', 'WEW-AUDYT@o'])
    expect(ctx.documentVersionIds).toEqual(['v-strategy-1'])
  })
})
