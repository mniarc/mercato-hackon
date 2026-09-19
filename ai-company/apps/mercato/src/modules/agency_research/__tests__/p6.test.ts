import path from 'node:path'
import { briefDataSchema, type BriefData } from '../data/schemas/brief'
import { planDataSchema, type PlanData } from '../data/schemas/plan'
import { strategiaDataSchema, type StrategiaData } from '../data/schemas/strategia'
import { tovDataSchema, type TovData } from '../data/schemas/tov'
import { orderDataSchema, orderFactsOf } from '../data/schemas/zamowienie'
import { zleceniePostuDataSchema } from '../data/schemas/zleceniePostu'
import { zrodlaDataSchema, type ZrodlaData } from '../data/schemas/zrodla'
import { limits } from '../data/templates'
import { createLedger } from '../lib/research/ledger'
import { GateError } from '../lib/research/gate'
import { renderPlan, renderPlanClientView, ROW_WORDS_MAX } from '../lib/research/render/plan'
import { renderZleceniePostu } from '../lib/research/render/zleceniePostu'
import { gateTopicsSection, knownPlanIds, planValidatorFindings, runPlanPipeline } from '../lib/research/steps/plan'
import { mergePlanQaVerdict, planReadyForApproval, runPlanQa, runPlanQaLoop } from '../lib/research/steps/planQa'
import { applySelection } from '../lib/research/steps/selection'
import { assemblePostInstruction } from '../lib/research/steps/postInstruction'
import type { StepContext } from '../lib/research/steps/context'
import { countClientWords } from '../lib/research/util'
import { createFixtureRunner } from '../lib/runners'
import * as store from '../lib/store'

jest.mock('../lib/store', () => {
  const actual = jest.requireActual('../lib/store')
  return { ...actual, startTaskRun: jest.fn(), finishTaskRun: jest.fn(), currentInputVersion: jest.fn() }
})

const canned = path.join(__dirname, '..', '__fixtures__', 'flow', 'canned')
const models = { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }
const orderOf = (platform: string) =>
  orderFactsOf(
    orderDataSchema.parse({
      product_selection: { sku: 'START-KOMUNIKACJI-PL-01', offer_version: 'v1', price_net: 2500, currency: 'PLN', result_limits: { topics: 12 } },
      brand: { display_name: 'FLOW Centrum Badawcze', website_url: 'https://makeitflow.pl/index.php' },
      market_language: { market: 'Polska', language: 'pl' },
      official_social: { url: 'https://www.linkedin.com/company/flow-centrum-badawcze/', platform, provenance: 'client_provided' },
      purchase_goal: 'Wyjaśnić, jak FLOW pomaga dojść od problemu do rozwiązania.',
    }),
  )
const order = orderOf('LinkedIn')

const src = (id: string): ZrodlaData['sources'][number] => ({
  source_id: id, canonical_source_id: id, independent_material_id: `MAT-${id}`, url_or_file: 'https://makeitflow.pl/index.php', publisher: 'FLOW', kind: 'oficjalna strona', title: 'FLOW — opis i FAQ',
  retrieved_at: '2026-09-19T10:00:00.000Z', published_at: null, access: 'full', read_scope: 'read', limitation: null, source_visibility: 'public', duplicate_of: null, origin: 'purchase_form',
})
const fact = (id: string, claim: string): ZrodlaData['facts'][number] => ({
  fact_id: id, entity: 'FLOW', claim, source_ids: ['S-01'], locator: { source_id: 'S-01', quote: claim, char_offset: 0 }, paraphrase: claim, kind: 'first_party_claim', use_scope: [], limitation: null,
})
const seed = (id: string, question: string, factIds: string[], proofIds: string[]): ZrodlaData['content_bank'][number] => ({
  seed_id: id, audience_question: question, angle: `ujęcie ${id}`,
  source_claim: { text: `Deklaracja firmy dla ${id}: punktem wyjścia jest problem, nie technologia.`, fact_ids: factIds, source_ids: ['S-01'], provenance: 'observed' },
  proposed_utility: { text: `Autorska checklista dla ${id}.`, provenance: 'creative_proposal' },
  fact_ids: factIds, proof_ids: proofIds, provenance: 'inferred',
  reuse_of_evidence: { note: null, shared_fact_ids: [], shared_proof_ids: [] },
  prohibited_claims: ['Nie obiecywać wyniku, którego nie ma w faktach.'], readiness: 'ready', readiness_reason: null,
})

function zrodla(): ZrodlaData {
  const questions = ['Od czego zacząć, gdy chcemy nowego narzędzia?', 'Czy musimy mieć specyfikację?', 'Kiedy AI ma sens?', 'Jak sprawdzić założenia?', 'Co składa się na diagnozę?', 'Cały cykl czy etap?', 'Ile to kosztuje?', 'Czym jest Flowco.AI?', 'Co daje partnerstwo?', 'Jak brzmi produkt cyfrowy?', 'Jak szybko prototyp?', 'Od czego zacząć z narzędziem do procesu?', 'Jak rozmawiać o budżecie?']
  return zrodlaDataSchema.parse({
    sources: [src('S-01')],
    facts: Array.from({ length: 11 }, (_, index) => fact(`F${String(index + 1).padStart(2, '0')}`, `Fakt numer ${index + 1} o sposobie pracy FLOW.`)),
    proof_cards: [
      { proof_id: 'P01', proof_type: 'declaration', problem: 'p', actual_action: null, artifact_or_method: 'Cztery obszary diagnozy', observed_result: null, fact_ids: ['F03', 'F04'], source_ids: ['S-01'], limitations: ['brak zmierzonego wyniku'], source_visibility: 'public', allowed_use: 'client_review', use_basis_ref: 'KLI-BRIEF.assets_and_permissions', client_name_permission: 'not_applicable', quote_permission: 'granted', provenance: 'inferred' },
      { proof_id: 'P02', proof_type: 'declaration', problem: null, actual_action: null, artifact_or_method: 'AI tylko z uzasadnieniem', observed_result: null, fact_ids: ['F05'], source_ids: ['S-01'], limitations: [], source_visibility: 'public', allowed_use: 'internal_only', use_basis_ref: null, client_name_permission: 'unknown', quote_permission: 'unknown', provenance: 'inferred' },
    ],
    language_samples: [],
    audience_signals: [],
    content_bank: questions.map((question, index) => seed(`T${String(index + 1).padStart(2, '0')}`, question, [`F${String((index % 11) + 1).padStart(2, '0')}`], index % 2 ? ['P02'] : ['P01'])),
    conflicts: [],
    coverage: [],
  })
}

function strategia(): StrategiaData {
  const claim = (id: string, allowed: string) => ({ claim_id: id, allowed_claim: allowed, mechanism: 'diagnoza', proof_ids: ['P01'], fact_ids: ['F03'], source_ids: ['S-01'], status: 'declared_method' as const, limitations: ['deklaracja, nie wynik'], forbidden_claim: 'gwarancja efektu', confirmation_owner: 'none_needed' })
  const pillar = (id: string, area: string) => ({ pillar_id: id, area, strategic_goal: `cel ${id}`, audience_question: `pytanie ${id}`, allowed_content: ['sposób pracy'], exclusions: ['wyniki liczbowe'], claim_ids: ['CL01'], seed_ids: ['T01'] })
  return strategiaDataSchema.parse({
    strategic_choice: { positioning: 'Partner od problemu do rozwiązania', audience: 'Właściciele procesów w firmach B2B', situation: 'potrzeba nowego narzędzia', category: 'badania i wdrożenia', decision: 'KLI-BRIEF.priority_offer', deprioritized: ['szkolenia'], rationale: 'najlepiej udokumentowana oferta', status: 'client_decision', evidence_ids: ['F01'] },
    buyer_tension: { desired_progress: 'sprawniejszy proces', barrier: 'brak specyfikacji', illustrative_objection: 'musimy mieć specyfikację', objection_status: 'illustrative_hypothesis', status_quo_risk: 'obejścia', decision_criterion: { text: null, status: 'unknown', origin: 'brak danych', empirical_buyer_evidence: null }, evidence_status: 'hipoteza', evidence_ids: ['F04'] },
    uvp: { claim_id: 'CL01', working_sentence: 'Zaczynamy od problemu, nie od technologii.', explanation: ['diagnoza przed specyfikacją'], mechanism: 'cztery obszary diagnozy', alternative: 'software house budujący ze specyfikacji', reason_to_believe: 'opisany sposób pracy', evidence_ids: ['F03'], support_level: 'declared_method', use_conditions: ['bez obietnicy wyniku'], alternative_status: 'hipoteza' },
    options_considered: [{ direction: 'AI-first', advantage: 'modne', rejection: 'brak dowodów' }],
    proof_architecture: [claim('CL01', 'Zaczynamy od diagnozy problemu.'), claim('CL02', 'AI tylko z uzasadnieniem biznesowym.'), claim('CL03', 'Cały cykl albo jeden etap.')],
    message_hierarchy: { main_promise: { text: 'Od problemu do uzasadnionego rozwiązania', status: 'declared_method', claim_ids: ['CL01'] }, supporting_messages: [{ order: 1, text: 'diagnoza', claim_ids: ['CL01'], fact_ids: ['F03'] }], explanation_order: ['problem', 'diagnoza', 'rozwiązanie'] },
    pillars: [pillar('PL01', 'Problem przed narzędziem'), pillar('PL02', 'Sposób pracy'), pillar('PL03', 'Decyzje o zakresie')],
    channel_role: { channel: 'LinkedIn firmy FLOW', role: 'pierwsze skojarzenie', knowledge_level: 'ogólny', contact_path: 'strona', content_scope: 'sposób pracy', limits: 'bez wyników liczbowych', contact_owner: null, evidence_ids: ['F07'] },
    measurement_hypothesis: { hypothesis: 'więcej zapytań z opisem problemu', observable_signals: ['zapytania'], measures: [{ name: 'zapytania', definition: 'liczba wiadomości' }], baseline: null, numerical_target: null, future_test: 'porównanie kwartałów', causality_limit: 'brak atrybucji', evidence_ids: [] },
    creative_boundaries: { not_promoted: ['szkolenia'], prohibited_promises: ['Procentowe oszczędności.', 'Jedyność na rynku.'], permitted_creativity: 'metafory i pytania', rights: 'cytaty tylko z materiałów publicznych', open_assumptions: ['brak analityki wewnętrznej'], plan_effect: 'tematy bez liczb', research_return_required: false },
  })
}

function tov(): TovData {
  const principle = (trait: string, behavior: string) => ({ trait, purpose: 'cel', author_behavior: behavior, typical_error: 'błąd' })
  const axis = (axis: TovData['style_axes'][number]['axis']) => ({ axis, position: 'środek', example: 'przykład', change_when: 'nigdy' })
  return tovDataSchema.parse({
    voice_principles: [principle('konkretny', 'Otwórz trudnością odbiorcy, nie listą kompetencji.'), principle('partnerski', 'Nazwij niewiadome zamiast pouczać.'), principle('jasny', 'Wyjaśnij termin przez czynność.'), principle('ostrożny', 'Opisuj sposób pracy bez gwarancji wyniku.'), principle('uczciwy', 'Oznacz wymyślony przykład w tekście.'), principle('nadmiarowy', 'Ta zasada nie mieści się w wyciągu.')],
    style_axes: (['formality', 'directness', 'technicality', 'humor', 'claim_strength'] as const).map(axis),
    wording: { preferred_in_context: ['diagnoza'], replacements: [{ avoid: 'rewolucja', use: 'zmiana' }], replacement_boundary: 'nie zmieniaj cytatów', cliches: ['rewolucyjny', 'game changer'], expert_terms: 'wyjaśniaj', sentence_pattern: 'Chcesz zmienić proces? Zacznij od opisania sytuacji.' },
    evidence_language: [{ type: 'fact', pattern: 'Firma deklaruje…', forbidden_upgrade: 'Firma gwarantuje…' }],
    before_after: [{ before: 'Jesteśmy liderem.', after: 'Zaczynamy od problemu.', changed_principle: 'konkretny', fact_ids: ['F03'], status: 'grounded' }],
    context_rules: [{ situation: 'pytanie o cenę', tone_and_example: 'spokojnie', boundary: 'bez kwot' }],
    copy_checks: ['Czy otwarcie nazywa problem odbiorcy?', 'Czy każdy fakt ma źródło?', 'Czy brak liczb bez dowodu?', 'Czy CTA jest jedno?', 'Czy przykład jest oznaczony?', 'Czy brak klisz?'],
  })
}

function brief(): BriefData {
  const decided = { decision_state: 'client_selected' as const, decision_ref: 'WEW-USTALENIA', fact_ids: ['F01'] }
  return briefDataSchema.parse({
    priority_offer: { value: 'Pomoc w rozpoznaniu problemu i uzasadnionym rozwiązaniu cyfrowym.', ...decided, result_for_audience: 'podstawa decyzji', excluded_from_scope: ['szkolenia'] },
    priority_audience: { value: 'Właściciele procesów, COO i liderzy produktu w polskich firmach B2B.', ...decided, priority_choice: { segment: 'B2B', target_role: ['COO'], decision_ref: null, decision_version: null, decision_state: 'client_selected' }, buyer_claims: [], secondary_groups: null },
    business_direction: { value: 'Więcej zapytań z opisanym problemem.', ...decided, from_to: 'od zleceń ze specyfikacją do rozmów o problemie', horizon: null, baseline: null, communication_role: 'edukacja', not_promised: ['wyniki liczbowe'] },
    buyer_reality: [],
    promise_constraints: { capabilities: 'sposób pracy', result_limits: 'brak zmierzonych efektów', prohibited_claims: ['Gwarancja czasu.', 'Liczba klientów.'], allowed_proof_ids: ['P01'], rights_by_proof: [], fact_ids: ['F03'] },
    voice_preferences: { desired_traits: ['konkretny'], unwanted_traits: ['nadęty'], style_preferences: { jargon: null, humor: null, formalness: null }, proposed_examples: [], client_selection: null, decision_version: null, decision_state: 'awaiting_client', sample_ids: [] },
    channel_and_cta: { channel: 'LinkedIn firmy FLOW', audience_context: 'B2B', cta_goal: 'Zaproszenie do rozmowy o konkretnej trudności.', cta_text: 'Masz konkretną trudność w procesie? Opisz ją nam przez stronę.', destination: 'https://makeitflow.pl/index.php', destination_visibility: 'observed', destination_functionality: 'not_checked', owner: null, required_owner_before_publish: true, draft_readiness: 'conditional', publication_readiness: 'blocked', limits: ['bez nowych URL'], fact_ids: ['F07'], decision_state: 'client_selected' },
    success_and_limits: { directional_goal: 'więcej zapytań', measurement_proposals: [], baseline: null, numerical_target: null, scope_limit: 'jeden post' },
    assets_and_permissions: [],
    open_assumptions: [],
  })
}

const versions = { 'KLI-STRATEGIA': '1.0', 'KLI-TOV': '1.0', 'KLI-BRIEF': '1.0', 'WEW-ZRODLA': '1.0' }

async function runPipeline(overrides: Partial<Parameters<typeof runPlanPipeline>[0]> = {}) {
  const calls: { agentId: string; input: unknown }[] = []
  const result = await runPlanPipeline({ order, outputLanguage: 'pl', strategia: strategia(), tov: tov(), brief: brief(), zrodla: zrodla(), versions, simulation: true, runAgent: createFixtureRunner(canned, { calls }), ledger: createLedger({ prices: {} }), models, ...overrides })
  return { ...result, calls }
}

describe('runPlanPipeline (6.2)', () => {
  it('assembles twelve topics from two windows and a balance call, minting TOP ids by day', async () => {
    const { data, issues, calls, stats } = await runPipeline()
    expect(planDataSchema.safeParse(data).success).toBe(true)
    expect(calls.map((c) => (c.input as { section: string }).section)).toEqual(['topics_1_6', 'topics_7_12', 'balance_recommendation'])
    expect(stats.agentCalls).toBe(3)
    expect(data.topics.map((t) => t.topic_id)).toEqual(Array.from({ length: 12 }, (_, i) => `TOP${String(i + 1).padStart(2, '0')}`))
    expect(data.topics.map((t) => t.day)).toEqual([...data.topics.map((t) => t.day)].sort((a, b) => a - b))
    expect(new Set(data.topics.map((t) => t.day)).size).toBe(12)
    expect(data.plan_context).toMatchObject({ topic_count: 12, finished_posts_in_scope: 1, channel: 'LinkedIn firmy FLOW', simulation_flag: true, versions })
    expect(data.balance.pillar_counts).toEqual({ PL01: 4, PL02: 4, PL03: 4 })
    expect(data.recommendation).toMatchObject({ topic_id: 'TOP01', readiness: 'ready' })
    expect(data.selected_topic).toEqual({ topic_id: null, status: 'awaiting_client', decision_id: null, decision_version: null, decision_text: null, real_approval: false })
    expect(data.topics.every((t) => t.seed_ids.length + t.fact_ids.length > 0)).toBe(true)
    expect(data.topics.find((t) => t.topic_id === 'TOP05')?.evidence_reuse_note).toContain('TOP01')
    expect(issues.some((i) => i.code === 'CLIENT_VIEW_OVER_BUDGET' || i.code === 'CLIENT_VIEW_ROW_OVER_BUDGET')).toBe(false)
    // The balance call sees the twelve gated topics with their final ids.
    const balanceInput = calls[2].input as { existing_topics: { topic_id: string }[] }
    expect(balanceInput.existing_topics.map((t) => t.topic_id)).toContain('TOP12')
  })

  it('passes the deterministic Q-P checks and stays ready for approval', async () => {
    const { data } = await runPipeline()
    const findings = planValidatorFindings({ plan: data, strategia: strategia(), zrodla: zrodla(), topicCount: 12 })
    expect(findings.filter((f) => f.severity === 'blocking')).toEqual([])
    expect(planReadyForApproval(data, 12)).toBe(true)
    expect(mergePlanQaVerdict(findings)).toBe('ready_for_approval')
  })

  it('renders the client table within the row and commentary budgets, marking one topic', async () => {
    const { data, clientViewMd } = await runPipeline()
    const rows = clientViewMd.split('\n').filter((line) => /^\| \d+ \|/.test(line))
    expect(rows).toHaveLength(12)
    expect(rows.every((row) => countClientWords(row) <= ROW_WORDS_MAX)).toBe(true)
    expect(rows.filter((row) => row.includes('rekomendowany')).length).toBe(1)
    expect(clientViewMd).not.toMatch(/\bF0\d\b|\bT0\d\b|readiness/)
    const view = renderPlanClientView({ outputLanguage: 'pl', brand: 'FLOW', data })
    expect(view.limit).toBe(150)
    expect(view.words).toBeLessThanOrEqual(150)
    const internal = renderPlan({ outputLanguage: 'pl', brand: 'FLOW', data, issues: [] })
    expect(internal).toContain('TOP12')
    expect(internal).toContain('CL01')
    const wide = { ...data, topics: data.topics.map((t, i) => (i === 0 ? { ...t, angle: { ...t.angle, steps: Array.from({ length: 12 }, (_, n) => `krok numer ${n} z wieloma słowami do policzenia w budżecie wiersza`) } } : t)) }
    const wideRows = renderPlanClientView({ outputLanguage: 'pl', brand: 'FLOW', data: wide }).markdown.split('\n').filter((line) => /^\| \d+ \|/.test(line))
    expect(wideRows.every((row) => countClientWords(row) <= ROW_WORDS_MAX)).toBe(true)
  })
})

describe('gateTopicsSection', () => {
  const known = knownPlanIds(strategia(), zrodla())
  const pillarIds = new Set(['PL01', 'PL02', 'PL03'])
  const base = (localRef: string, day: number, question: string, extra: Record<string, unknown> = {}) => ({
    local_ref: localRef, day, pillar_id: 'PL01', audience_question: question, topic: question, main_message: `${question} — odpowiedź`, format: 'text',
    angle: { tool: 'narzędzie', steps: ['krok'], status: 'creative_proposal', example: null }, claim_ids: ['CL01'], seed_ids: ['T01'], fact_ids: ['F03'], proof_ids: ['P01'], source_ids: ['S-01'],
    evidence_excerpt: 'fragment', evidence_limits: 'bez liczb', post_goal: 'cel', cta: 'kontakt', cta_type: 'contact' as const, readiness: 'ready' as const, readiness_scope: 'ok', evidence_reuse_note: null, ...extra,
  })

  it('drops a paraphrase, an unknown pillar and a topic without evidence, and moves a day into the window', () => {
    const topics = [
      base('A', 2, 'Od czego zacząć, gdy chcemy nowego narzędzia?'),
      base('B', 2, 'Od czego zacząć, gdy chcemy nowego narzędzia do procesu?'),
      base('C', 20, 'Kiedy AI ma sens?', { pillar_id: 'PL09' }),
      base('D', 5, 'Ile kosztuje diagnoza?', { seed_ids: ['T99'], fact_ids: ['F99'] }),
      base('E', 25, 'Jak rozmawiać o budżecie z zespołem?'),
    ]
    const gated = gateTopicsSection('topics_1_6', { topics }, { known, pillarIds, count: 2, existing: [] })
    expect(gated.value.topics?.map((t) => t.local_ref)).toEqual(['A', 'E'])
    expect(gated.value.topics?.[1].day).toBe(15)
    expect(gated.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['DUPLICATE_TOPIC', 'UNKNOWN_PILLAR', 'UNKNOWN_ID', 'NO_EVIDENCE', 'DAY_OUT_OF_WINDOW']))
  })

  it('rejects the call when fewer usable topics than required survive', () => {
    expect(() => gateTopicsSection('topics_1_6', { topics: [base('A', 1, 'Jedno pytanie?')] }, { known, pillarIds, count: 6, existing: [] })).toThrow(GateError)
  })
})

describe('planValidatorFindings', () => {
  it('flags the count, a numeric promise without a measured proof and a recommendation that is not ready', async () => {
    const { data } = await runPipeline()
    const plan: PlanData = { ...data, topics: data.topics.slice(0, 11).map((t, i) => (i === 0 ? { ...t, main_message: 'Diagnoza skraca projekt o 30% i oszczędza 40 godzin.', readiness: 'conditional' } : t)) }
    const findings = planValidatorFindings({ plan, strategia: strategia(), zrodla: zrodla(), topicCount: 12 })
    expect(findings.map((f) => f.code)).toEqual(expect.arrayContaining(['limit_exceeded', 'invented_effectiveness']))
    expect(findings.find((f) => f.path === 'KLI-PLAN.recommendation.topic_id')).toMatchObject({ owner: 'research', fix_step: null })
    expect(mergePlanQaVerdict(findings)).toBe('needs_agent_fix')
    expect(planReadyForApproval(plan, 12)).toBe(false)
  })
})

describe('runPlanQa / runPlanQaLoop (6.3)', () => {
  it('drops stray finding paths and merges the validator with the agent verdict', async () => {
    const { data } = await runPipeline()
    const runAgent = createFixtureRunner(canned)
    const first = await runPlanQa({ order, outputLanguage: 'pl', plan: data, strategia: strategia(), zrodla: zrodla(), runAgent, ledger: createLedger({ prices: {} }), models })
    expect(first.verdict).toBe('needs_agent_fix')
    expect(first.findings.some((f) => f.path.startsWith('SOMEWHERE'))).toBe(false)
    const second = await runPlanQa({ order, outputLanguage: 'pl', plan: data, strategia: strategia(), zrodla: zrodla(), runAgent, ledger: createLedger({ prices: {} }), models })
    expect(second.verdict).toBe('ready_for_approval')
  })

  it('re-runs the plan step once on an agent fault, then moves the plan to ready_for_review', async () => {
    const { data } = await runPipeline()
    const mocked = store as jest.Mocked<typeof store>
    const docs: Record<string, unknown> = { 'WZR-PLAN': data, 'WZR-STRATEGIA': strategia(), 'WZR-ZRODLA': zrodla() }
    mocked.currentInputVersion.mockImplementation(async (_em, _scope, _orderRef, templateId) => ({ document_id: `${templateId}@o`, version: '1.0', status: 'draft', versionId: `v-${templateId}`, data: docs[templateId] }))
    mocked.startTaskRun.mockResolvedValue({ id: 'run-63' } as never)
    mocked.finishTaskRun.mockResolvedValue(undefined)
    const document = { status: 'draft' }
    const em = { findOne: async () => document, flush: jest.fn() }
    const planStep = jest.fn(async (ctx: StepContext) => {
      expect(ctx.repairFindings.length).toBeGreaterThan(0)
      expect(ctx.attempt).toBe(2)
      return { taskRunId: 'run-62b', versionId: 'v-plan-2', status: 'done' }
    })
    const ctx = {
      em, scope: { tenantId: 't', organizationId: 'o' }, orderRef: 'o', order, orderVersion: { document_id: 'WEW-DANE-ZAMOWIENIA@o', version: '1.0' },
      runAgent: createFixtureRunner(canned), runner: 'fixture', models, ledger: createLedger({ prices: {} }), onEvent: () => {}, log: () => {},
      agentRunIds: [], taskRunIds: [], documentVersionIds: [], fetchPage: async () => { throw new Error('no fetch') }, repairFindings: [], attempt: 1,
    } as unknown as StepContext
    const outcome = await runPlanQaLoop(ctx, { planStep })
    expect(planStep).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ verdict: 'ready_for_approval', repairs: 1, taskRunId: 'run-63', readyForApproval: true })
    expect(document.status).toBe('ready_for_review')
    expect(mocked.finishTaskRun).toHaveBeenCalledWith(em, { id: 'run-63' }, expect.objectContaining({ status: 'done', qaResult: expect.objectContaining({ verdict: 'ready_for_approval', repairs: 1 }) }))
  })
})

describe('applySelection (6.5)', () => {
  it('records a simulated selection of the recommendation when no topic is passed', async () => {
    const { data } = await runPipeline()
    const result = applySelection({ plan: data, planApproved: false, selectedTopicId: null, outputLanguage: 'pl' })
    expect(result.status).toBe('done')
    expect(result.data.selected_topic).toMatchObject({ topic_id: 'TOP01', status: 'simulated_selection', real_approval: false, decision_id: null })
  })

  it('accepts a topic of this version as a simulated selection while the plan is unapproved, and refuses one that is not in the plan', async () => {
    const { data } = await runPipeline()
    const picked = applySelection({ plan: data, planApproved: false, selectedTopicId: 'top3', outputLanguage: 'pl' })
    expect(picked.data.selected_topic).toMatchObject({ topic_id: 'TOP03', status: 'simulated_selection', real_approval: false })
    const missing = applySelection({ plan: data, planApproved: true, selectedTopicId: 'TOP99', decisionId: 'DEC-1', outputLanguage: 'pl' })
    expect(missing).toMatchObject({ status: 'to_fix', error: expect.stringContaining('topic_not_in_plan') })
    const real = applySelection({ plan: data, planApproved: true, selectedTopicId: 'TOP03', decisionId: 'DEC-1', outputLanguage: 'pl' })
    expect(real.data.selected_topic).toMatchObject({ topic_id: 'TOP03', status: 'client_selected', real_approval: true, decision_id: 'DEC-1' })
  })
})

describe('assemblePostInstruction (6.7)', () => {
  const instructionFor = async (platform: string) => {
    const { data } = await runPipeline()
    const plan = applySelection({ plan: data, planApproved: false, selectedTopicId: null, outputLanguage: 'pl' }).data
    return assemblePostInstruction({
      order: orderOf(platform), outputLanguage: 'pl', plan, planVersion: { document_id: 'KLI-PLAN@o', version: '2.0', status: 'draft' },
      strategia: strategia(), tov: tov(), tovVersion: { document_id: 'KLI-TOV@o', version: '1.0', status: 'ready_for_review' }, brief: brief(), zrodla: zrodla(),
    })
  }

  it('compiles the instruction from the selected topic with evidence texts, rights, a five-rule voice extract and the adapter limit', async () => {
    const { data, issues } = await instructionFor('LinkedIn')
    expect(zleceniePostuDataSchema.safeParse(data).success).toBe(true)
    expect(data.selected_item).toMatchObject({ topic_id: 'TOP01', seed_id: 'T01', plan_id: 'KLI-PLAN@o', plan_version: '2.0', selection_status: 'simulated_selection', audience_question: 'Od czego zacząć, gdy chcemy nowego narzędzia?' })
    expect(data.selected_item.task).toContain('FLOW Centrum Badawcze')
    const kinds = data.evidence_payload.map((card) => card.kind)
    expect(kinds).toContain('source_claim')
    expect(kinds).toContain('creative_proposal')
    expect(data.evidence_payload.every((card) => card.text.length > 20)).toBe(true)
    const claim = data.evidence_payload.find((card) => card.claim_id === 'CL01')
    expect(claim).toMatchObject({ fact_ids: ['F03'], source_payload: [expect.objectContaining({ source_id: 'S-01', url: 'https://makeitflow.pl/index.php' })] })
    expect(claim?.rights_and_limits).toMatchObject({ source_visibility: 'public', allowed_use: 'client_review', client_name_permission: 'not_applicable', quote_permission: 'granted', publication_approval: 'missing' })
    expect(data.reader_value).toMatchObject({ type: 'mini_checklist', title: 'Cztery pytania przed wyborem technologii', items: expect.arrayContaining(['Nazwij sytuację, którą chcesz zmienić.']) })
    expect(data.reader_value.status).toContain('creative_proposal')
    expect(data.voice_extract.rules).toHaveLength(limits.content.voiceExtractRulesMax)
    expect(data.voice_extract).toMatchObject({ tov_id: 'KLI-TOV@o', tov_version: '1.0', forbidden_cliches: ['rewolucyjny', 'game changer'] })
    expect(data.delivery_constraints).toMatchObject({ channel: 'LinkedIn firmy FLOW', adapter_id: 'linkedin-company-post-text', adapter_version: '0.1.0', max_text_length: 3000, length_unit: 'characters', platform_limit_status: 'known', finished_post_count: 1, cta_destination: 'https://makeitflow.pl/index.php', cta_publication_readiness: 'blocked', product_length_target: { words: [120, 220] } })
    expect(data.delivery_constraints.links.map((link) => link.url)).toEqual(['https://makeitflow.pl/index.php'])
    expect(data.delivery_constraints.links[0]).toMatchObject({ visibility_status: 'observed', operational_status: 'not_checked' })
    expect(data.delivery_constraints.prohibited_claims).toEqual(expect.arrayContaining(['Procentowe oszczędności.', 'Gwarancja czasu.']))
    expect(data.completion).toHaveLength(7)
    expect(data.completion.some((line) => line.includes('CL01'))).toBe(true)
    expect(issues.some((issue) => issue.severity === 'blocking')).toBe(false)
    const rendered = renderZleceniePostu({ outputLanguage: 'pl', brand: 'FLOW', data, issues })
    expect(rendered).toContain('## Karty dowodów')
    expect(rendered).toContain('3000 characters')
  })

  it('marks the platform limit unknown for a platform without an adapter', async () => {
    const { data, issues } = await instructionFor('Mastodon')
    expect(data.delivery_constraints).toMatchObject({ adapter_id: null, adapter_version: null, max_text_length: null, length_unit: null, platform_limit_status: 'unknown' })
    expect(issues.some((issue) => issue.code === 'ADAPTER_UNKNOWN')).toBe(true)
  })

  it('refuses to compile without a selected topic', async () => {
    const { data } = await runPipeline()
    expect(() =>
      assemblePostInstruction({ order, outputLanguage: 'pl', plan: data, planVersion: { document_id: 'KLI-PLAN@o', version: '1.0' }, strategia: strategia(), tov: tov(), tovVersion: { document_id: 'KLI-TOV@o', version: '1.0' }, brief: brief(), zrodla: zrodla() }),
    ).toThrow(/selected topic/)
  })
})
