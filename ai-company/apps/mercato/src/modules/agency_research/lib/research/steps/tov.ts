import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { QaFinding } from '../../../data/schemas/qa'
import { audytDataSchema, type AudytData } from '../../../data/schemas/audyt'
import { briefDataSchema, type BriefData } from '../../../data/schemas/brief'
import { strategiaDataSchema, type StrategiaData } from '../../../data/schemas/strategia'
import { styleAxisSchema, tovDataSchema, evidenceLanguageSchema, type TovData } from '../../../data/schemas/tov'
import { zrodlaDataSchema, type ZrodlaData } from '../../../data/schemas/zrodla'
import { tovWriterResult, type TovSection, type TovWriterInput, type TovWriterSections } from '../../../data/agents/strategy'
import { limits } from '../../../data/templates'
import { RESEARCH_TOV_WRITER_AGENT_ID } from '../../agents/ids.strategy'
import { finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { readStrategyFoundation, readStrategyPairVersion, recordStrategyPairVersion, strategyAuthoringSimulationIssue } from './strategyInputs'
import { GateError, type GateIssue } from '../gate'
import { resolveId } from '../ids'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { renderTov, renderTovClientView } from '../render/tov'
import { briefInputOf } from './strategy'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 5.3 — KLI-TOV. The writer is asked twice, once per section group, and
 * the document is assembled here: exactly four principles, all five style axes,
 * all five evidence-language types, three before/after pairs whose `status` is
 * `grounded` only when their facts resolve, 6–8 copy checks. The voice is derived
 * from the client's real samples and the brief's preferences — a recommendation
 * for approval, never a diagnosis of the current style.
 */

export type TovPipelineOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  strategy: StrategiaData
  brief: BriefData
  zrodla: ZrodlaData
  audyt: AudytData
  previousTov?: TovData | null
  repairFindings?: QaFinding[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
  groundingRetries?: number
}

export type TovPipelineResult = {
  data: TovData
  issues: DocumentIssue[]
  clientViewMd: string
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}

const SECTION_KEYS = {
  principles_axes_wording: ['voice_principles', 'style_axes', 'wording'],
  evidence_examples_checks: ['evidence_language', 'before_after', 'context_rules', 'copy_checks'],
} as const

export const PRINCIPLES_COUNT = 4
export const STYLE_AXES = styleAxisSchema.shape.axis.options
export const EVIDENCE_TYPES = evidenceLanguageSchema.shape.type.options
export const MIN_REPLACEMENTS = 5

const issue = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

/** Every id a ToV may cite: facts, proofs, samples, and the strategy's claims. */
export function knownTovIds(zrodla: ZrodlaData, strategy: StrategiaData): Set<string> {
  return new Set([
    ...zrodla.facts.map((f) => f.fact_id),
    ...zrodla.proof_cards.map((p) => p.proof_id),
    ...zrodla.language_samples.map((s) => s.sample_id),
    ...zrodla.sources.map((s) => s.source_id),
    ...strategy.proof_architecture.map((c) => c.claim_id),
    ...strategy.pillars.map((p) => p.pillar_id),
  ])
}

function keepKnown(ids: string[], known: Set<string>, path: string, issues: GateIssue[]): string[] {
  const kept: string[] = []
  for (const cited of ids) {
    const resolved = resolveId(cited, known)
    if (resolved) kept.push(resolved)
    else issues.push(issue('UNKNOWN_ID', path, `${cited} is not a stored id; dropped`))
  }
  return [...new Set(kept)]
}

/** The section keys the requested call must return, with the structural minimums that a re-request can fix. */
export function gateTovSection(section: TovSection, sections: TovWriterSections, known: Set<string>): { value: TovWriterSections; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const missing = SECTION_KEYS[section].filter((key) => sections[key] === undefined)
  if (missing.length) throw new GateError(`tov_writer ${section}`, [issue('MISSING_SECTION', section, `section keys missing: ${missing.join(', ')}`, 'dropped')])
  const value: TovWriterSections = {}
  for (const key of SECTION_KEYS[section]) (value as Record<string, unknown>)[key] = sections[key]
  const walk = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) return node.map((item, index) => walk(item, `${path}[${index}]`))
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = /(^|_)ids$/.test(k) && Array.isArray(v) ? keepKnown(v.filter((x): x is string => typeof x === 'string'), known, `${path}.${k}`, issues) : walk(v, `${path}.${k}`)
      }
      return out
    }
    return node
  }
  const gated = walk(value, section) as TovWriterSections
  const rejections: GateIssue[] = []
  if (section === 'principles_axes_wording') {
    if ((gated.voice_principles?.length ?? 0) < PRINCIPLES_COUNT) rejections.push(issue('PRINCIPLES_COUNT', 'voice_principles', `${gated.voice_principles?.length ?? 0} principles; exactly ${PRINCIPLES_COUNT} expected`, 'dropped'))
    const axes = new Set(gated.style_axes?.map((a) => a.axis) ?? [])
    const missingAxes = STYLE_AXES.filter((axis) => !axes.has(axis))
    if (missingAxes.length) rejections.push(issue('STYLE_AXES_MISSING', 'style_axes', `axes missing: ${missingAxes.join(', ')}`, 'dropped'))
  }
  if (section === 'evidence_examples_checks') {
    const types = new Set(gated.evidence_language?.map((e) => e.type) ?? [])
    const missingTypes = EVIDENCE_TYPES.filter((type) => !types.has(type))
    if (missingTypes.length) rejections.push(issue('EVIDENCE_LANGUAGE_MISSING', 'evidence_language', `evidence types missing: ${missingTypes.join(', ')}`, 'dropped'))
    const [minChecks] = limits.content.copyChecks
    if ((gated.copy_checks?.length ?? 0) < minChecks) rejections.push(issue('COPY_CHECKS_COUNT', 'copy_checks', `${gated.copy_checks?.length ?? 0} copy checks; ${limits.content.copyChecks.join('–')} expected`, 'dropped'))
  }
  if (rejections.length) throw new GateError(`tov_writer ${section}`, rejections)
  return { value: gated, issues, kept: SECTION_KEYS[section].length, dropped: issues.length }
}

/** Pure assembly of the two gated sections into KLI-TOV data; the rules that belong to code live here. */
export function assembleTov(args: { sections: TovWriterSections; known: Set<string> }): { data: TovData; issues: DocumentIssue[] } {
  const { sections } = args
  const issues: DocumentIssue[] = []
  const s = sections as Required<TovWriterSections>

  const principles = s.voice_principles.slice(0, PRINCIPLES_COUNT)
  if (s.voice_principles.length > PRINCIPLES_COUNT) issues.push({ code: 'PRINCIPLES_TRIMMED', severity: 'repaired', detail: `${s.voice_principles.length} principles returned; the first ${PRINCIPLES_COUNT} kept`, path: 'voice_principles' })

  // One row per axis, first occurrence wins, in the contract's order.
  const axes = STYLE_AXES.map((axis) => s.style_axes.find((row) => row.axis === axis)!)
  if (s.style_axes.length > axes.length) issues.push({ code: 'STYLE_AXES_DEDUPED', severity: 'repaired', detail: 'duplicate axes removed', path: 'style_axes' })

  if (s.wording.replacements.length < MIN_REPLACEMENTS) {
    issues.push({ code: 'REPLACEMENTS_FEW', severity: 'limitation', detail: `${s.wording.replacements.length} jargon replacements; at least ${MIN_REPLACEMENTS} expected`, path: 'wording.replacements' })
  }
  const preferred = new Set(s.wording.preferred_in_context.map((w) => w.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()))
  const cliches = s.wording.cliches.filter((c) => !preferred.has(c.trim().toLowerCase()))
  if (cliches.length < s.wording.cliches.length) issues.push({ code: 'CLICHE_ALSO_PREFERRED', severity: 'repaired', detail: 'a banned cliché was also listed as preferred; removed from the ban list', path: 'wording.cliches' })

  const evidenceLanguage = EVIDENCE_TYPES.map((type) => s.evidence_language.find((row) => row.type === type)!)

  // Grounded only when the facts behind the pair resolve; otherwise an explicitly creative example.
  const pairs = s.before_after.slice(0, limits.content.beforeAfterPairs).map((pair) => ({
    before: pair.before,
    after: pair.after,
    changed_principle: pair.changed_principle,
    fact_ids: pair.fact_ids,
    status: pair.fact_ids.length ? ('grounded' as const) : ('creative_example' as const),
  }))
  if (s.before_after.length > limits.content.beforeAfterPairs) issues.push({ code: 'BEFORE_AFTER_TRIMMED', severity: 'repaired', detail: `${s.before_after.length} pairs returned; the first ${limits.content.beforeAfterPairs} kept`, path: 'before_after' })
  if (pairs.length < limits.content.beforeAfterPairs) issues.push({ code: 'BEFORE_AFTER_COUNT', severity: 'limitation', detail: `${pairs.length} before/after pairs; ${limits.content.beforeAfterPairs} expected`, path: 'before_after' })
  if (pairs.some((p) => p.status === 'creative_example')) issues.push({ code: 'EXAMPLE_NOT_GROUNDED', severity: 'limitation', detail: 'a before/after pair cites no fact and is marked as a creative example', path: 'before_after' })

  const [, maxChecks] = limits.content.copyChecks
  const checks = s.copy_checks.slice(0, maxChecks)
  if (s.copy_checks.length > maxChecks) issues.push({ code: 'COPY_CHECKS_TRIMMED', severity: 'repaired', detail: `${s.copy_checks.length} copy checks returned; the first ${maxChecks} kept`, path: 'copy_checks' })

  const data: TovData = {
    voice_principles: principles,
    style_axes: axes,
    wording: { ...s.wording, cliches },
    evidence_language: evidenceLanguage,
    before_after: pairs,
    context_rules: s.context_rules,
    copy_checks: checks,
  }
  return { data: tovDataSchema.parse(data), issues }
}

function writerInput(opts: TovPipelineOptions, section: TovSection, draft: TovWriterSections): TovWriterInput {
  const { order, strategy, brief, zrodla, audyt } = opts
  const briefInput = briefInputOf(brief)
  const dimension = (d: AudytData['voice_audit']['formality']) => `${d.finding}${d.interpretation_limit ? ` (${d.interpretation_limit})` : ''}`
  return {
    order: { brand: order.brand, market: order.market, language: order.language, websiteUrl: order.websiteUrl, purchaseGoal: order.purchaseGoal, sku: order.sku },
    outputLanguage: opts.outputLanguage,
    section,
    strategy: {
      strategic_choice: { positioning: strategy.strategic_choice.positioning, audience: strategy.strategic_choice.audience, situation: strategy.strategic_choice.situation, deprioritized: strategy.strategic_choice.deprioritized },
      uvp: { claim_id: strategy.uvp.claim_id, working_sentence: strategy.uvp.working_sentence, mechanism: strategy.uvp.mechanism, reason_to_believe: strategy.uvp.reason_to_believe, support_level: strategy.uvp.support_level },
      message_hierarchy: { main_promise: strategy.message_hierarchy.main_promise.text, supporting_messages: strategy.message_hierarchy.supporting_messages.map((m) => m.text) },
      proof_architecture: strategy.proof_architecture.map((c) => ({ claim_id: c.claim_id, allowed_claim: c.allowed_claim, forbidden_claim: c.forbidden_claim, status: c.status })),
      creative_boundaries: { prohibited_promises: strategy.creative_boundaries.prohibited_promises, permitted_creativity: strategy.creative_boundaries.permitted_creativity, not_promoted: strategy.creative_boundaries.not_promoted },
      channel_role: { channel: strategy.channel_role.channel, role: strategy.channel_role.role, knowledge_level: strategy.channel_role.knowledge_level },
    },
    brief: { voice_preferences: briefInput.voice_preferences, priority_audience: briefInput.priority_audience, promise_constraints: briefInput.promise_constraints, open_assumptions: briefInput.open_assumptions },
    voice_audit: {
      sample_size: audyt.voice_audit.sample_size,
      formality: dimension(audyt.voice_audit.formality),
      directness: dimension(audyt.voice_audit.directness),
      technical_level: dimension(audyt.voice_audit.technical_level),
      emotion: dimension(audyt.voice_audit.emotion),
      claim_certainty: dimension(audyt.voice_audit.claim_certainty),
      recurring_phrases: dimension(audyt.voice_audit.recurring_phrases),
      future_voice_status: audyt.voice_audit.future_voice_status,
    },
    language_samples: zrodla.language_samples.map((l) => ({ sample_id: l.sample_id, channel: l.channel, excerpt: l.excerpt_or_paraphrase, linguistic_features: l.linguistic_features })),
    facts: zrodla.facts.map((f) => ({ fact_id: f.fact_id, entity: f.entity, claim: f.claim, kind: f.kind, limitation: f.limitation })),
    proof_cards: zrodla.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method, observed_result: p.observed_result, fact_ids: p.fact_ids, limitations: p.limitations })),
    draft: draft as Record<string, unknown>,
    previous_tov: opts.repairFindings?.length ? ((opts.previousTov as unknown as Record<string, unknown> | undefined) ?? null) : null,
    repair_findings: opts.repairFindings ?? [],
  }
}

export async function runTovPipeline(opts: TovPipelineOptions): Promise<TovPipelineResult> {
  const onEvent = opts.onEvent ?? (() => {})
  const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
  const step = createStepRunner({
    runAgent: opts.runAgent,
    ledger: opts.ledger,
    models: opts.models,
    cache: opts.cache,
    groundingRetries: opts.groundingRetries ?? limits.generation.groundingRetries,
    onEvent,
    timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
    stats,
  })
  const known = knownTovIds(opts.zrodla, opts.strategy)
  const issues: DocumentIssue[] = []
  const sections: TovWriterSections = {}
  for (const section of Object.keys(SECTION_KEYS) as TovSection[]) {
    const { value, issues: sectionIssues } = await step<TovWriterSections>({
      step: '5.3',
      agentId: RESEARCH_TOV_WRITER_AGENT_ID,
      label: section,
      input: writerInput(opts, section, sections),
      parse: (raw) => tovWriterResult.parse(raw).data,
      gate: (data) => gateTovSection(section, data, known),
    })
    issues.push(...sectionIssues)
    Object.assign(sections, value)
  }
  const assembled = assembleTov({ sections, known })
  issues.push(...assembled.issues)
  const view = renderTovClientView({ outputLanguage: opts.outputLanguage, brand: opts.order.brand, data: assembled.data })
  if (view.issue) issues.push(view.issue)
  return { data: assembled.data, issues, clientViewMd: view.markdown, stats }
}

const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })

/** The ToV's inputs per the WZR-TOV handoff: the working strategy, the brief, the audit's voice findings, the register, and the previous ToV on a revision. */
export async function runTovStep(ctx: StepContext): Promise<StepOutcome> {
  const strategy = await readStrategyPairVersion(ctx, 'strategy')
  const brief = await readStrategyFoundation(ctx, 'brief')
  const zrodla = await readStrategyFoundation(ctx, 'zrodla')
  const audyt = await readStrategyFoundation(ctx, 'audyt')
  if (!strategy || !brief || !zrodla || !audyt) throw new Error('[internal] 5.3 needs current KLI-STRATEGIA, KLI-BRIEF, WEW-ZRODLA and WEW-AUDYT versions — run 5.2 first')
  const previous = await readStrategyPairVersion(ctx, 'tov')
  const inputVersions: InputVersion[] = [ctx.orderVersion, pin(strategy), pin(brief), pin(zrodla), pin(audyt), ...(previous ? [pin(previous)] : [])]
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '5.3', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const result = await runTovPipeline({
      order: ctx.order,
      outputLanguage: ctx.order.outputLanguage,
      strategy: strategiaDataSchema.parse(strategy.data),
      brief: briefDataSchema.parse(brief.data),
      zrodla: zrodlaDataSchema.parse(zrodla.data),
      audyt: audytDataSchema.parse(audyt.data),
      previousTov: previous ? tovDataSchema.parse(previous.data) : null,
      repairFindings: ctx.repairFindings,
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      onEvent: ctx.onEvent,
    })
    const simulation = strategyAuthoringSimulationIssue(ctx, inputVersions)
    const issues = simulation ? [...result.issues, simulation] : result.issues
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-TOV',
      status: 'draft',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderTov({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: result.data, issues }),
      clientViewMd: result.clientViewMd,
      taskRunId: run.id,
      simulation: simulation !== null,
    })
    ctx.documentVersionIds.push(saved.version.id)
    if (ctx.strategyInputs) recordStrategyPairVersion(ctx, 'tov', { document_id: saved.envelope.document_id, version: saved.envelope.version, status: saved.envelope.status, versionId: saved.version.id, data: saved.version.data })
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { stats: result.stats }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
