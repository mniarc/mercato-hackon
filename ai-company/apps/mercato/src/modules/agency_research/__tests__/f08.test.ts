import path from 'node:path'
import { audytDataSchema, type AudytData } from '../data/schemas/audyt'
import { eskalacjaDataSchema } from '../data/schemas/eskalacja'
import { konkurencjaDataSchema, type KonkurencjaData } from '../data/schemas/konkurencja'
import type { QaFinding, QaResult } from '../data/schemas/qa'
import { ustaleniaDataSchema } from '../data/schemas/ustalenia'
import type { OrderFacts } from '../data/schemas/zamowienie'
import { zrodlaDataSchema, type ZrodlaData } from '../data/schemas/zrodla'
import { buildEscalation, qaExhaustedResolutions } from '../lib/research/escalate'
import { createLedger } from '../lib/research/ledger'
import type { PipelineEvent } from '../lib/research/pipeline'
import { renderUstalenia, renderUstaleniaClientView } from '../lib/research/render/ustalenia'
import { renderEskalacja } from '../lib/research/render/eskalacja'
import { gateFieldMap, gateQuestions, gateReadiness, knownIdsOf, runFindingsPipeline, seededFieldRows } from '../lib/research/steps/findings'
import { freezeSetHash } from '../lib/research/steps/freeze'
import { mergeQaVerdict, runAnalysisQa, validatorFindings } from '../lib/research/steps/qa'
import { createFixtureRunner } from '../lib/runners'
import { checkClientView } from '../lib/research/clientView'

const canned = path.join(__dirname, '..', '__fixtures__', 'flow', 'canned')
const models = { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }

const order: OrderFacts = {
  brand: 'FLOW Centrum Badawcze',
  websiteUrl: 'https://makeitflow.pl/index.php',
  market: 'Polska',
  language: 'pl',
  outputLanguage: 'pl',
  officialSocialUrl: 'https://www.linkedin.com/company/flow-centrum-badawcze/',
  officialSocialPlatform: 'LinkedIn',
  purchaseGoal: 'Wyjaśnić, jak FLOW pomaga dojść od problemu do rozwiązania.',
  sku: 'START-KOMUNIKACJI-PL-01',
  topics: 12,
}

const zrodla: ZrodlaData = zrodlaDataSchema.parse({
  sources: [{ source_id: 'S-01', canonical_source_id: 'S-01', independent_material_id: 'MAT-01', url_or_file: 'https://makeitflow.pl/index.php', publisher: 'FLOW', kind: 'oficjalna strona', title: 'FLOW', retrieved_at: '2026-09-19T10:00:00.000Z', published_at: null, access: 'full', read_scope: '1158 chars', limitation: null, source_visibility: 'public', duplicate_of: null, origin: 'purchase_form' }],
  facts: [
    { fact_id: 'F01', entity: 'FLOW', claim: 'FLOW łączy badania, projektowanie i wdrażanie.', source_ids: ['S-01'], locator: { source_id: 'S-01', quote: 'FLOW łączy badania, projektowanie i wdrażanie rozwiązań cyfrowych', char_offset: 61 }, paraphrase: 'FLOW łączy badania, projektowanie i wdrażanie.', kind: 'first_party_claim', use_scope: ['oferta'], limitation: 'Deklaracja pozycjonowania.' },
    { fact_id: 'F02', entity: 'FLOW', claim: 'Strona udostępnia e-mail i telefon kontaktowy.', source_ids: ['S-01'], locator: { source_id: 'S-01', quote: 'Kontakt: kontakt@makeitflow.pl, tel. +48 000 000 000', char_offset: 900 }, paraphrase: 'Kontakt widoczny.', kind: 'observed', use_scope: ['cta'], limitation: 'Obsługi nie sprawdzono.' },
    { fact_id: 'F03', entity: 'FLOW', claim: 'Punktem wyjścia są potrzeby użytkowników, cel biznesowy, organizacja pracy i możliwości techniczne.', source_ids: ['S-01'], locator: { source_id: 'S-01', quote: 'Punktem wyjścia są potrzeby użytkowników, cel biznesowy, organizacja pracy i możliwości techniczne', char_offset: 300 }, paraphrase: 'Cztery obszary.', kind: 'first_party_claim', use_scope: ['mechanizm'], limitation: 'Opis metody.' },
    { fact_id: 'F04', entity: 'FLOW', claim: 'Klient może zgłosić się bez specyfikacji.', source_ids: ['S-01'], locator: { source_id: 'S-01', quote: 'Możesz zgłosić się do nas bez specyfikacji', char_offset: 400 }, paraphrase: 'Bez specyfikacji.', kind: 'first_party_claim', use_scope: ['zakup'], limitation: null },
  ],
  proof_cards: [{ proof_id: 'P01', proof_type: 'declaration', problem: 'Klient nie wie, jaki zakres opisać.', actual_action: null, artifact_or_method: 'Rozpoznanie czterech obszarów.', observed_result: null, fact_ids: ['F03', 'F04'], source_ids: ['S-01'], limitations: ['Metoda deklarowana.'], source_visibility: 'public', allowed_use: 'internal_only', use_basis_ref: null, client_name_permission: 'unknown', quote_permission: 'unknown', provenance: 'inferred' }],
  language_samples: [{ sample_id: 'L01', independent_material_id: 'MAT-01', canonical_source_id: 'S-01', source_id: 'S-01', excerpt_or_paraphrase: 'Technologia jest narzędziem. Nadal nie jest celem samym w sobie.', channel: 'WWW', suggested_audience: null, situation: null, linguistic_features: ['krótko'], observed_function: null, sample_limit: 'Krótki fragment.' }],
  audience_signals: [{ signal_id: 'A01', role_or_organization: 'właściciel procesu (interpretacja)', trigger: 'Potrzeba bez specyfikacji.', problem: 'Nie wiadomo, jaki zakres opisać.', risk: null, objection: 'Najpierw specyfikacja.', evidence_status: 'supplier_interpretation_not_customer_voice', fact_ids: ['F03', 'F04'] }],
  content_bank: [
    { seed_id: 'T01', audience_question: 'Od czego zacząć?', angle: 'Cztery pytania', source_claim: { text: 'Punktem wyjścia są potrzeby…', fact_ids: ['F03'], source_ids: ['S-01'], provenance: 'observed' }, proposed_utility: { text: 'Checklista.', provenance: 'creative_proposal' }, fact_ids: ['F03'], proof_ids: ['P01'], provenance: 'creative_proposal', reuse_of_evidence: { note: null, shared_fact_ids: [], shared_proof_ids: [] }, prohibited_claims: [], readiness: 'ready', readiness_reason: null },
    { seed_id: 'T02', audience_question: 'Czy trzeba mieć specyfikację?', angle: 'Rozmowa bez specyfikacji', source_claim: { text: 'Klient może zgłosić się bez specyfikacji.', fact_ids: ['F04'], source_ids: ['S-01'], provenance: 'observed' }, proposed_utility: { text: 'Pytania.', provenance: 'creative_proposal' }, fact_ids: ['F04'], proof_ids: [], provenance: 'creative_proposal', reuse_of_evidence: { note: null, shared_fact_ids: [], shared_proof_ids: [] }, prohibited_claims: [], readiness: 'ready', readiness_reason: null },
  ],
  conflicts: [{ conflict_id: 'X01', facts: ['F01', 'F03'], dates: ['2026-09-19T10:00:00.000Z'], detail: 'Różne akcenty.', impact: 'Hipoteza.', question: 'Jaka potrzeba jest kierunkiem?', state: 'framing_difference_not_factual_contradiction' }],
  coverage: [
    { item_type: 'requirement_coverage', requirement: 'segment', readiness: 'conditional', evidence_ids: ['A01'], gap: 'Interpretacja dostawcy.', owner: 'klient' },
    { item_type: 'requirement_coverage', requirement: 'CTA', readiness: 'conditional', evidence_ids: ['F02'], gap: 'Właściciel nieznany.', owner: 'agencja' },
    { item_type: 'plan_capacity', required_topics: 12, supported_angles: [], distinct_count: 2, ready_count: 2, unsupported_angles: [], readiness: 'conditional' },
  ],
})

const dimension = (finding: string, ids: string[] = ['L01']) => ({ finding, sample_ids: ids, interpretation_limit: null })
const audyt: AudytData = audytDataSchema.parse({
  offer_map: [{ service: 'Badania i diagnoza', described_audience: 'Klient bez specyfikacji', problem: 'Rozpoznanie potrzeb', result: 'Podstawa decyzji', mechanism: 'Cztery obszary', limits: 'Brak dowodu efektów', fact_ids: ['F01', 'F03'] }],
  buyer_map: [{ scenario_id: 'B01', status: 'evidence', initiator: 'Właściciel procesu', user: 'Zespół', decision_maker: 'unknown', purchase_moment: 'Potrzeba poprawy', job: 'Ustalić zakres', objections: ['Najpierw specyfikacja'], selection_criteria: null, selection_criteria_status: 'unknown', direct_customer_voice: false, fact_ids: ['F03', 'F04'] }],
  message_map: [{ message: 'Badania, projektowanie, wdrażanie', category: 'Zakres', audience: 'Szeroki', benefit: 'Spójność', mechanism: 'Model współpracy', proof_ids: ['P01'], risk: 'Nie UVP', fact_ids: ['F01'] }],
  voice_audit: { sample_size: '1 fragment', formality: dimension('Przystępnie'), directness: dimension('Krótko'), technical_level: dimension('Prosto'), emotion: dimension('Neutralnie'), claim_certainty: dimension('Deklaratywnie'), recurring_phrases: dimension('Brak', []), channel_difference: dimension('Nie ustalono', []), future_voice_status: 'Wymaga decyzji klienta.' },
  journey: [{ stage: 'Zainteresowanie', material: 'WWW', promise: 'Diagnoza', cta: 'Kontakt', destination_status: 'Widoczny', friction: null, friction_status: 'not_established', possible_improvement: 'Ustalić cel kontaktu', research_limitation: null, fact_ids: ['F02'] }],
  relationship: [],
  gaps: [{ gap_id: 'G01', observation: 'Brak decyzji o priorytecie.', business_impact_hypothesis: null, evidence_ids: ['F01'], priority: 'must', needed: 'Decyzja klienta', destination: 'WEW-USTALENIA → KLI-BRIEF.priority_offer', finding_type: 'pending_decision', consequence_for_work: 'Nie ustalamy priorytetu za klienta.' }],
  reusable_assets: [{ asset: 'Opis czterech obszarów', value_for_audience: 'Pomaga opisać trudność.', proof_ids: ['P01'], seed_ids: ['T01'], availability: 'parafrazy publiczne', limit: 'Nie artefakt FLOW.' }],
})

const konkurencja: KonkurencjaData = konkurencjaDataSchema.parse({
  selection: [{ company: 'EDISONDA', url: 'https://edisonda.com', competition_type: 'benchmark', shared_problem_scope: 'Badania i design', market_scale_difference: 'unknown', reason: 'Nakładające się kompetencje', fact_ids: [] }],
  cards: [{ company: 'EDISONDA', market_segment: { text: 'Startupy i korporacje', fact_ids: [], status: null }, problem: { text: 'Dojrzałość cyfrowa', fact_ids: [], status: 'interpretacja' }, service: { text: 'Badania, projektowanie, wdrożenie', fact_ids: [], status: null }, message: { text: 'Łączenie kompetencji', fact_ids: [], status: null }, mechanism: { text: 'Badania użytkowników', fact_ids: [], status: null }, proof: { text: 'unknown', fact_ids: [], status: null }, cta: { text: 'Rejestracja na wydarzenie', fact_ids: [], status: null }, language: { text: 'Ekspercki', fact_ids: [], status: null }, channels: { confirmed: ['LinkedIn'], unverified: ['WWW'], fact_ids: [] }, comparability: 'Nakładające się kompetencje', category: 'Badania i design', unknowns: ['Udział w tych samych przetargach'] }],
  parity_claims: [{ claim: 'Łączenie badań, projektowania i realizacji', companies: ['FLOW', 'EDISONDA'], evidence_ids: ['F01'], why_insufficient: 'Występuje u obu firm; nie dowodzi wyłączności.' }],
  alternative_routes: [],
  difference_candidates: [{ candidate_id: 'D01', feature: 'Rozpoznanie czterech obszarów', audience_value: 'Łatwiej uzgodnić zakres', proof_ids: ['P01'], comparison: 'Konkurenci też komunikują badania', unknown: 'Standard wykonania', allowed_claim_strength: 'described_approach', fact_ids: ['F03'] }],
  channels: [],
  implications: [{ finding: 'Nie opierać UVP wyłącznie na research + UX + development.', limitation: 'Jedna firma porównana.', strategy_field: 'uvp / mechanism', client_answer_needed: 'Którą sytuację obsługujemy?', evidence_ids: ['F01', 'D01'] }],
})

const ledger = () => createLedger({ maxPln: 20, prices: {} })

describe('3.6 — findings pipeline', () => {
  it('seeds the ten brief rows with WZR-BRIEF priorities and gates what the mapper claimed', async () => {
    const calls: { agentId: string; input: unknown }[] = []
    const events: PipelineEvent[] = []
    const result = await runFindingsPipeline({ order, outputLanguage: 'pl', zrodla, audyt, konkurencja, runAgent: createFixtureRunner(canned, { calls }), ledger: ledger(), models, onEvent: (e) => events.push(e) })
    expect(ustaleniaDataSchema.safeParse(result.data).success).toBe(true)
    expect(calls.map((c) => c.agentId)).toEqual(['agency_research.field_mapper', 'agency_research.question_writer', 'agency_research.readiness_assessor'])
    expect(result.data.field_map.map((r) => r.field_key)).toEqual(seededFieldRows().map((s) => s.field_key))
    expect(result.data.field_map.filter((r) => r.priority === 'must').map((r) => r.field_key)).toEqual(['priority_offer', 'priority_audience', 'business_direction', 'promise_constraints', 'voice_preferences', 'channel_and_cta', 'open_assumptions'])
    const byKey = Object.fromEntries(result.data.field_map.map((r) => [r.field_key, r]))
    expect(byKey.priority_offer).toMatchObject({ status: 'hypothesis', decision_state: 'awaiting_client' })
    expect(byKey.priority_audience.evidence_ids).toEqual(['A01', 'F04'])
    expect(byKey.voice_preferences).toMatchObject({ provenance: 'inferred', decision_state: 'awaiting_client' })
    expect(byKey.open_assumptions).toMatchObject({ readiness: 'blocked', proposed_value: null, priority: 'must' })
    expect(byKey.promise_constraints).toMatchObject({ status: 'fact', readiness: 'ready' })
    const codes = result.issues.map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['FUTURE_AS_FACT', 'UNKNOWN_ID', 'NO_CLIENT_ANSWER_YET', 'MISSING_FIELD_ROW']))
  })

  it('keeps at most the batch of questions, Must first, never about data the order already holds', async () => {
    const result = await runFindingsPipeline({ order, outputLanguage: 'pl', zrodla, audyt, konkurencja, runAgent: createFixtureRunner(canned), ledger: ledger(), models })
    const questions = result.data.questions
    expect(questions).toHaveLength(8)
    expect(questions.map((q) => q.question_id)).toEqual(['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08'])
    expect(questions.slice(0, 5).every((q) => q.priority === 'must')).toBe(true)
    expect(questions.some((q) => /adres strony WWW/i.test(q.question))).toBe(false)
    expect(questions.filter((q) => q.brief_field === 'priority_offer')).toHaveLength(1)
    expect(questions.find((q) => q.brief_field === 'voice_preferences')?.options).toHaveLength(2)
    expect(result.data.evidence_requests.map((r) => r.request_id)).toEqual(['ER01', 'ER02'])
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['ASKS_KNOWN_DATA', 'DUPLICATE_QUESTION']))
    expect(result.data.readiness.map((r) => `${r.output}:${r.state}`)).toEqual(['UVP:blocked', 'strategia:blocked', 'ToV:conditional', 'plan:blocked', 'post:conditional'])
    expect(result.data.research_return).toHaveLength(1)
    expect(result.issues.map((i) => i.code)).toContain('MISSING_READINESS_ROW')
  })

  it('records the absence of the comparison as an issue instead of inventing competitors', async () => {
    const result = await runFindingsPipeline({ order, outputLanguage: 'pl', zrodla, audyt, konkurencja: null, runAgent: createFixtureRunner(canned), ledger: ledger(), models })
    expect(result.issues.map((i) => i.code)).toContain('COMPETITION_MISSING')
    expect(result.data.field_map).toHaveLength(10)
  })

  it('renders the internal map and a client view of the questions within budget', async () => {
    const result = await runFindingsPipeline({ order, outputLanguage: 'pl', zrodla, audyt, konkurencja, runAgent: createFixtureRunner(canned), ledger: ledger(), models })
    const md = renderUstalenia({ brand: order.brand, data: result.data, issues: result.issues })
    expect(md).toContain('## Pytania do klienta (8)')
    expect(md).toContain('| priority_offer | must | hypothesis |')
    const view = checkClientView('WZR-USTALENIA', renderUstaleniaClientView(result.data))
    expect(view.markdown).toContain('**1. Którą potrzebę klienta')
    expect(view.markdown).not.toContain('F01')
    expect(view.issue).toBeNull()
  })

  it('gate helpers are pure and deterministic', () => {
    const known = knownIdsOf(zrodla, audyt, konkurencja)
    expect([...known]).toEqual(expect.arrayContaining(['S-01', 'F01', 'P01', 'L01', 'A01', 'T01', 'X01', 'G01', 'B01', 'D01']))
    const seeded = seededFieldRows()
    const gated = gateFieldMap([{ field_key: 'business_direction', proposed_value: 'Wizja z WWW', evidence_ids: ['F01'], provenance: 'observed', readiness: 'ready', decision_state: 'not_required', reason: 'r', status: 'fact' }], known, seeded)
    expect(gated.value.find((r) => r.field_key === 'business_direction')).toMatchObject({ status: 'hypothesis', decision_state: 'awaiting_client', readiness: 'ready' })
    expect(gated.dropped).toBe(9)
    const q = gateQuestions({ questions: [{ question: 'Jaka jest nazwa firmy?', hint: 'h', reason: 'r', brief_field: 'priority_offer', priority: 'must', if_unanswered: 'x' }], evidence_requests: [] }, known)
    expect(q.value.questions).toHaveLength(0)
    expect(q.issues[0].code).toBe('ASKS_KNOWN_DATA')
    expect(gateReadiness({ readiness: [], research_return: [] }).value.readiness.map((r) => r.state)).toEqual(['blocked', 'blocked', 'blocked', 'blocked', 'blocked'])
  })
})

describe('3.7 — analysis QA', () => {
  const ready: QaResult = { verdict: 'ready', findings: [], summary: 'ok' }
  const blockingBy = (owner: QaFinding['owner'], fixStep: string | null): QaFinding => ({ code: 'other', path: 'WEW-AUDYT.gaps[0]', severity: 'blocking', gap: 'g', owner, fix_step: fixStep, fix_hint: null })

  it('maps findings to exactly one of ready / to_fix / exception', () => {
    expect(mergeQaVerdict(ready, []).verdict).toBe('ready')
    expect(mergeQaVerdict(ready, [blockingBy('agent', '3.3')]).verdict).toBe('to_fix')
    expect(mergeQaVerdict(ready, [blockingBy('client', null)]).verdict).toBe('ready')
    expect(mergeQaVerdict(ready, [blockingBy('staff', null)]).verdict).toBe('exception')
    expect(mergeQaVerdict(ready, [blockingBy('agent', null)]).verdict).toBe('exception')
    expect(mergeQaVerdict({ ...ready, verdict: 'exception' }, []).verdict).toBe('ready')
    expect(mergeQaVerdict(ready, [blockingBy('agent', '3.3'), blockingBy('staff', null)]).verdict).toBe('exception')
  })

  it('finds by rule what a schema cannot: unresolved references, empty MUST fields, the fact/interpretation line', async () => {
    const ustalenia = (await runFindingsPipeline({ order, outputLanguage: 'pl', zrodla, audyt, konkurencja, runAgent: createFixtureRunner(canned), ledger: ledger(), models })).data
    const clean = validatorFindings({ zrodla, audyt, konkurencja, ustalenia })
    expect(clean.map((f) => [f.code, f.fix_step])).toEqual([['fact_vs_interpretation', '3.3']])
    const broken = validatorFindings({
      zrodla: { ...zrodla, proof_cards: [{ ...zrodla.proof_cards[0], proof_type: 'measured_case', observed_result: null }] },
      audyt: { ...audyt, gaps: [{ ...audyt.gaps[0], evidence_ids: ['F77'] }] },
      konkurencja: { ...konkurencja, difference_candidates: [{ ...konkurencja.difference_candidates[0], allowed_claim_strength: 'demonstrated_result', proof_ids: [] }] },
      ustalenia: { ...ustalenia, field_map: ustalenia.field_map.map((r) => (r.field_key === 'business_direction' ? { ...r, status: 'fact' as const } : r)) },
    })
    expect(broken.map((f) => f.code)).toEqual(expect.arrayContaining(['unresolved_reference', 'invented_effectiveness', 'fact_vs_interpretation']))
    expect(broken.find((f) => f.code === 'unresolved_reference')).toMatchObject({ severity: 'blocking', owner: 'agent', fix_step: '3.3' })
    expect(broken.find((f) => f.path === 'WEW-USTALENIA.field_map[business_direction]')).toMatchObject({ severity: 'blocking', fix_step: '3.6' })
  })

  it('runs the QA agent over compact documents and merges its verdict with the rules', async () => {
    const ustalenia = (await runFindingsPipeline({ order, outputLanguage: 'pl', zrodla, audyt, konkurencja, runAgent: createFixtureRunner(canned), ledger: ledger(), models })).data
    const calls: { agentId: string; input: unknown }[] = []
    const runner = createFixtureRunner(canned, { calls })
    const first = await runAnalysisQa({ order, outputLanguage: 'pl', documents: { zrodla, audyt, konkurencja, ustalenia }, runAgent: runner, ledger: ledger(), models })
    expect(first.result.verdict).toBe('to_fix')
    expect(first.result.findings.filter((f) => f.severity === 'blocking').map((f) => f.fix_step)).toEqual(['3.6'])
    const input = calls[0].input as { documents: Record<string, { facts?: { locator?: unknown }[] }>; validator_findings: unknown[]; criteria: string[] }
    expect(input.documents['WEW-ZRODLA'].facts?.[0]).not.toHaveProperty('locator')
    expect(input.validator_findings).toHaveLength(1)
    expect(input.criteria.length).toBeGreaterThan(3)
    const second = await runAnalysisQa({ order, outputLanguage: 'pl', documents: { zrodla, audyt, konkurencja, ustalenia }, runAgent: runner, ledger: ledger(), models })
    expect(second.result.verdict).toBe('ready')
  })

  it('repairs through the author step once and re-judges (loop logic without a database)', async () => {
    // The loop's decision is: blocking findings with an agent fix_step → rerun those steps with the findings, then QA again.
    const runner = createFixtureRunner(canned)
    const ustalenia = (await runFindingsPipeline({ order, outputLanguage: 'pl', zrodla, audyt, konkurencja, runAgent: runner, ledger: ledger(), models })).data
    const repaired: QaFinding[][] = []
    const authorStep = async (findings: QaFinding[]) => {
      repaired.push(findings)
      return runFindingsPipeline({ order, outputLanguage: 'pl', zrodla, audyt, konkurencja, runAgent: runner, ledger: ledger(), models, repairFindings: findings })
    }
    const pass1 = await runAnalysisQa({ order, outputLanguage: 'pl', documents: { zrodla, audyt, konkurencja, ustalenia }, runAgent: runner, ledger: ledger(), models })
    const blocking = pass1.result.findings.filter((f) => f.severity === 'blocking' && f.fix_step === '3.6')
    const again = await authorStep(blocking)
    const pass2 = await runAnalysisQa({ order, outputLanguage: 'pl', documents: { zrodla, audyt, konkurencja, ustalenia: again.data }, runAgent: runner, ledger: ledger(), models })
    expect(repaired[0].map((f) => f.path)).toEqual(['WEW-USTALENIA.field_map[priority_offer]'])
    expect(pass2.result.verdict).toBe('ready')
  })
})

describe('E.1 — escalation and 3.8 — freeze', () => {
  it('builds a contract-valid WEW-ESKALACJA with an explicit unassigned queue and a bounded question', () => {
    const data = buildEscalation({
      code: 'qa_exhausted',
      summary: 'QA still fails after 2 repairs.',
      triggerStep: '3.7',
      evidence: [{ ref: 'run-1', fact: 'verdict to_fix, 1 blocking' }],
      blockedSteps: ['3.8', '4.1'],
      decisionQuestion: 'x'.repeat(500),
      allowedResolutions: qaExhaustedResolutions('3.6'),
      resumeStep: '3.7',
    }, new Date('2026-09-19T12:00:00Z'))
    expect(eskalacjaDataSchema.safeParse(data).success).toBe(true)
    expect(data.assignment).toMatchObject({ employee_id_or_unassigned: 'unassigned', queue: 'agency_research.exceptions', assigned_at_or_null: null })
    expect(data.decision_question).toHaveLength(400)
    expect(data.allowed_resolutions.map((r) => r.code)).toEqual(['rerun_with_guidance', 'accept_with_explicit_limit', 'keep_blocked'])
    expect(data.resolution.state).toBe('open')
    expect(data.resume).toMatchObject({ next_step_or_null: '3.7', state: 'pending' })
    expect(data.evidence[0].occurred_at_or_unknown).toBe('2026-09-19T12:00:00.000Z')
    const staff = renderEskalacja({ brand: 'FLOW', data })
    expect(staff).toContain('agency_research.exceptions')
    const client = renderEskalacja({ brand: 'FLOW', data, clientView: true })
    expect(client).not.toContain('agency_research.exceptions')
    expect(client).toContain('wstrzymane')
  })

  it('identifies a frozen set by its versions only, in any order', () => {
    const a = freezeSetHash([{ document_id: 'WEW-ZRODLA@o', version: '1.0' }, { document_id: 'WEW-AUDYT@o', version: '2.0', status: 'ready_for_review' }])
    const b = freezeSetHash([{ document_id: 'WEW-AUDYT@o', version: '2.0' }, { document_id: 'WEW-ZRODLA@o', version: '1.0', status: 'draft' }])
    const c = freezeSetHash([{ document_id: 'WEW-AUDYT@o', version: '3.0' }, { document_id: 'WEW-ZRODLA@o', version: '1.0' }])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toHaveLength(16)
  })
})
