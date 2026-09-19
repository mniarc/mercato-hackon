import type { InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { QaFinding } from '../../../data/schemas/qa'
import { NON_PUBLIC_EVIDENCE } from './qa'
import { audytDataSchema, type AudytData } from '../../../data/schemas/audyt'
import { briefDataSchema, type BriefData } from '../../../data/schemas/brief'
import { konkurencjaDataSchema, type KonkurencjaData } from '../../../data/schemas/konkurencja'
import { strategiaDataSchema, type StrategiaData } from '../../../data/schemas/strategia'
import { tovDataSchema, type TovData } from '../../../data/schemas/tov'
import { zrodlaDataSchema, type ZrodlaData } from '../../../data/schemas/zrodla'
import { strategyQaAgentResult, type StrategyQaAgentData, type StrategyQaVerdict } from '../../../data/agents/strategy'
import { mustKeysOf } from '../../../data/contracts'
import { limits } from '../../../data/templates'
import { AgencyResearchDocument } from '../../../data/entities'
import { RESEARCH_STRATEGY_QA_AGENT_ID } from '../../agents/ids.strategy'
import { currentInputVersion, finishTaskRun, startTaskRun } from '../../store'
import { openEscalation, type EscalationInput } from '../escalate'
import { collectCitedIds } from '../gate'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { countClientWords } from '../util'
import type { StepContext, StepOutcome } from './context'
import { briefInputOf, evidenceInputOf, knownStrategyIds, maxSupportLevel } from './strategy'
import { EVIDENCE_TYPES, knownTovIds, PRINCIPLES_COUNT, STYLE_AXES } from './tov'

/**
 * Step 5.4 — Q-S, quality control of the strategy + ToV pair. Code computes the
 * deterministic findings first (unresolved ids, MUST keys, pillar count, support
 * levels above what the proofs allow, unsupported uniqueness, ungrounded examples,
 * check counts, client-view budgets); the QA agent adds what needs reading (fit
 * with the goal, contradictions, tactical detail posing as strategy). The verdict
 * is exactly one of ready_for_approval / needs_agent_fix; a fault returns to its
 * author (5.2 or 5.3, ≤ 2 repairs) and then escalates. Approval is the client's.
 */

export type StrategyQaResult = { verdict: StrategyQaVerdict; findings: QaFinding[]; summary: string }

const STRATEGY_MUST = mustKeysOf('WZR-STRATEGIA')
const TOV_MUST = mustKeysOf('WZR-TOV')
const UNIQUENESS = /\b(jedyn\w*|unikaln\w*|unikatow\w*|only\b|unique\w*|niepowtarzaln\w*)/i
const supportRank = { declared_method: 0, documented_capability: 1, demonstrated_result: 2 } as const

const finding = (code: QaFinding['code'], path: string, gap: string, fixStep: '5.2' | '5.3', severity: QaFinding['severity'] = 'blocking'): QaFinding => ({
  code,
  path,
  severity,
  gap,
  owner: 'agent',
  fix_step: fixStep,
  fix_hint: null,
})

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every((v) => v === null || v === '' || (Array.isArray(v) && v.length === 0))
  return false
}

/** Deterministic checks — the validator half of 5.4. */
export function strategyValidatorFindings(args: {
  strategy: StrategiaData
  tov: TovData
  brief: BriefData
  zrodla: ZrodlaData
  audyt: AudytData
  konkurencja: KonkurencjaData | null
  strategyClientViewMd?: string | null
  tovClientViewMd?: string | null
}): QaFinding[] {
  const { strategy, tov, brief, zrodla, audyt, konkurencja } = args
  const findings: QaFinding[] = []
  const proofById = new Map(zrodla.proof_cards.map((p) => [p.proof_id, p]))

  // The strategy's own claims and pillars are definitions, not citations.
  const knownStrategy = new Set([...knownStrategyIds(zrodla, brief, audyt, konkurencja), ...strategy.proof_architecture.map((c) => c.claim_id), ...strategy.pillars.map((p) => p.pillar_id)])
  for (const [path, ids] of collectCitedIds(strategy)) {
    for (const id of ids) if (!knownStrategy.has(id)) findings.push(finding('unresolved_reference', `KLI-STRATEGIA.${path}`, `${id} is not a stored id`, '5.2'))
  }
  const knownTov = knownTovIds(zrodla, strategy)
  for (const [path, ids] of collectCitedIds(tov)) {
    for (const id of ids) if (!knownTov.has(id)) findings.push(finding('unresolved_reference', `KLI-TOV.${path}`, `${id} is not a stored id`, '5.3'))
  }

  const strategyRecord = strategy as unknown as Record<string, unknown>
  for (const key of STRATEGY_MUST) if (isEmpty(strategyRecord[key])) findings.push(finding('missing_must_field', `KLI-STRATEGIA.${key}`, `MUST field ${key} is empty`, '5.2'))
  const tovRecord = tov as unknown as Record<string, unknown>
  for (const key of TOV_MUST) if (isEmpty(tovRecord[key])) findings.push(finding('missing_must_field', `KLI-TOV.${key}`, `MUST field ${key} is empty`, '5.3'))

  const [minPillars, maxPillars] = limits.content.pillars
  if (strategy.pillars.length < minPillars || strategy.pillars.length > maxPillars) {
    findings.push(finding('limit_exceeded', 'KLI-STRATEGIA.pillars', `${strategy.pillars.length} pillars; ${minPillars}–${maxPillars} expected`, '5.2'))
  }
  for (const pillar of strategy.pillars) {
    if (!pillar.seed_ids.length && !pillar.claim_ids.length) findings.push(finding('unsourced_claim', `KLI-STRATEGIA.pillars[${pillar.pillar_id}]`, 'a pillar without seeds or claims cannot be developed from the material', '5.2'))
  }

  // No auto promotion: a claim's status may not exceed what its proofs allow.
  for (const row of strategy.proof_architecture) {
    const allowed = maxSupportLevel(row.proof_ids, proofById)
    if (supportRank[row.status] > supportRank[allowed]) findings.push(finding('invented_effectiveness', `KLI-STRATEGIA.proof_architecture[${row.claim_id}].status`, `${row.status} claimed; the cited proofs allow ${allowed}`, '5.2'))
    if (row.status === 'demonstrated_result' && !row.proof_ids.length) findings.push(finding('unsourced_claim', `KLI-STRATEGIA.proof_architecture[${row.claim_id}]`, 'a demonstrated result without a proof card', '5.2'))
  }
  const uvpAllowed = maxSupportLevel(strategy.uvp.evidence_ids.filter((id) => proofById.has(id)), proofById)
  if (supportRank[strategy.uvp.support_level] > supportRank[uvpAllowed]) findings.push(finding('invented_effectiveness', 'KLI-STRATEGIA.uvp.support_level', `${strategy.uvp.support_level} claimed; the cited proofs allow ${uvpAllowed}`, '5.2'))
  if (UNIQUENESS.test(`${strategy.uvp.working_sentence} ${strategy.uvp.reason_to_believe} ${strategy.strategic_choice.rationale}`) && strategy.uvp.support_level !== 'demonstrated_result') {
    findings.push(finding('unsourced_claim', 'KLI-STRATEGIA.uvp', 'uniqueness is claimed without a demonstrated proof; absence at a competitor is not exclusivity', '5.2'))
  }
  if (strategy.measurement_hypothesis.numerical_target && !strategy.measurement_hypothesis.baseline) {
    findings.push(finding('invented_effectiveness', 'KLI-STRATEGIA.measurement_hypothesis.numerical_target', 'a numeric target without a baseline', '5.2'))
  }
  // The strategy may not promise what the brief forbids.
  const promiseText = `${strategy.uvp.working_sentence} ${strategy.message_hierarchy.main_promise.text}`.toLowerCase()
  for (const prohibited of brief.promise_constraints.prohibited_claims) {
    const key = prohibited.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
    if (key.length >= 2 && key.every((w) => promiseText.includes(w))) findings.push(finding('contradiction', 'KLI-STRATEGIA.message_hierarchy.main_promise', `the promise repeats a claim the brief prohibits: "${prohibited}"`, '5.2'))
  }

  if (tov.voice_principles.length !== PRINCIPLES_COUNT) findings.push(finding('limit_exceeded', 'KLI-TOV.voice_principles', `${tov.voice_principles.length} principles; exactly ${PRINCIPLES_COUNT} expected`, '5.3'))
  const axes = new Set(tov.style_axes.map((a) => a.axis))
  for (const axis of STYLE_AXES) if (!axes.has(axis)) findings.push(finding('missing_must_field', `KLI-TOV.style_axes.${axis}`, `style axis ${axis} missing`, '5.3'))
  const types = new Set(tov.evidence_language.map((e) => e.type))
  for (const type of EVIDENCE_TYPES) if (!types.has(type)) findings.push(finding('missing_must_field', `KLI-TOV.evidence_language.${type}`, `evidence language for ${type} missing`, '5.3'))
  const [minChecks, maxChecks] = limits.content.copyChecks
  if (tov.copy_checks.length < minChecks || tov.copy_checks.length > maxChecks) findings.push(finding('limit_exceeded', 'KLI-TOV.copy_checks', `${tov.copy_checks.length} copy checks; ${minChecks}–${maxChecks} expected`, '5.3'))
  for (const [index, pair] of tov.before_after.entries()) {
    if (pair.status === 'grounded' && !pair.fact_ids.length) findings.push(finding('unsourced_claim', `KLI-TOV.before_after[${index}]`, 'a pair marked grounded cites no fact', '5.3'))
  }
  if (tov.before_after.length < limits.content.beforeAfterPairs) findings.push(finding('limit_exceeded', 'KLI-TOV.before_after', `${tov.before_after.length} pairs; ${limits.content.beforeAfterPairs} expected`, '5.3', 'major'))

  if (args.strategyClientViewMd) {
    const words = countClientWords(args.strategyClientViewMd)
    if (words > limits.clientText.strategyWordsMax) findings.push(finding('limit_exceeded', 'KLI-STRATEGIA.client_view', `client view has ${words} words, limit ${limits.clientText.strategyWordsMax}`, '5.2', 'major'))
  }
  if (args.tovClientViewMd) {
    const words = countClientWords(args.tovClientViewMd)
    if (words > limits.clientText.tovWordsMax) findings.push(finding('limit_exceeded', 'KLI-TOV.client_view', `client view has ${words} words, limit ${limits.clientText.tovWordsMax}`, '5.3', 'major'))
  }
  return findings
}

/** The resolutions a Q-S exhaustion allows: rerun the author with staff guidance, accept with an explicit limit (the pair goes to the client), or keep the block. */
export function strategyQaExhaustedResolutions(fixStep: '5.2' | '5.3'): EscalationInput['allowedResolutions'] {
  return [
    { code: 'rerun_with_guidance', requiredEvidence: 'A note naming which finding was misjudged or what the author step must do differently.', permittedNextStep: fixStep },
    { code: 'accept_with_explicit_limit', requiredEvidence: 'The finding recorded as a limitation on the document, visible to the client and the next stage.', permittedNextStep: '5.5' },
    { code: 'keep_blocked', requiredEvidence: 'The reason the order cannot proceed and who must act.', permittedNextStep: 'none' },
  ]
}

/** The verdict rule, in one place: any blocking agent finding is a fix, else the pair is ready for the client. */
export function mergeStrategyQaVerdict(findings: QaFinding[]): StrategyQaVerdict {
  return findings.some((f) => f.severity === 'blocking' && f.owner === 'agent') ? 'needs_agent_fix' : 'ready_for_approval'
}

/**
 * Rafał's v1.1 lesson "audience decision ≠ buyer-criteria knowledge": a field the
 * strategy honestly marks `unknown` (buyer criteria, interviews, benchmarks) is
 * not a writer's omission — the writer cannot invent it. Such findings become the
 * client's questions; a finding on KLI-BRIEF is about an input the strategy must
 * respect, so it stays with the strategy writer.
 */
export function reclassifyStrategyFindings(findings: QaFinding[]): QaFinding[] {
  return findings.map((f) => {
    if (f.owner !== 'agent' && f.owner !== 'research') return f
    if (NON_PUBLIC_EVIDENCE.test(f.gap) || /decision_criterion|empirical_buyer_evidence/.test(f.path)) {
      return { ...f, owner: 'client', fix_step: null, fix_hint: 'needs evidence public sources cannot provide (buyer criteria, interviews, benchmarks); a question for the client, not a rewrite' }
    }
    return f
  })
}

/** The author step of a finding: from `fix_step`, else from the document its path names. */
export function fixStepOf(f: QaFinding): '5.2' | '5.3' | null {
  if (f.fix_step === '5.2' || f.fix_step === '5.3') return f.fix_step
  if (/^KLI-STRATEGIA/.test(f.path)) return '5.2'
  if (/^KLI-TOV/.test(f.path)) return '5.3'
  return null
}

export type StrategyQaOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  strategy: StrategiaData
  tov: TovData
  brief: BriefData
  zrodla: ZrodlaData
  audyt: AudytData
  konkurencja: KonkurencjaData | null
  strategyClientViewMd?: string | null
  tovClientViewMd?: string | null
  validatorFindings?: QaFinding[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
}

export const strategyQaCriteria = [
  'The strategy makes one choice and names what it gives up; a list of services is not a strategy.',
  'The UVP explains value and mechanism against a concrete alternative; exclusivity is never claimed without a demonstrated, externally confirmed proof.',
  'Every claim in the proof architecture carries a status no higher than its proofs allow; an offer proof is not a result proof.',
  'Three to four pillars differ in task and each can be developed from the seeds and claims it cites.',
  'Nothing contradicts the brief: the promise stays within promise_constraints, the audience and offer follow the brief decisions, prohibited claims stay prohibited.',
  'Hooks, single-post arguments, CTA wording and posting schedules are tactical detail and do not belong in the strategy.',
  'The ToV rules are executable: each principle has a concrete author behaviour, replacements keep the meaning, examples add no facts, before/after pairs sit on the same facts.',
  'The ToV is consistent with the strategy (claim strength, evidence language, prohibited promises) and with the brief voice preferences; a new voice is a recommendation, not a diagnosis.',
  'No new research after the freeze: every cited id exists in the pinned inputs.',
]

export async function runStrategyQa(opts: StrategyQaOptions): Promise<StrategyQaResult & { stats: { agentCalls: number; cachedSteps: number } }> {
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
  const validator = opts.validatorFindings ?? strategyValidatorFindings(opts)
  const { value } = await step<StrategyQaAgentData>({
    step: '5.4',
    agentId: RESEARCH_STRATEGY_QA_AGENT_ID,
    label: 'strategy_qa',
    input: {
      order: { brand: opts.order.brand, market: opts.order.market, language: opts.order.language, websiteUrl: opts.order.websiteUrl, purchaseGoal: opts.order.purchaseGoal, sku: opts.order.sku },
      outputLanguage: opts.outputLanguage,
      strategy: opts.strategy,
      tov: opts.tov,
      brief: briefInputOf(opts.brief),
      proof_cards: evidenceInputOf(opts.zrodla).proof_cards,
      validator_findings: validator,
      criteria: strategyQaCriteria,
    },
    parse: (raw) => strategyQaAgentResult.parse(raw).data,
    // The agent's findings must point into the pair or the brief; a stray path is dropped, a missing fix_step is derived from the path.
    gate: (data) => {
      const kept = data.findings
        .filter((f) => /^(KLI-STRATEGIA|KLI-TOV|KLI-BRIEF)/.test(f.path))
        .slice(0, 20)
        .map((f) => ({ ...f, fix_step: f.owner === 'agent' ? fixStepOf(f) : f.fix_step }))
      return { value: { ...data, findings: kept }, issues: [], kept: kept.length, dropped: data.findings.length - kept.length }
    },
  })
  const findings = [...validator, ...reclassifyStrategyFindings(value.findings)]
  return { verdict: mergeStrategyQaVerdict(findings), findings, summary: value.summary, stats: { agentCalls: stats.agentCalls, cachedSteps: stats.cachedSteps } }
}

export type StrategyQaLoopResult = {
  verdict: StrategyQaVerdict
  findings: QaFinding[]
  taskRunId: string
  repairs: number
  strategyVersionId: string | null
  tovVersionId: string | null
  escalationVersionId?: string
}

type PinnedPair = {
  strategy: InputVersion & { versionId: string; data: unknown }
  tov: InputVersion & { versionId: string; data: unknown }
  brief: InputVersion & { versionId: string; data: unknown }
  zrodla: InputVersion & { versionId: string; data: unknown }
  audyt: InputVersion & { versionId: string; data: unknown }
  konkurencja: (InputVersion & { versionId: string; data: unknown }) | null
}

async function loadPair(ctx: StepContext): Promise<PinnedPair> {
  const strategy = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-STRATEGIA')
  const tov = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-TOV')
  const brief = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-BRIEF')
  const zrodla = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
  const audyt = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-AUDYT')
  const konkurencja = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-KONKURENCJA')
  if (!strategy || !tov || !brief || !zrodla || !audyt) throw new Error('[internal] 5.4 needs current KLI-STRATEGIA, KLI-TOV, KLI-BRIEF, WEW-ZRODLA and WEW-AUDYT versions')
  return { strategy, tov, brief, zrodla, audyt, konkurencja }
}

async function clientViewOf(ctx: StepContext, versionId: string): Promise<string | null> {
  const rows = await ctx.em.getConnection().execute(`select client_view_md from agency_research_document_versions where id = ?`, [versionId])
  return Array.isArray(rows) && rows[0] ? ((rows[0] as { client_view_md?: string | null }).client_view_md ?? null) : null
}

/**
 * 5.4 with its return path: a blocking agent finding re-runs its author (5.2
 * and/or 5.3; a new strategy always gets a new ToV, since the ToV reads it) with
 * the findings as repair input, ≤ STD-LIMITY qa_repair_attempts, then E.1
 * `qa_exhausted`. A clean pair moves both documents to `ready_for_review`; the
 * client's acceptance (5.5–5.7) is recorded elsewhere.
 */
export async function runStrategyQaLoop(ctx: StepContext, deps: { strategyStep: (ctx: StepContext) => Promise<StepOutcome>; tovStep: (ctx: StepContext) => Promise<StepOutcome> }): Promise<StrategyQaLoopResult> {
  const maxRepairs = limits.generation.qaRepairAttemptsPerRun
  let repairs = 0
  for (;;) {
    const pair = await loadPair(ctx)
    const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })
    const inputVersions: InputVersion[] = [ctx.orderVersion, pin(pair.strategy), pin(pair.tov), pin(pair.brief), pin(pair.zrodla), pin(pair.audyt), ...(pair.konkurencja ? [pin(pair.konkurencja)] : [])]
    const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '5.4', attempt: repairs + 1, runner: ctx.runner, models: ctx.models, inputVersions })
    ctx.taskRunIds.push(run.id)
    let result: StrategyQaResult
    try {
      result = await runStrategyQa({
        order: ctx.order,
        outputLanguage: ctx.order.outputLanguage,
        strategy: strategiaDataSchema.parse(pair.strategy.data),
        tov: tovDataSchema.parse(pair.tov.data),
        brief: briefDataSchema.parse(pair.brief.data),
        zrodla: zrodlaDataSchema.parse(pair.zrodla.data),
        audyt: audytDataSchema.parse(pair.audyt.data),
        konkurencja: pair.konkurencja ? konkurencjaDataSchema.parse(pair.konkurencja.data) : null,
        strategyClientViewMd: await clientViewOf(ctx, pair.strategy.versionId),
        tovClientViewMd: await clientViewOf(ctx, pair.tov.versionId),
        runAgent: ctx.runAgent,
        ledger: ctx.ledger,
        models: ctx.models,
        cache: ctx.cache,
        onEvent: ctx.onEvent,
      })
    } catch (error) {
      await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
      throw error
    }
    ctx.log(`5.4 attempt ${repairs + 1}: ${result.verdict} (${result.findings.length} findings)`)
    const blocking = result.findings.filter((f) => f.severity === 'blocking' && f.owner === 'agent')
    const fixSteps = [...new Set(blocking.map(fixStepOf).filter((s): s is '5.2' | '5.3' => s !== null))]

    if (result.verdict === 'needs_agent_fix' && repairs < maxRepairs && fixSteps.length) {
      await finishTaskRun(ctx.em, run, { status: 'to_fix', qaResult: { verdict: result.verdict, findings: result.findings, summary: result.summary, repairs }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
      repairs += 1
      if (fixSteps.includes('5.2')) {
        ctx.log(`5.4 → repair 5.2 (attempt ${repairs} of ${maxRepairs})`)
        await deps.strategyStep({ ...ctx, repairFindings: blocking.filter((f) => fixStepOf(f) === '5.2'), attempt: ctx.attempt + repairs })
      }
      ctx.log(`5.4 → repair 5.3 (attempt ${repairs} of ${maxRepairs})`)
      await deps.tovStep({ ...ctx, repairFindings: blocking.filter((f) => fixStepOf(f) === '5.3'), attempt: ctx.attempt + repairs })
      continue
    }

    const ready = result.verdict === 'ready_for_approval'
    for (const templateId of ['WZR-STRATEGIA', 'WZR-TOV'] as const) {
      const document = await ctx.em.findOne(AgencyResearchDocument, { ...ctx.scope, orderRef: ctx.orderRef, templateId, deletedAt: null })
      if (document) {
        document.status = ready ? 'ready_for_review' : 'draft'
        await ctx.em.flush()
      }
    }
    await finishTaskRun(ctx.em, run, {
      status: ready ? 'done' : 'to_fix',
      outputVersionId: pair.strategy.versionId,
      qaResult: { verdict: result.verdict, findings: result.findings, summary: result.summary, repairs },
      agentRunIds: ctx.agentRunIds,
      cost: ctx.ledger.snapshot(),
    })
    if (ready) return { verdict: result.verdict, findings: result.findings, taskRunId: run.id, repairs, strategyVersionId: pair.strategy.versionId, tovVersionId: pair.tov.versionId }

    const primaryStep = fixSteps[0] ?? '5.2'
    const escalation = await openEscalation(
      ctx,
      {
        code: 'qa_exhausted',
        summary: `Q-S still fails after ${repairs} repair attempt(s) (STD-LIMITY qa_repair_attempts_per_run = ${maxRepairs}): ${result.summary}`,
        triggerStep: '5.4',
        evidence: [
          { ref: run.id, fact: `5.4 task run, verdict ${result.verdict}, ${blocking.length} blocking findings` },
          ...blocking.slice(0, 10).map((f) => ({ ref: f.path, fact: `${f.code}: ${f.gap}` })),
        ],
        blockedSteps: ['5.5', '6.2', '6.3', '6.5', '6.7', '7.2'],
        decisionQuestion: `Which blocking finding should be accepted as an explicit limit, and which author step (${fixSteps.join(', ') || primaryStep}) should be rerun with guidance?`,
        allowedResolutions: strategyQaExhaustedResolutions(primaryStep),
        resumeStep: '5.4',
      },
      inputVersions,
    )
    return { verdict: result.verdict, findings: result.findings, taskRunId: run.id, repairs, strategyVersionId: pair.strategy.versionId, tovVersionId: pair.tov.versionId, escalationVersionId: escalation.versionId }
  }
}
