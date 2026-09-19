import type { OrderFacts } from '../../../data/schemas/zamowienie'
import { briefDataSchema, type BriefData } from '../../../data/schemas/brief'
import type { QaFinding } from '../../../data/schemas/qa'
import { ustaleniaDataSchema, type UstaleniaData } from '../../../data/schemas/ustalenia'
import { zrodlaDataSchema, type ZrodlaData } from '../../../data/schemas/zrodla'
import { briefQaAgentResult, type BriefQaAgentData } from '../../../data/agents/brief'
import { mustKeysOf } from '../../../data/contracts'
import { limits } from '../../../data/templates'
import { AgencyResearchDocument } from '../../../data/entities'
import { RESEARCH_BRIEF_QA_AGENT_ID } from '../../agents/ids.brief'
import { currentInputVersion, finishTaskRun, startTaskRun } from '../../store'
import { collectCitedIds } from '../gate'
import { countClientWords } from '../util'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { knownBriefIds } from './brief'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 4.2 — brief completeness control. Code computes the deterministic
 * findings first (unresolved ids, MUST keys, question batch, client-view budget,
 * contradictions with the findings map); the QA agent adds what needs reading;
 * the verdict is exactly one of ready_for_approval / needs_client_data /
 * needs_agent_fix. A missing client answer is a question, not an agent fault;
 * an agent fault returns to 4.1 (≤ 2 repairs) and never burdens the client.
 */

export type BriefQaVerdict = 'ready_for_approval' | 'needs_client_data' | 'needs_agent_fix'

export type BriefQaResult = { verdict: BriefQaVerdict; findings: QaFinding[]; summary: string }

const MUST_FIELDS = mustKeysOf('WZR-BRIEF')

const finding = (code: QaFinding['code'], path: string, gap: string, owner: QaFinding['owner'], severity: QaFinding['severity'] = 'blocking', fixStep: string | null = null): QaFinding => ({
  code,
  path,
  severity,
  gap,
  owner,
  fix_step: fixStep,
  fix_hint: null,
})

/** Deterministic checks — the validator half of 4.2. */
export function briefValidatorFindings(args: { brief: BriefData; ustalenia: UstaleniaData; zrodla: ZrodlaData; clientViewMd: string | null }): QaFinding[] {
  const { brief, ustalenia, zrodla, clientViewMd } = args
  const findings: QaFinding[] = []
  // The brief's own ids (assets, assumptions, voice variants) are definitions, not citations.
  const known = new Set([
    ...knownBriefIds(zrodla, ustalenia),
    ...brief.assets_and_permissions.map((a) => a.asset_id),
    ...brief.open_assumptions.map((a) => a.assumption_id),
    ...brief.voice_preferences.proposed_examples.map((e) => e.variant_id),
  ])
  for (const [path, ids] of collectCitedIds(brief)) {
    for (const id of ids) if (!known.has(id)) findings.push(finding('unresolved_reference', `KLI-BRIEF.${path}`, `${id} is not a stored id`, 'agent', 'blocking', '4.1'))
  }
  const record = brief as unknown as Record<string, unknown>
  for (const key of MUST_FIELDS) {
    const value = record[key]
    const empty = value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value) && Object.values(value as Record<string, unknown>).every((v) => v === null || v === '' || (Array.isArray(v) && v.length === 0)))
    if (empty) findings.push(finding('missing_must_field', `KLI-BRIEF.${key}`, `MUST field ${key} is empty`, 'agent', 'blocking', '4.1'))
  }
  if (brief.voice_preferences.client_selection !== null) {
    findings.push(finding('other', 'KLI-BRIEF.voice_preferences.client_selection', 'a voice example was recorded as selected without a client decision', 'agent', 'blocking', '4.1'))
  }
  if (brief.channel_and_cta.publication_readiness === 'ready' && !brief.channel_and_cta.owner) {
    findings.push(finding('other', 'KLI-BRIEF.channel_and_cta.publication_readiness', 'publication marked ready without a contact owner', 'agent', 'blocking', '4.1'))
  }
  if (brief.success_and_limits.numerical_target && !brief.success_and_limits.baseline) {
    findings.push(finding('invented_effectiveness', 'KLI-BRIEF.success_and_limits.numerical_target', 'a numeric target without a baseline', 'agent', 'blocking', '4.1'))
  }
  // Contradictions with the findings map: a blocked MUST row cannot be presented as settled.
  const decided: Record<string, string> = {
    priority_offer: brief.priority_offer.decision_state,
    priority_audience: brief.priority_audience.decision_state,
    business_direction: brief.business_direction.decision_state,
    voice_preferences: brief.voice_preferences.decision_state,
    channel_and_cta: brief.channel_and_cta.decision_state,
  }
  for (const row of ustalenia.field_map) {
    if (row.priority !== 'must') continue
    if (row.readiness === 'blocked') {
      findings.push(finding('missing_must_field', `KLI-BRIEF.${row.field_key}`, `${row.field_key}: ${row.reason} (blocked in the findings map; owner ${row.decision_state === 'awaiting_client' ? 'client' : 'research'})`, row.decision_state === 'awaiting_client' ? 'client' : 'research', 'blocking', null))
    }
    if (decided[row.field_key] === 'client_selected' && row.decision_state !== 'client_selected') {
      findings.push(finding('contradiction', `KLI-BRIEF.${row.field_key}.decision_state`, `${row.field_key} presented as decided while the findings map says ${row.decision_state}`, 'agent', 'blocking', '4.1'))
    }
  }
  const openQuestions = ustalenia.questions.filter((q) => !/^resolved/.test(q.state))
  if (openQuestions.length > limits.clientText.questionBatchMax) {
    findings.push(finding('limit_exceeded', 'WEW-USTALENIA.questions', `${openQuestions.length} open questions; the first contact carries at most ${limits.clientText.questionBatchMax}`, 'agent', 'minor', '3.6'))
  }
  if (clientViewMd) {
    const words = countClientWords(clientViewMd)
    if (words > limits.clientText.briefWordsMax) findings.push(finding('limit_exceeded', 'KLI-BRIEF.client_view', `client view has ${words} words, limit ${limits.clientText.briefWordsMax}`, 'agent', 'major', '4.1'))
  }
  // Every MUST decision still with the client is a question for 4.3, never an agent fault.
  for (const [key, state] of Object.entries(decided)) {
    if (state === 'awaiting_client') findings.push(finding('missing_must_field', `KLI-BRIEF.${key}`, `${key} awaits the client's decision`, 'client', 'blocking', null))
  }
  return findings
}

/** The verdict rules, in one place: agent faults first, then client gaps, else ready. */
export function mergeBriefQaVerdict(findings: QaFinding[]): BriefQaVerdict {
  if (findings.some((f) => f.severity === 'blocking' && f.owner === 'agent')) return 'needs_agent_fix'
  if (findings.some((f) => f.severity === 'blocking' && (f.owner === 'client' || f.owner === 'research'))) return 'needs_client_data'
  return 'ready_for_approval'
}

export type BriefQaOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  brief: BriefData
  ustalenia: UstaleniaData
  zrodla: ZrodlaData
  clientViewMd?: string | null
  validatorFindings?: QaFinding[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
}

const CRITERIA = [
  'Every filled MUST field has sources.',
  'Nothing contradicts the findings map; a blocked row is not presented as settled.',
  'No future vision, goal or priority is recorded as a fact taken from the website.',
  'Promise constraints forbid what the proof cards cannot support.',
  'The two voice examples are equally valid variants of the same facts.',
  'The CTA destination is not presented as working unless verified; an owner exists before publication.',
  'Questions ask only for what research could not know; never for company data already provided.',
  'A missing client decision is a question; an editorial or drafting error is an agent fix.',
]

export async function runBriefQa(opts: BriefQaOptions): Promise<BriefQaResult & { stats: { agentCalls: number; cachedSteps: number } }> {
  const onEvent = opts.onEvent ?? (() => {})
  const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
  const step = createStepRunner({
    runAgent: opts.runAgent,
    ledger: opts.ledger,
    models: opts.models,
    cache: opts.cache,
    groundingRetries: limits.generation.groundingRetries,
    onEvent,
    timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
    stats,
  })
  const validator = opts.validatorFindings ?? briefValidatorFindings({ brief: opts.brief, ustalenia: opts.ustalenia, zrodla: opts.zrodla, clientViewMd: opts.clientViewMd ?? null })
  const { value } = await step<BriefQaAgentData>({
    step: '4.2',
    agentId: RESEARCH_BRIEF_QA_AGENT_ID,
    label: 'brief_qa',
    input: {
      order: { brand: opts.order.brand, market: opts.order.market, language: opts.order.language, websiteUrl: opts.order.websiteUrl, purchaseGoal: opts.order.purchaseGoal, sku: opts.order.sku },
      outputLanguage: opts.outputLanguage,
      brief: opts.brief,
      field_map: opts.ustalenia.field_map,
      readiness: opts.ustalenia.readiness.map((r) => ({ output: r.output, state: r.state, missing: r.missing, owner: r.owner })),
      validator_findings: validator,
      criteria: CRITERIA,
    },
    parse: (raw) => briefQaAgentResult.parse(raw).data,
    // The agent's findings must point somewhere in the brief or the map; a stray path is dropped.
    gate: (data) => {
      const kept = data.findings.filter((f) => /^(KLI-BRIEF|WEW-USTALENIA|WEW-ZRODLA)/.test(f.path)).slice(0, 20)
      return { value: { ...data, findings: kept }, issues: [], kept: kept.length, dropped: data.findings.length - kept.length }
    },
  })
  const findings = [...validator, ...value.findings]
  return { verdict: mergeBriefQaVerdict(findings), findings, summary: value.summary, stats: { agentCalls: stats.agentCalls, cachedSteps: stats.cachedSteps } }
}

export type BriefQaLoopResult = { verdict: BriefQaVerdict; findings: QaFinding[]; taskRunId: string; repairs: number; briefVersionId: string | null }

/**
 * 4.2 with its return path: an agent fault re-runs 4.1 with the findings as
 * repair input (≤ STD-LIMITY qa_repair_attempts), then stops as `to_fix`; a
 * client gap or a clean brief moves the document to `ready_for_review` — the
 * questions are the client view, approval belongs to 4.3–4.6.
 */
export async function runBriefQaLoop(ctx: StepContext, deps: { briefStep: (ctx: StepContext) => Promise<StepOutcome> }): Promise<BriefQaLoopResult> {
  const load = async () => {
    const brief = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-BRIEF')
    const ustalenia = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-USTALENIA')
    const zrodla = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
    if (!brief || !ustalenia || !zrodla) throw new Error('[internal] 4.2 needs current KLI-BRIEF, WEW-USTALENIA and WEW-ZRODLA versions')
    return { brief, ustalenia, zrodla }
  }
  let current = await load()
  const run = await startTaskRun(ctx.em, ctx.scope, {
    orderRef: ctx.orderRef,
    brand: ctx.order.brand,
    stepId: '4.2',
    attempt: ctx.attempt,
    runner: ctx.runner,
    models: ctx.models,
    inputVersions: [ctx.orderVersion, { document_id: current.brief.document_id, version: current.brief.version, status: current.brief.status }],
  })
  ctx.taskRunIds.push(run.id)
  let repairs = 0
  try {
    for (;;) {
      const versionRow = await ctx.em.getConnection().execute(`select client_view_md from agency_research_document_versions where id = ?`, [current.brief.versionId])
      const clientViewMd = Array.isArray(versionRow) && versionRow[0] ? ((versionRow[0] as { client_view_md?: string | null }).client_view_md ?? null) : null
      const result = await runBriefQa({
        order: ctx.order,
        outputLanguage: ctx.order.outputLanguage,
        brief: briefDataSchema.parse(current.brief.data),
        ustalenia: ustaleniaDataSchema.parse(current.ustalenia.data),
        zrodla: zrodlaDataSchema.parse(current.zrodla.data),
        clientViewMd,
        runAgent: ctx.runAgent,
        ledger: ctx.ledger,
        models: ctx.models,
        cache: ctx.cache,
        onEvent: ctx.onEvent,
      })
      const agentFindings = result.findings.filter((f) => f.owner === 'agent' && f.severity === 'blocking')
      if (result.verdict === 'needs_agent_fix' && repairs < limits.generation.qaRepairAttemptsPerRun) {
        repairs += 1
        ctx.log(`4.2: ${agentFindings.length} agent findings — repair ${repairs}/${limits.generation.qaRepairAttemptsPerRun}`)
        await deps.briefStep({ ...ctx, repairFindings: agentFindings, attempt: ctx.attempt + repairs })
        current = await load()
        continue
      }
      const document = await ctx.em.findOne(AgencyResearchDocument, { ...ctx.scope, orderRef: ctx.orderRef, templateId: 'WZR-BRIEF', deletedAt: null })
      const status = result.verdict === 'needs_agent_fix' ? 'to_fix' : 'done'
      if (document) {
        document.status = result.verdict === 'needs_agent_fix' ? 'draft' : 'ready_for_review'
        await ctx.em.flush()
      }
      await finishTaskRun(ctx.em, run, {
        status,
        outputVersionId: current.brief.versionId,
        qaResult: { verdict: result.verdict, findings: result.findings, summary: result.summary, repairs },
        agentRunIds: ctx.agentRunIds,
        cost: ctx.ledger.snapshot(),
      })
      return { verdict: result.verdict, findings: result.findings, taskRunId: run.id, repairs, briefVersionId: current.brief.versionId }
    }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
