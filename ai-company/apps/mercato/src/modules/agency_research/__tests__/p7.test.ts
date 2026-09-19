import path from 'node:path'
import { outputIdByTemplate } from '../data/schemas/envelope'
import { postDataSchema, type PostData } from '../data/schemas/post'
import { tovDataSchema, type TovData } from '../data/schemas/tov'
import { orderDataSchema, orderFactsOf } from '../data/schemas/zamowienie'
import { zleceniePostuDataSchema, type ZleceniePostuData } from '../data/schemas/zleceniePostu'
import type { PostDraft, PostEditorReview } from '../data/agents/post'
import { createLedger } from '../lib/research/ledger'
import type { ResearchAgentRunner } from '../lib/research/pipeline'
import { renderPost, renderPostClientView } from '../lib/research/render/post'
import { assemblePost, forbiddenLinks, gatePostDraft, postMetrics, prohibitedClaimsFound, runPostPipeline, unsupportedNumbers } from '../lib/research/steps/post'
import { applyEditorReview, mergePostQaVerdict, postValidatorFindings, runPostQa, runPostQaLoop } from '../lib/research/steps/postQa'
import type { StepContext } from '../lib/research/steps/context'
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

const rights = { source_visibility: 'public', allowed_use: 'client_review', use_basis_ref: ['KLI-BRIEF.assets_and_permissions'], client_name_permission: 'not_applicable', quote_permission: 'granted', publication_approval: 'missing' } as const
const source = { source_id: 'S-01', publisher: 'FLOW', title: null, url: 'https://makeitflow.pl/index.php', access: 'full', read_scope: 'read' }
const card = (claimId: string, kind: 'source_claim' | 'creative_proposal', text: string, factId: string | null, seedId: string | null = null): ZleceniePostuData['evidence_payload'][number] => ({
  claim_id: claimId, kind, text, fact_id: factId, seed_id: seedId, fact_ids: factId ? [factId] : [], source_ids: ['S-01'], source_payload: [source],
  limitations: kind === 'source_claim' ? ['Deklaracja własna FLOW; brak przykładu z projektu.'] : ['Propozycja redakcyjna, nie proces FLOW.'],
  permitted_copy: kind === 'source_claim' ? 'parafraza' : null, provenance: kind === 'source_claim' ? 'observed' : 'creative_proposal', reuse_of_evidence: null, is_new_independent_source: false, rights_and_limits: rights,
})

function instruction(overrides: Partial<ZleceniePostuData['delivery_constraints']> = {}): ZleceniePostuData {
  return zleceniePostuDataSchema.parse({
    selected_item: {
      topic_id: 'TOP01', seed_id: 'T01', plan_id: 'KLI-PLAN@o', plan_version: '1.0', selection_status: 'simulated_selection', decision_id: null,
      audience: 'osoby decydujące o nowym narzędziu w firmie', audience_question: 'Od czego zacząć, gdy chcemy nowego narzędzia?', goal: 'Pokazać punkt wyjścia FLOW bez obiecywania wyniku.',
      main_message: 'Zanim spiszesz wymagania, odpowiedz na cztery pytania o użytkowników, cel, pracę i technikę.', angle: 'Cztery pytania przed wyborem technologii', task: 'Jeden post tekstowy na LinkedIn.',
    },
    evidence_payload: [
      card('CL01', 'source_claim', 'Punktem wyjścia projektu są potrzeby użytkowników, cel biznesowy, organizacja pracy i możliwości techniczne.', 'F03'),
      card('CL02', 'creative_proposal', 'Cztery pytania przed wyborem technologii — autorska lista dla osób decydujących o nowym narzędziu.', 'F03', 'T01'),
      card('CL03', 'source_claim', 'Można zgłosić się bez specyfikacji; istniejący dokument jest sprawdzany względem potrzeb i ograniczeń.', 'F04'),
      card('CL04', 'source_claim', 'Kontakt e-mail i telefon są podane na stronie FLOW.', 'F07'),
    ],
    reader_value: { type: 'decision_question', title: 'Cztery pytania przed wyborem narzędzia', items: ['kto będzie korzystał', 'jaki wynik ma się zmienić', 'jak wygląda obieg pracy', 'co pozwala infrastruktura'], status: 'creative_proposal', usage: 'lista w treści posta', example_option: null },
    voice_extract: { tov_id: 'KLI-TOV@o', tov_version: '1.0', rules: ['Nazwij problem odbiorcy w pierwszym zdaniu.', 'Deklarację FLOW opisuj jako punkt wyjścia, nie jako wynik.', 'Krótkie zdania, bez żargonu.'], forbidden_cliches: ['kompleksowe rozwiązania', 'innowacyjne podejście'], short_pattern: 'Problem → co robi FLOW → co możesz sprawdzić sam.' },
    delivery_constraints: {
      channel: 'LinkedIn firmy FLOW', language: 'pl-PL', market: 'Polska', format: 'text', adapter_id: 'linkedin-company-post-text', adapter_version: '0.1.0', max_text_length: 3000, length_unit: 'characters', platform_limit_status: 'known',
      product_length_target: { words: [120, 220], word_count_rule: 'Rozdzielenie po białych znakach; URL jest jednym tokenem.' },
      links: [{ url: 'https://makeitflow.pl/index.php', purpose: 'Kontakt w sprawie konkretnej trudności.', owner: 'FLOW', visibility_status: 'observed', operational_status: 'not_checked', contact_owner: null }],
      mentions: [], cta: 'Opiszcie nam swoją trudność', cta_destination: 'https://makeitflow.pl/index.php', cta_draft_readiness: 'conditional', cta_publication_readiness: 'blocked',
      prohibited_claims: ['Gwarantujemy wzrost sprzedaży po wdrożeniu', 'Jedyna taka firma na rynku'], finished_post_count: 1,
      ...overrides,
    },
    completion: ['editorial: hook, rozwinięcie, wartość, CTA', 'factual: tylko karty', 'format: tekst', 'no_network', 'allowed_documents: instrukcja + ToV', 'missing_data_action: pomiń', 'independent_reviewer: redaktor'],
  })
}

function tov(): TovData {
  const axis = (axis: TovData['style_axes'][number]['axis']) => ({ axis, position: 'środek', example: 'przykład', change_when: 'nigdy' })
  return tovDataSchema.parse({
    voice_principles: [{ trait: 'rzeczowość', purpose: 'zaufanie', author_behavior: 'nazywa problem', typical_error: 'frazesy' }],
    style_axes: (['formality', 'directness', 'technicality', 'humor', 'claim_strength'] as const).map(axis),
    wording: { preferred_in_context: ['punkt wyjścia'], replacements: [{ avoid: 'kompleksowe', use: 'całościowe' }], replacement_boundary: 'nie zmieniaj cytatów', cliches: ['kompleksowe rozwiązania'], expert_terms: 'tylko z wyjaśnieniem', sentence_pattern: 'krótko' },
    evidence_language: [{ type: 'fact', pattern: 'FLOW opisuje…', forbidden_upgrade: 'nie „FLOW udowadnia”' }],
    before_after: [{ before: 'a', after: 'b', changed_principle: 'rzeczowość', fact_ids: [], status: 'creative_example' }],
    context_rules: [{ situation: 'CTA', tone_and_example: 'zaproszenie', boundary: 'bez obietnicy czasu reakcji' }],
    copy_checks: ['Czy otwarcie nazywa problem odbiorcy?', 'Czy deklaracja FLOW nie udaje wyniku?', 'Czy zdania są krótkie?', 'Czy nie ma obietnic efektu?', 'Czy propozycja jest oznaczona jako propozycja?', 'Czy CTA nie obiecuje czasu reakcji?'],
  })
}

async function runPipeline(opts: { instruction?: ZleceniePostuData; simulated?: boolean; runAgent?: ResearchAgentRunner } = {}) {
  const calls: { agentId: string; input: unknown }[] = []
  const result = await runPostPipeline({
    order, outputLanguage: 'pl', instruction: opts.instruction ?? instruction(), tov: tov(), simulated: opts.simulated ?? true, versionLabel: '1.0',
    runAgent: opts.runAgent ?? createFixtureRunner(canned, { calls }), ledger: createLedger({ prices: {} }), models,
  })
  return { ...result, calls }
}

describe('runPostPipeline (7.2)', () => {
  it('rejects a draft with a number no card supports, then assembles the post from the clean draft with the code-owned rules', async () => {
    const { data, issues, stats, calls } = await runPipeline()
    expect(postDataSchema.safeParse(data).success).toBe(true)
    expect(stats.rejected).toBe(1)
    expect(stats.agentCalls).toBe(2)
    expect(calls.every((c) => c.agentId === 'agency_research.post_author')).toBe(true)
    expect(data.text).not.toContain('37%')
    expect(data.claims_map.map((row) => row.id)).toEqual(['CM-01', 'CM-02', 'CM-03', 'CM-04'])
    expect(issues.some((i) => i.code === 'FRAGMENT_NOT_IN_TEXT')).toBe(true)
    expect(issues.some((i) => i.code === 'UNKNOWN_ID' && i.detail.startsWith('F99'))).toBe(true)
    expect(data.claims_map[2].fact_ids).toEqual(['F04'])
    expect(data.target).toMatchObject({ channel: 'LinkedIn firmy FLOW', format: 'text', adapter_version: '0.1.0', platform_character_limit: 3000, platform_limit_status: 'known', publication_status: 'blocked_simulation', publication_allowed: false, target_account_id: null })
    expect(data.qa.metrics).toMatchObject({ within_internal_word_target: true, platform_limit_compliance: 'within_limit', client_note_max_words: 80 })
    expect(data.qa.metrics.word_count).toBeGreaterThanOrEqual(120)
    expect(data.qa.metrics.client_note_word_count).toBeLessThanOrEqual(80)
    expect(data.links_and_mentions).toEqual([expect.objectContaining({ value: 'https://makeitflow.pl/index.php', owner: 'FLOW', verification_status: 'observed_in_frozen_input', operational_status: 'not_tested', opened_during_authoring: false, fact_id: 'F07' })])
    expect(data.qa).toMatchObject({ is_independent_review: false, independent_editor_review: null, additional_sources_used: 0, additional_research_performed: 0, publication_gate: 'blocked', real_approval_recorded: false, author_review_version: '1.0', unsupported_facts_added: 0 })
    expect(data.qa.copy_checks.map((c) => c.id)).toEqual(['TOV-01', 'TOV-02', 'TOV-03', 'TOV-04', 'TOV-05', 'TOV-06'])
    expect(data.qa.copy_checks[0].question).toBe('Czy otwarcie nazywa problem odbiorcy?')
  })

  it('marks the platform limit as unverified when the instruction carries no adapter limit', async () => {
    const { data, issues } = await runPipeline({ instruction: instruction({ adapter_id: null, adapter_version: null, max_text_length: null, length_unit: null, platform_limit_status: 'unknown' }), simulated: false })
    expect(data.target).toMatchObject({ platform_character_limit: null, platform_limit_status: 'unverified', publication_status: 'not_requested' })
    expect(data.qa.metrics.platform_limit_compliance).toBe('unverified')
    expect(issues.some((i) => i.code === 'PLATFORM_LIMIT_UNKNOWN')).toBe(true)
  })
})

describe('post gates', () => {
  const base = (): PostDraft => ({
    text: 'Zanim spiszesz wymagania, sprawdź potrzeby użytkowników, cel biznesowy, organizację pracy i możliwości techniczne. Więcej na https://makeitflow.pl/index.php.',
    claims_map: [{ local_ref: 'c1', fragment: 'potrzeby użytkowników, cel biznesowy', claim_id: 'CL01', fact_ids: ['F03'], creative_payload_ids: [], kind: 'fact', evidence_kind: 'source_claim', source_ids: ['S-01'], limitation: 'deklaracja', used_within_evidence: true, source_relationship: 'parafraza' }],
    links_and_mentions: [],
    client_note: 'notatka',
    self_check: { copy_checks: [], instruction_alignment: 'ok', factual_scope: 'ok', tone_of_voice: 'ok', format: 'ok', links: 'ok', evidence_limitations: [] },
  })

  it('finds forbidden links, unsupported numbers (not list markers) and prohibited claims', () => {
    const instr = instruction()
    expect(forbiddenLinks('Zobacz https://makeitflow.pl/index.php. Albo https://example.com/x)', instr)).toEqual(['https://example.com/x'])
    expect(unsupportedNumbers('1. pierwszy\n2. drugi\nAż 37% firm i 2 500 zł, a limit to 3000 znaków.', instr)).toEqual(['37%', '2', '500', '3000'])
    expect(prohibitedClaimsFound('Gwarantujemy wzrost sprzedaży po wdrożeniu. Reszta jest ok.', instr.delivery_constraints.prohibited_claims)).toEqual(['Gwarantujemy wzrost sprzedaży po wdrożeniu'])
    expect(prohibitedClaimsFound('Jesteśmy jedyną taką firmą na rynku!', instr.delivery_constraints.prohibited_claims)).toEqual([])
  })

  it('re-requests the whole draft on a forbidden link, an unsupported number or a prohibited claim; drops rows otherwise', () => {
    const instr = instruction()
    expect(() => gatePostDraft({ ...base(), text: 'Zobacz https://example.com/oferta' }, instr)).toThrow(/nothing grounded/)
    expect(() => gatePostDraft({ ...base(), text: base().text.replace('Zanim', 'Aż 37% firm. Zanim') }, instr)).toThrow(/nothing grounded/)
    expect(() => gatePostDraft({ ...base(), text: `${base().text} Gwarantujemy wzrost sprzedaży po wdrożeniu.` }, instr)).toThrow(/nothing grounded/)
    const draft = base()
    draft.links_and_mentions = [{ type: 'link', value: 'https://example.com/nope', purpose: 'x', claim_id: null, fact_id: null, source_id: null }, { type: 'mention', value: '@ktos', purpose: 'x', claim_id: null, fact_id: null, source_id: null }]
    const gated = gatePostDraft(draft, instr)
    expect(gated.value.links_and_mentions).toEqual([])
    expect(gated.issues.filter((i) => i.code === 'LINK_NOT_ALLOWED')).toHaveLength(2)
    expect(gated.value.claims_map).toHaveLength(1)
    expect(() => gatePostDraft({ ...base(), claims_map: [{ ...base().claims_map[0], fragment: 'nie ma tego w tekście' }] }, instr)).toThrow(/nothing grounded/)
  })

  it('computes the metrics and keeps the client note inside the 80-word projection', () => {
    const instr = instruction()
    const metrics = postMetrics('Ala ma kota.\nKot ma Alę. https://makeitflow.pl/index.php', 'krótka notatka', instr.delivery_constraints)
    expect(metrics).toMatchObject({ word_count: 7, line_break_count: 1, character_count_without_whitespace: 50, within_internal_word_target: false, client_note_word_count: 2, platform_limit_compliance: 'within_limit' })
    const longNote = Array.from({ length: 90 }, (_, i) => `słowo${i}`).join(' ')
    const gated = gatePostDraft({ ...base(), client_note: longNote }, instr)
    const { data, issues } = assemblePost({ outputLanguage: 'pl', draft: gated.value, instruction: instr, tov: tov(), simulated: false, versionLabel: '2.0', repairFindings: [] })
    expect(issues.some((i) => i.code === 'CLIENT_NOTE_OVER_BUDGET')).toBe(true)
    expect(issues.some((i) => i.code === 'WORD_TARGET_MISSED')).toBe(true)
    expect(data.qa.author_review_version).toBe('2.0')
    const view = renderPostClientView({ outputLanguage: 'pl', brand: 'FLOW', data })
    expect(view.limit).toBe(80)
    expect(view.issue?.code).toBe('CLIENT_VIEW_OVER_BUDGET')
  })
})

describe('post QA (7.3)', () => {
  it('renders a client view without internal ids and an internal view with everything', async () => {
    const { data, clientViewMd } = await runPipeline()
    expect(clientViewMd).toContain(data.text)
    expect(clientViewMd).toContain('## Od agencji')
    expect(clientViewMd).not.toContain('CM-01')
    expect(clientViewMd).not.toContain('claims_map')
    expect(countClientWords(data.client_note)).toBeLessThanOrEqual(80)
    const internal = renderPost({ outputLanguage: 'en', brand: 'FLOW', data, issues: [] })
    expect(internal).toContain('CM-01')
    expect(internal).toContain('not yet performed')
  })

  it('maps deterministic findings and the editor result to exactly one verdict', async () => {
    const { data } = await runPipeline()
    const instr = instruction()
    const clean = postValidatorFindings({ post: data, instruction: instr })
    expect(clean.filter((f) => f.severity === 'blocking')).toEqual([])
    const pass: PostEditorReview = { result: 'pass_for_draft', checked: ['x'], not_verified: [], findings: [], copy_checks: [], summary: 'ok' }
    expect(mergePostQaVerdict(clean, pass)).toBe('pass_for_draft')
    const tampered: PostData = {
      ...data,
      claims_map: [{ ...data.claims_map[0], fragment: 'tego zdania nie ma', fact_ids: ['F42'] }, ...data.claims_map.slice(1)],
      target: { ...data.target, publication_allowed: true },
      text: `${data.text} Zobacz https://example.com/promo — 250 zł taniej.`,
    }
    const faults = postValidatorFindings({ post: tampered, instruction: instr })
    expect(faults.map((f) => f.code)).toEqual(expect.arrayContaining(['quote_not_verbatim', 'unresolved_reference', 'other', 'unsourced_claim']))
    expect(faults.every((f) => f.owner === 'agent' && f.fix_step === '7.2')).toBe(true)
    expect(mergePostQaVerdict(faults, pass)).toBe('needs_fix')
    expect(mergePostQaVerdict(clean, { ...pass, result: 'needs_fix' })).toBe('needs_fix')
    expect(mergePostQaVerdict(clean, { ...pass, result: 'reject' })).toBe('reject')
    expect(mergePostQaVerdict(clean, { ...pass, findings: [{ code: 'other', severity: 'blocker', fragment: null, issue: 'x', fix_hint: 'y' }] })).toBe('needs_fix')
  })

  it('runs the editor with the same packet and writes its review into a new, unmutated post', async () => {
    const { data } = await runPipeline()
    const runAgent = createFixtureRunner(canned)
    const before = JSON.stringify(data)
    const first = await runPostQa({ order, outputLanguage: 'pl', post: data, instruction: instruction(), tov: tov(), runAgent, ledger: createLedger({ prices: {} }), models })
    expect(first.verdict).toBe('needs_fix')
    expect(first.findings.some((f) => f.severity === 'blocking' && f.fix_step === '7.2' && f.path.includes('Kontakt znajdziecie'))).toBe(true)
    const reviewed = applyEditorReview({ outputLanguage: 'pl', post: data, review: first.review, verdict: first.verdict })
    expect(JSON.stringify(data)).toBe(before)
    expect(reviewed.qa.is_independent_review).toBe(true)
    expect(reviewed.qa.independent_editor_review).toMatchObject({ result: 'needs_fix', is_client_approval: false, new_research: 0 })
    expect(reviewed.qa.publication_gate).toBe('blocked')
    expect(reviewed.qa.copy_checks.every((c) => c.evidence === 'Sprawdzone względem tekstu i voice_extract.')).toBe(true)
    const second = await runPostQa({ order, outputLanguage: 'pl', post: data, instruction: instruction(), tov: tov(), runAgent, ledger: createLedger({ prices: {} }), models })
    expect(second.verdict).toBe('pass_for_draft')
  })

  function loopContext(runAgent: ResearchAgentRunner, post: PostData) {
    const mocked = store as jest.Mocked<typeof store>
    for (const fn of [mocked.currentInputVersion, mocked.startTaskRun, mocked.finishTaskRun, mocked.saveDocumentVersion]) fn.mockReset()
    const versions: Record<string, unknown> = { 'WZR-POST': post, 'WZR-ZLECENIE-POSTU': instruction(), 'WZR-TOV': tov() }
    let versionNo = 1
    mocked.currentInputVersion.mockImplementation(async (_em, _scope, _orderRef, templateId) => ({ document_id: `${outputIdByTemplate[templateId]}@o`, version: `${versionNo}.0`, status: 'draft', versionId: `v-${templateId}-${versionNo}`, data: versions[templateId] }))
    mocked.startTaskRun.mockImplementation(async (_em, _scope, input) => ({ id: `run-${input.stepId}-${input.attempt}` }) as never)
    mocked.finishTaskRun.mockResolvedValue(undefined)
    mocked.saveDocumentVersion.mockImplementation(async (_em, _scope, input) => {
      versionNo += 1
      if (input.templateId === 'WZR-POST') versions['WZR-POST'] = input.data
      return { version: { id: `saved-${input.templateId}-${versionNo}` }, document: {}, envelope: {} } as never
    })
    const ctx = {
      em: {}, scope: { tenantId: 't', organizationId: 'o' }, orderRef: 'o', order, orderVersion: { document_id: 'WEW-DANE-ZAMOWIENIA@o', version: '1.0', status: 'approved' },
      runAgent, runner: 'fixture', models, ledger: createLedger({ prices: {} }), onEvent: () => {}, log: () => {},
      agentRunIds: [], taskRunIds: [], documentVersionIds: [], fetchPage: async () => { throw new Error('no fetch') }, repairFindings: [], attempt: 1,
    } as unknown as StepContext
    return { ctx, mocked }
  }

  it('re-runs 7.2 once on an editor fault, judges again and moves the reviewed version to ready_for_review', async () => {
    const { data } = await runPipeline()
    const { ctx, mocked } = loopContext(createFixtureRunner(canned), data)
    const postStep = jest.fn(async (stepCtx: StepContext) => {
      expect(stepCtx.repairFindings.length).toBeGreaterThan(0)
      expect(stepCtx.repairFindings.every((f) => f.fix_step === '7.2')).toBe(true)
      expect(stepCtx.attempt).toBe(2)
      return { taskRunId: 'run-7.2-2', versionId: 'v-post-2', status: 'done' }
    })
    const outcome = await runPostQaLoop(ctx, { postStep })
    expect(postStep).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ verdict: 'pass_for_draft', repairs: 1, taskRunId: 'run-7.3-2' })
    expect(outcome.escalationVersionId).toBeUndefined()
    const saves = mocked.saveDocumentVersion.mock.calls.map((call) => call[2])
    expect(saves.map((s) => [s.templateId, s.status])).toEqual([['WZR-POST', 'draft'], ['WZR-POST', 'ready_for_review']])
    expect(saves[1].simulation).toBe(true)
    expect((saves[1].data as PostData).qa.independent_editor_review?.result).toBe('pass_for_draft')
    expect(mocked.finishTaskRun).toHaveBeenLastCalledWith({}, { id: 'run-7.3-2' }, expect.objectContaining({ status: 'done', qaResult: expect.objectContaining({ verdict: 'pass_for_draft', repairs: 1 }) }))
    expect(ctx.documentVersionIds).toHaveLength(2)
  })

  it('opens an E.1 exception with resume point 7.2 when the editor still fails after the allowed repairs', async () => {
    const { data } = await runPipeline()
    const alwaysNeedsFix: ResearchAgentRunner = async () => ({
      result: { kind: 'research', data: { result: 'needs_fix', checked: [], not_verified: [], findings: [{ code: 'unsourced_claim', severity: 'blocker', fragment: null, issue: 'wciąż nie', fix_hint: 'popraw' }], copy_checks: [], summary: 'nadal do poprawy' } },
      usage: null,
    })
    const { ctx, mocked } = loopContext(alwaysNeedsFix, data)
    const postStep = jest.fn(async () => ({ taskRunId: 'run-7.2-x', versionId: 'v-post-x', status: 'done' }))
    const outcome = await runPostQaLoop(ctx, { postStep })
    expect(postStep).toHaveBeenCalledTimes(2)
    expect(outcome).toMatchObject({ verdict: 'needs_fix', repairs: 2 })
    expect(outcome.escalationVersionId).toMatch(/^saved-WZR-ESKALACJA/)
    const escalation = mocked.saveDocumentVersion.mock.calls.map((call) => call[2]).find((s) => s.templateId === 'WZR-ESKALACJA')
    expect(escalation?.status).toBe('blocked')
    expect(escalation?.data).toMatchObject({ exception_type: { code: 'qa_exhausted', trigger_step: '7.3' }, resume: { next_step_or_null: '7.2' } })
    expect((escalation?.data as { hold: { blocked_task_refs: string[] } }).hold.blocked_task_refs).toContain('7.4')
    expect(mocked.startTaskRun.mock.calls.map((call) => call[2].stepId)).toEqual(['7.3', '7.3', '7.3', 'E.1'])
  })
})
