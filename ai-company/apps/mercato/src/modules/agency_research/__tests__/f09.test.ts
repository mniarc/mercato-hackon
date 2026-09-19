import path from 'node:path'
import { audytDataSchema, type AudytData } from '../data/schemas/audyt'
import { briefDataSchema, type BriefData } from '../data/schemas/brief'
import { orderDataSchema, orderFactsOf } from '../data/schemas/zamowienie'
import { ustaleniaDataSchema, type UstaleniaData } from '../data/schemas/ustalenia'
import { zrodlaDataSchema, type ZrodlaData } from '../data/schemas/zrodla'
import { createLedger } from '../lib/research/ledger'
import { firstContactQuestions, renderBrief, renderBriefClientView } from '../lib/research/render/brief'
import { runBriefPipeline } from '../lib/research/steps/brief'
import { briefValidatorFindings, mergeBriefQaVerdict, runBriefQa, runBriefQaLoop } from '../lib/research/steps/briefQa'
import type { StepContext } from '../lib/research/steps/context'
import { createFixtureRunner } from '../lib/runners'
import { countClientWords } from '../lib/research/util'
import * as store from '../lib/store'

jest.mock('../lib/store', () => {
  const actual = jest.requireActual('../lib/store')
  return { ...actual, startTaskRun: jest.fn(), finishTaskRun: jest.fn(), currentInputVersion: jest.fn() }
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

function zrodla(): ZrodlaData {
  return zrodlaDataSchema.parse({
    sources: [src('S-01', 'https://makeitflow.pl/index.php')],
    facts: [
      fact('F01', 'FLOW łączy badania, projektowanie i wdrażanie.'), fact('F02', 'Cztery obszary działania.'), fact('F03', 'Punktem wyjścia są potrzeby użytkowników.'),
      fact('F04', 'Można zgłosić się bez specyfikacji.'), fact('F05', 'Cały cykl albo etap współpracy.'), fact('F06', 'Ceny po diagnozie.'), fact('F07', 'Kontakt e-mail i telefon.', 'observed'),
    ],
    proof_cards: [
      { proof_id: 'P01', proof_type: 'declaration', problem: 'p', actual_action: null, artifact_or_method: 'Cztery obszary diagnozy', observed_result: null, fact_ids: ['F03'], source_ids: ['S-01'], limitations: ['brak wyniku'], source_visibility: 'public', allowed_use: 'client_review', use_basis_ref: 'KLI-BRIEF.assets_and_permissions', client_name_permission: 'not_applicable', quote_permission: 'granted', provenance: 'inferred' },
      { proof_id: 'P02', proof_type: 'declaration', problem: null, actual_action: null, artifact_or_method: 'AI tylko z uzasadnieniem', observed_result: null, fact_ids: ['F05'], source_ids: ['S-01'], limitations: [], source_visibility: 'public', allowed_use: 'internal_only', use_basis_ref: null, client_name_permission: 'unknown', quote_permission: 'unknown', provenance: 'inferred' },
    ],
    language_samples: [
      { sample_id: 'L01', independent_material_id: 'MAT-S-01', canonical_source_id: 'S-01', source_id: 'S-01', excerpt_or_paraphrase: 'Technologia jest narzędziem.', channel: 'WWW', suggested_audience: null, situation: null, linguistic_features: ['krótko'], observed_function: null, sample_limit: 'krótki fragment' },
      { sample_id: 'L02', independent_material_id: 'MAT-S-01', canonical_source_id: 'S-01', source_id: 'S-01', excerpt_or_paraphrase: 'Specyfikacja nie jest biletem wstępu.', channel: 'WWW', suggested_audience: null, situation: null, linguistic_features: ['metafora'], observed_function: null, sample_limit: 'krótki fragment' },
    ],
    audience_signals: [{ signal_id: 'A01', role_or_organization: 'właściciel procesu', trigger: 't', problem: 'p', risk: null, objection: null, evidence_status: 'supplier_interpretation_not_customer_voice', fact_ids: ['F03'] }],
    content_bank: [],
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
    voice_audit: { sample_size: '2 fragmenty', formality: dim('przystępnie'), directness: dim('bezpośrednio'), technical_level: dim('prosto'), emotion: dim('spokojnie'), claim_certainty: dim('deklaratywnie'), recurring_phrases: dim('brak'), channel_difference: dim('brak danych'), future_voice_status: 'decyzja klienta' },
    journey: [{ stage: 'Zainteresowanie', material: 'WWW', promise: 'diagnoza', cta: 'kontakt', destination_status: 'widoczny', friction: null, friction_status: 'not_established', possible_improvement: 'ustalić krok', research_limitation: null, fact_ids: ['F07'] }],
    relationship: [],
    gaps: [{ gap_id: 'G01', observation: 'brak priorytetu', business_impact_hypothesis: null, evidence_ids: ['F02'], priority: 'must', needed: 'decyzja', destination: 'KLI-BRIEF.priority_offer', finding_type: 'pending_decision', consequence_for_work: 'nie ustalamy za klienta' }],
    reusable_assets: [],
  })
}

const row = (field_key: UstaleniaData['field_map'][number]['field_key'], extra: Partial<UstaleniaData['field_map'][number]> = {}): UstaleniaData['field_map'][number] => ({
  field_key, proposed_value: `propozycja ${field_key}`, evidence_ids: ['F01'], provenance: 'inferred', readiness: 'conditional', decision_state: 'awaiting_client', priority: 'must', reason: 'r', status: 'unknown', ...extra,
})
const question = (id: string, brief_field: UstaleniaData['questions'][number]['brief_field'], priority: 'must' | 'should' = 'must', state = 'open'): UstaleniaData['questions'][number] => ({
  question_id: id, question: `Pytanie ${id}?`, hint: 'podpowiedź', reason: 'powód', brief_field, priority, if_unanswered: 'blokada', state,
})

function ustalenia(): UstaleniaData {
  return ustaleniaDataSchema.parse({
    field_map: [
      row('priority_offer', { decision_state: 'client_selected', status: 'client_decision', readiness: 'ready' }),
      row('priority_audience'),
      row('business_direction', { status: 'hypothesis' }),
      row('buyer_reality', { priority: 'should', decision_state: 'not_required', status: 'hypothesis' }),
      row('promise_constraints', { decision_state: 'not_required', status: 'fact' }),
      row('voice_preferences'),
      row('channel_and_cta'),
      row('success_and_limits', { priority: 'should', decision_state: 'not_required' }),
      row('assets_and_permissions', { priority: 'should', decision_state: 'not_required', status: 'fact' }),
      row('open_assumptions', { decision_state: 'not_required' }),
    ],
    questions: [
      question('Q01', 'priority_offer', 'must', 'resolved_by_client'),
      question('Q02', 'priority_audience'), question('Q03', 'business_direction'), question('Q04', 'voice_preferences'), question('Q05', 'channel_and_cta'),
      question('Q06', 'promise_constraints'), question('Q07', 'success_and_limits', 'should'), question('Q08', 'buyer_reality', 'should'), question('Q09', 'assets_and_permissions', 'should'), question('Q10', 'open_assumptions', 'should'),
    ],
    evidence_requests: [{ request_id: 'ER01', needed: 'case', claim_supported: 'efekt', without_it: 'słabsza obietnica', owner: 'klient', status: 'open', priority: 'optional' }],
    readiness: [
      { output: 'UVP', input_fields: ['priority_offer'], state: 'blocked', missing: 'decyzja', owner: 'klient' },
      { output: 'strategia', input_fields: [], state: 'blocked', missing: 'decyzja', owner: 'klient' },
      { output: 'ToV', input_fields: [], state: 'conditional', missing: null, owner: 'klient' },
      { output: 'plan', input_fields: [], state: 'blocked', missing: 'bank', owner: 'research' },
      { output: 'post', input_fields: [], state: 'conditional', missing: null, owner: 'klient' },
    ],
    research_return: [],
  })
}

function allDecided(): UstaleniaData {
  const u = ustalenia()
  for (const r of u.field_map) if (['priority_offer', 'priority_audience', 'business_direction', 'voice_preferences', 'channel_and_cta'].includes(r.field_key)) {
    r.decision_state = 'client_selected'
    r.status = 'client_decision'
    r.readiness = 'ready'
  }
  return u
}

async function runPipeline(u = ustalenia()) {
  const calls: { agentId: string; input: unknown }[] = []
  const result = await runBriefPipeline({ order, outputLanguage: 'pl', ustalenia: u, zrodla: zrodla(), audyt: audyt(), runAgent: createFixtureRunner(canned, { calls }), ledger: createLedger({ prices: {} }), models })
  return { ...result, calls }
}

describe('runBriefPipeline (4.1)', () => {
  it('assembles the ten fields from three section calls and applies the code-owned rules', async () => {
    const { data, issues, calls, stats } = await runPipeline()
    expect(briefDataSchema.safeParse(data).success).toBe(true)
    expect(calls.map((c) => (c.input as { section: string }).section)).toEqual(['offer_audience_direction', 'promise_voice', 'channel_success_assets'])
    expect(stats.agentCalls).toBe(3)
    expect(data.priority_offer.fact_ids).toEqual(['F01', 'F02', 'F03'])
    expect(issues.filter((i) => i.code === 'UNKNOWN_ID').length).toBeGreaterThanOrEqual(2)
    expect(data.priority_offer).toMatchObject({ decision_state: 'client_selected', decision_ref: 'WEW-USTALENIA.field_map.priority_offer' })
    expect(data.priority_audience.decision_state).toBe('awaiting_client')
    expect(data.priority_audience.buyer_claims.find((c) => c.component === 'job')?.knowledge_status).toBe('hypothesis')
    expect(data.voice_preferences.client_selection).toBeNull()
    expect(data.voice_preferences.proposed_examples.map((e) => e.variant_id)).toEqual(['VOICE-A', 'VOICE-B'])
    expect(issues.some((i) => i.code === 'VOICE_EXAMPLES_COUNT')).toBe(true)
    expect(data.promise_constraints.allowed_proof_ids).toEqual(['P01', 'P02'])
    expect(data.promise_constraints.rights_by_proof).toEqual([
      { proof_id: 'P01', source_visibility: 'public', allowed_use: 'client_review', use_basis_ref: 'KLI-BRIEF.assets_and_permissions', client_name_permission: 'not_applicable', quote_permission: 'granted' },
      { proof_id: 'P02', source_visibility: 'public', allowed_use: 'internal_only', use_basis_ref: null, client_name_permission: 'unknown', quote_permission: 'unknown' },
    ])
    expect(data.success_and_limits.numerical_target).toBeNull()
    expect(issues.some((i) => i.code === 'TARGET_WITHOUT_BASELINE')).toBe(true)
    expect(data.channel_and_cta).toMatchObject({ owner: null, draft_readiness: 'conditional', publication_readiness: 'blocked', required_owner_before_publish: true })
    expect(data.assets_and_permissions.map((a) => [a.asset_id, a.source_ref, a.allowed_use, a.quote_permission])).toEqual([
      ['ASSET-01', 'P01', 'client_review', 'granted'],
      ['ASSET-02', 'S-01', 'internal_only', 'unknown'],
    ])
    expect(data.open_assumptions.map((a) => [a.impact, a.type])).toEqual([
      ['priority_audience', 'awaiting_client_decision'],
      ['business_direction', 'awaiting_client_decision'],
      ['voice_preferences', 'awaiting_client_decision'],
      ['channel_and_cta', 'awaiting_client_decision'],
      ['buyer_reality', 'hypothesis'],
    ])
    expect(data.open_assumptions.every((a) => a.state === 'open' && /^A-\d{2}$/.test(a.assumption_id))).toBe(true)
  })

  it('renders a client view within budget with at most eight open questions, Must first', async () => {
    const { data, clientViewMd } = await runPipeline()
    expect(countClientWords(clientViewMd)).toBeLessThanOrEqual(700)
    const questions = firstContactQuestions(ustalenia())
    expect(questions).toHaveLength(8)
    expect(questions.map((q) => q.question_id)).not.toContain('Q01')
    expect(questions.slice(0, 5).every((q) => q.priority === 'must')).toBe(true)
    expect(clientViewMd).toContain('## Pytania do Ciebie')
    expect(clientViewMd).not.toContain('F01')
    const view = renderBriefClientView({ outputLanguage: 'en', brand: 'FLOW', data, ustalenia: ustalenia() })
    expect(view.markdown).toContain('## Questions for you')
    expect(view.limit).toBe(700)
    expect(renderBrief({ outputLanguage: 'pl', brand: 'FLOW', data, issues: [] })).toContain('client_selection: null')
  })
})

describe('brief QA (4.2)', () => {
  it('maps findings to exactly one verdict: agent faults first, then client gaps, else ready', async () => {
    const { data } = await runPipeline()
    const awaiting = briefValidatorFindings({ brief: data, ustalenia: ustalenia(), zrodla: zrodla(), clientViewMd: null })
    expect(mergeBriefQaVerdict(awaiting)).toBe('needs_client_data')
    expect(awaiting.filter((f) => f.owner === 'client' && f.severity === 'blocking').map((f) => f.path)).toEqual(expect.arrayContaining(['KLI-BRIEF.priority_audience', 'KLI-BRIEF.channel_and_cta']))
    const decided = await runPipeline(allDecided())
    const clean = briefValidatorFindings({ brief: decided.data, ustalenia: allDecided(), zrodla: zrodla(), clientViewMd: decided.clientViewMd })
    expect(mergeBriefQaVerdict(clean)).toBe('ready_for_approval')
    const faulty: BriefData = { ...decided.data, success_and_limits: { ...decided.data.success_and_limits, numerical_target: '10', baseline: null }, voice_preferences: { ...decided.data.voice_preferences, client_selection: 'VOICE-A' } }
    const faults = briefValidatorFindings({ brief: faulty, ustalenia: allDecided(), zrodla: zrodla(), clientViewMd: null })
    expect(mergeBriefQaVerdict(faults)).toBe('needs_agent_fix')
    expect(faults.filter((f) => f.owner === 'agent').map((f) => f.code)).toEqual(expect.arrayContaining(['invented_effectiveness', 'other']))
    const stray: BriefData = { ...decided.data, priority_offer: { ...decided.data.priority_offer, fact_ids: ['F99'] } }
    expect(briefValidatorFindings({ brief: stray, ustalenia: allDecided(), zrodla: zrodla(), clientViewMd: null }).some((f) => f.code === 'unresolved_reference' && f.fix_step === '4.1')).toBe(true)
  })

  it('merges the agent findings with the validator and drops findings that point outside the documents', async () => {
    const decided = await runPipeline(allDecided())
    const runAgent = createFixtureRunner(canned)
    const first = await runBriefQa({ order, outputLanguage: 'pl', brief: decided.data, ustalenia: allDecided(), zrodla: zrodla(), clientViewMd: decided.clientViewMd, runAgent, ledger: createLedger({ prices: {} }), models })
    expect(first.verdict).toBe('needs_agent_fix')
    expect(first.findings.some((f) => f.path.startsWith('SOMEWHERE'))).toBe(false)
    const second = await runBriefQa({ order, outputLanguage: 'pl', brief: decided.data, ustalenia: allDecided(), zrodla: zrodla(), clientViewMd: decided.clientViewMd, runAgent, ledger: createLedger({ prices: {} }), models })
    expect(second.verdict).toBe('ready_for_approval')
  })

  it('re-runs the brief step once on an agent fault, then judges again and moves the document on', async () => {
    const decided = await runPipeline(allDecided())
    const mocked = store as jest.Mocked<typeof store>
    const versions = { brief: decided.data, ustalenia: allDecided(), zrodla: zrodla() }
    mocked.currentInputVersion.mockImplementation(async (_em, _scope, _orderRef, templateId) => {
      const key = templateId === 'WZR-BRIEF' ? 'brief' : templateId === 'WZR-USTALENIA' ? 'ustalenia' : 'zrodla'
      return { document_id: `${templateId}@o`, version: '1.0', status: 'draft', versionId: `v-${key}`, data: versions[key] }
    })
    mocked.startTaskRun.mockResolvedValue({ id: 'run-42' } as never)
    mocked.finishTaskRun.mockResolvedValue(undefined)
    const document = { status: 'draft' }
    const flush = jest.fn()
    const em = { findOne: async () => document, flush, getConnection: () => ({ execute: async () => [{ client_view_md: decided.clientViewMd }] }) }
    const briefStep = jest.fn(async (ctx: StepContext) => {
      expect(ctx.repairFindings.length).toBeGreaterThan(0)
      expect(ctx.attempt).toBe(2)
      return { taskRunId: 'run-41b', versionId: 'v-brief-2', status: 'done' }
    })
    const ctx = {
      em, scope: { tenantId: 't', organizationId: 'o' }, orderRef: 'o', order, orderVersion: { document_id: 'WEW-DANE-ZAMOWIENIA@o', version: '1.0' },
      runAgent: createFixtureRunner(canned), runner: 'fixture', models, ledger: createLedger({ prices: {} }), onEvent: () => {}, log: () => {},
      agentRunIds: [], taskRunIds: [], documentVersionIds: [], fetchPage: async () => { throw new Error('no fetch') }, repairFindings: [], attempt: 1,
    } as unknown as StepContext
    const outcome = await runBriefQaLoop(ctx, { briefStep })
    expect(briefStep).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ verdict: 'ready_for_approval', repairs: 1, taskRunId: 'run-42' })
    expect(document.status).toBe('ready_for_review')
    expect(mocked.finishTaskRun).toHaveBeenCalledWith(em, { id: 'run-42' }, expect.objectContaining({ status: 'done', qaResult: expect.objectContaining({ verdict: 'ready_for_approval', repairs: 1 }) }))
  })
})
