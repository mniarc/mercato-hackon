import path from 'node:path'
import { orderOf, zrodla, strategia, tov, brief } from '../__fixtures__/planJourney'
import { planDataSchema, type PlanData } from '../data/schemas/plan'
import { zleceniePostuDataSchema } from '../data/schemas/zleceniePostu'
import { limits } from '../data/templates'
import { createLedger } from '../lib/research/ledger'
import { GateError } from '../lib/research/gate'
import { renderPlan, renderPlanClientView, ROW_WORDS_MAX } from '../lib/research/render/plan'
import { renderZleceniePostu } from '../lib/research/render/zleceniePostu'
import { gateTopicsSection, knownPlanIds, planValidatorFindings, runPlanPipeline, runPlanStep } from '../lib/research/steps/plan'
import { mergePlanQaVerdict, planReadyForApproval, runPlanQa, runPlanQaLoop } from '../lib/research/steps/planQa'
import { applySelection } from '../lib/research/steps/selection'
import { assemblePostInstruction } from '../lib/research/steps/postInstruction'
import type { StepContext, StrategyExecutionInput } from '../lib/research/steps/context'
import { countClientWords } from '../lib/research/util'
import { createFixtureRunner } from '../lib/runners'
import * as store from '../lib/store'

jest.mock('../lib/store', () => {
  const actual = jest.requireActual('../lib/store')
  return { ...actual, startTaskRun: jest.fn(), finishTaskRun: jest.fn(), currentInputVersion: jest.fn(), saveDocumentVersion: jest.fn() }
})

const canned = path.join(__dirname, '..', '__fixtures__', 'flow', 'canned')
const models = { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }
const order = orderOf('LinkedIn')

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
    let planVersion = '1.0'
    mocked.currentInputVersion.mockImplementation(async (_em, _scope, _orderRef, templateId) => ({ document_id: `${templateId}@o`, version: templateId === 'WZR-PLAN' ? planVersion : '1.0', status: 'draft', versionId: templateId === 'WZR-PLAN' ? `v-plan-${planVersion}` : `v-${templateId}`, data: docs[templateId] }))
    mocked.startTaskRun.mockResolvedValue({ id: 'run-63' } as never)
    mocked.finishTaskRun.mockResolvedValue(undefined)
    const document = { status: 'draft' }
    const em = { findOne: async () => document, flush: jest.fn() }
    const planStep = jest.fn(async (ctx: StepContext) => {
      expect(ctx.repairFindings.length).toBeGreaterThan(0)
      expect(ctx.attempt).toBe(2)
      planVersion = '2.0'
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
    expect(mocked.finishTaskRun).toHaveBeenCalledWith(em, expect.objectContaining({ id: 'run-63', inputVersions: expect.arrayContaining([{ document_id: 'WZR-PLAN@o', version: '2.0', status: 'draft' }]) }), expect.objectContaining({ status: 'done', outputVersionId: 'v-plan-2.0', qaResult: expect.objectContaining({ verdict: 'ready_for_approval', repairs: 1 }) }))
  })
})

describe('phase-only planning pins', () => {
  const snapshot = (name: string, data: unknown, version = '1.0'): StrategyExecutionInput => ({ document_id: `${name}@o`, version, versionId: `${name}-${version}`, status: 'approved', data })
  const context = (): StepContext => ({
    em: { findOne: jest.fn(async () => ({ status: 'draft' })), flush: jest.fn() },
    scope: { tenantId: 't', organizationId: 'o' }, orderRef: 'o', order,
    orderVersion: { document_id: 'WEW-DANE-ZAMOWIENIA@o', version: '1.0' },
    runAgent: createFixtureRunner(canned), runner: 'fixture', models, ledger: createLedger({ prices: {} }),
    onEvent: () => {}, log: () => {}, agentRunIds: [], taskRunIds: [], documentVersionIds: [],
    fetchPage: async () => { throw new Error('no fetch') }, repairFindings: [], attempt: 1,
    planningInputs: {
      strategy: snapshot('KLI-STRATEGIA', strategia()), tov: snapshot('KLI-TOV', tov()), brief: snapshot('KLI-BRIEF', brief()),
      zrodla: snapshot('WEW-ZRODLA', zrodla()),
      konkurencja: snapshot('WEW-KONKURENCJA', { selection: [], cards: [], parity_claims: [], alternative_routes: [], difference_candidates: [], channels: [], implications: [] }),
    },
    planningOutputs: { plan: null }, planningQaRepairAttempts: 1,
  }) as unknown as StepContext

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(store.currentInputVersion).mockRejectedValue(new Error('must not follow latest'))
    jest.mocked(store.startTaskRun).mockResolvedValue({ id: 'pinned-run' } as never)
    jest.mocked(store.finishTaskRun).mockResolvedValue(undefined)
    jest.mocked(store.saveDocumentVersion).mockImplementation(async (_em, _scope, input) => ({
      version: { id: `plan-${input.inputVersions.some((ref) => ref.document_id === 'KLI-PLAN@o') ? 2 : 1}` },
      envelope: { document_id: 'KLI-PLAN@o', version: '1.0', status: 'draft' },
    }) as never)
  })

  it('writes the configured count from exact foundations and shares its own draft with a repair', async () => {
    const ctx = context()
    ctx.order = { ...order, topics: 7 }
    const calls: { agentId: string; input: unknown }[] = []
    ctx.runAgent = createFixtureRunner(canned, { calls })
    await runPlanStep(ctx)
    expect((ctx.planningOutputs!.plan!.data as PlanData).topics).toHaveLength(7)
    expect(calls.slice(0, 2).map((call) => (call.input as { topic_count: number }).topic_count)).toEqual([4, 3])
    await runPlanStep({ ...ctx, attempt: 2 })
    expect(ctx.planningOutputs!.plan!.versionId).toBe('plan-2')
    expect(store.currentInputVersion).not.toHaveBeenCalled()
    const repair = jest.mocked(store.saveDocumentVersion).mock.calls[1][2]
    expect(repair.inputVersions).toContainEqual({ document_id: 'KLI-PLAN@o', version: '1.0', status: 'draft' })
    expect(repair.simulation).toBe(false)
    expect((repair.data as unknown as PlanData).selected_topic.real_approval).toBe(false)
  })

  it('checks its repaired output against the same accepted inputs and records the final QA version', async () => {
    const { data } = await runPipeline()
    const ctx = context()
    ctx.planningOutputs!.plan = { ...snapshot('KLI-PLAN', data), status: 'draft' }
    const planStep = jest.fn(async (repair: StepContext) => {
      expect(repair.planningInputs).toBe(ctx.planningInputs)
      expect(repair.planningOutputs).toBe(ctx.planningOutputs)
      repair.planningOutputs!.plan = { ...snapshot('KLI-PLAN', data, '2.0'), status: 'draft' }
      return { taskRunId: 'repair-run', versionId: 'KLI-PLAN-2.0', status: 'done' }
    })
    expect(await runPlanQaLoop(ctx, { planStep })).toMatchObject({ planVersionId: 'KLI-PLAN-2.0', readyForApproval: true, repairs: 1 })
    expect(store.currentInputVersion).not.toHaveBeenCalled()
    expect(store.finishTaskRun).toHaveBeenCalledWith(ctx.em, expect.objectContaining({
      inputVersions: expect.arrayContaining([
        { document_id: 'KLI-PLAN@o', version: '2.0', status: 'draft' },
        { document_id: 'KLI-BRIEF@o', version: '1.0', status: 'approved' },
        { document_id: 'KLI-TOV@o', version: '1.0', status: 'approved' },
      ]),
    }), expect.objectContaining({ outputVersionId: 'KLI-PLAN-2.0' }))
    expect(ctx.em.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ currentVersionId: 'KLI-PLAN-2.0' }))
  })

  it('does not substitute a current plan when the phase output is missing', async () => {
    const ctx = context()
    await expect(runPlanQaLoop(ctx, { planStep: jest.fn() })).rejects.toThrow('needs current KLI-PLAN')
    ctx.planningOutputs = undefined
    await expect(runPlanStep(ctx)).rejects.toThrow('requires its own plan output')
    expect(store.currentInputVersion).not.toHaveBeenCalled()
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
