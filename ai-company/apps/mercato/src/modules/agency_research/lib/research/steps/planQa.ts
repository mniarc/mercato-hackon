import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { InputVersion } from '../../../data/schemas/envelope'
import type { QaFinding } from '../../../data/schemas/qa'
import { reclassifyProductionFindings } from './qa'
import { planDataSchema, type PlanData } from '../../../data/schemas/plan'
import { strategiaDataSchema, type StrategiaData } from '../../../data/schemas/strategia'
import { zrodlaDataSchema, type ZrodlaData } from '../../../data/schemas/zrodla'
import { planQaAgentResult, type PlanQaAgentData, type PlanQaVerdict } from '../../../data/agents/plan'
import { limits } from '../../../data/templates'
import { AgencyResearchDocument } from '../../../data/entities'
import { RESEARCH_PLAN_QA_AGENT_ID } from '../../agents/ids.plan'
import { currentInputVersion, finishTaskRun, startTaskRun } from '../../store'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import type { StepContext, StepOutcome } from './context'
import { planValidatorFindings } from './plan'

/**
 * Step 6.3 — plan control (gate Q-P). Code computes the arithmetic first (count,
 * days, ids, paraphrases, pillar balance, numeric promises, recommendation
 * readiness); the QA agent adds what needs reading (audience fit, concreteness,
 * substance of distinctness); the verdict is exactly `ready_for_approval` or
 * `needs_agent_fix`. An agent fault returns to 6.2 (≤ 2 repairs); a bank gap is
 * a named finding owned by research, never a random topic swap. Only a plan
 * whose configured topics are all `ready` moves to `ready_for_review`.
 */

export type PlanQaResult = { verdict: PlanQaVerdict; findings: QaFinding[]; summary: string }

/** The verdict rules, in one place: any blocking agent finding sends the plan back. */
export function mergePlanQaVerdict(findings: QaFinding[]): PlanQaVerdict {
  return findings.some((f) => f.severity === 'blocking' && f.owner === 'agent') ? 'needs_agent_fix' : 'ready_for_approval'
}

/** Q-P's approval condition: exactly the catalog count, every topic ready, one recommendation on a ready topic. */
export function planReadyForApproval(plan: PlanData, topicCount: number): boolean {
  return plan.topics.length === topicCount && plan.topics.every((topic) => topic.readiness === 'ready') && plan.topics.some((topic) => topic.topic_id === plan.recommendation.topic_id && topic.readiness === 'ready')
}

export type PlanQaOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  plan: PlanData
  strategia: StrategiaData
  zrodla: ZrodlaData
  validatorFindings?: QaFinding[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
}

export const planQaCriteria = [
  'Every topic serves one strategy pillar and the priority audience named in the brief.',
  'The configured number of audience questions differ in substance, not only in wording; one idea said twice is a duplicate.',
  'Each angle is concrete enough to write from: a named tool with steps or an example, a main message, a goal.',
  'No topic promises a number, an effect, ROI or uniqueness the cited evidence does not carry.',
  'The recommended topic has complete evidence in the bank; the post can be written without new research.',
  'The plan reads as a schedule of topics for one channel, never as a delivery of one post per topic.',
  'A gap in the evidence bank is named as a finding owned by research; it is not filled by invention.',
]

export async function runPlanQa(opts: PlanQaOptions): Promise<PlanQaResult & { stats: { agentCalls: number; cachedSteps: number } }> {
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
  const validator = opts.validatorFindings ?? planValidatorFindings({ plan: opts.plan, strategia: opts.strategia, zrodla: opts.zrodla, topicCount: opts.order.topics })
  const { value } = await step<PlanQaAgentData>({
    step: '6.3',
    agentId: RESEARCH_PLAN_QA_AGENT_ID,
    label: 'plan_qa',
    input: {
      order: { brand: opts.order.brand, market: opts.order.market, language: opts.order.language, websiteUrl: opts.order.websiteUrl, purchaseGoal: opts.order.purchaseGoal, sku: opts.order.sku },
      outputLanguage: opts.outputLanguage,
      plan: opts.plan,
      pillars: opts.strategia.pillars.map((p) => ({ pillar_id: p.pillar_id, area: p.area, audience_question: p.audience_question })),
      seeds: opts.zrodla.content_bank.map((s) => ({ seed_id: s.seed_id, audience_question: s.audience_question, source_claim: s.source_claim.text, readiness: s.readiness })),
      audience: opts.plan.plan_context.audience,
      topic_count: opts.order.topics,
      validator_findings: validator,
      criteria: planQaCriteria,
    },
    parse: (raw) => planQaAgentResult.parse(raw).data,
    // The agent's findings must point somewhere in the plan or its inputs; a stray path is dropped.
    gate: (data) => {
      const kept = data.findings.filter((f) => /^(KLI-PLAN|KLI-STRATEGIA|WEW-ZRODLA|KLI-BRIEF)/.test(f.path)).slice(0, 20)
      return { value: { ...data, findings: kept }, issues: [], kept: kept.length, dropped: data.findings.length - kept.length }
    },
  })
  const findings = [...validator, ...reclassifyProductionFindings(value.findings)]
  return { verdict: mergePlanQaVerdict(findings), findings, summary: value.summary, stats: { agentCalls: stats.agentCalls, cachedSteps: stats.cachedSteps } }
}

export type PlanQaLoopResult = { verdict: PlanQaVerdict; findings: QaFinding[]; taskRunId: string; repairs: number; planVersionId: string | null; readyForApproval: boolean }

/**
 * 6.3 with its return path: an agent fault re-runs 6.2 with the findings as
 * repair input (≤ STD-LIMITY qa_repair_attempts), then stops as `to_fix`; a
 * clean plan whose configured topics are ready moves to `ready_for_review` — the
 * approval and the topic choice belong to the client (6.4–6.6).
 */
export async function runPlanQaLoop(ctx: StepContext, deps: { planStep: (ctx: StepContext) => Promise<StepOutcome> }): Promise<PlanQaLoopResult> {
  if (ctx.planningInputs && !ctx.planningOutputs) throw new Error('[internal] Pinned planning execution requires its own plan output')
  const load = async () => {
    const plan = ctx.planningInputs ? ctx.planningOutputs!.plan : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-PLAN')
    const strategia = ctx.planningInputs ? ctx.planningInputs.strategy : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-STRATEGIA')
    const zrodla = ctx.planningInputs ? ctx.planningInputs.zrodla : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
    if (!plan || !strategia || !zrodla) throw new Error('[internal] 6.3 needs current KLI-PLAN, KLI-STRATEGIA and WEW-ZRODLA versions')
    return { plan, strategia, zrodla }
  }
  let current = await load()
  const pin = ({ document_id, version, status }: InputVersion): InputVersion => ({ document_id, version, status })
  const inputVersions = (): InputVersion[] => [
    ctx.orderVersion, pin(current.plan), pin(current.strategia), pin(current.zrodla),
    ...(ctx.planningInputs ? [pin(ctx.planningInputs.brief), pin(ctx.planningInputs.tov), pin(ctx.planningInputs.konkurencja)] : []),
  ]
  const maxRepairs = ctx.planningQaRepairAttempts ?? limits.generation.qaRepairAttemptsPerRun
  const run = await startTaskRun(ctx.em, ctx.scope, {
    orderRef: ctx.orderRef,
    brand: ctx.order.brand,
    stepId: '6.3',
    attempt: ctx.attempt,
    runner: ctx.runner,
    models: ctx.models,
    inputVersions: inputVersions(),
  })
  ctx.taskRunIds.push(run.id)
  let repairs = 0
  try {
    for (;;) {
      const plan = planDataSchema.parse(current.plan.data)
      const result = await runPlanQa({
        order: ctx.order,
        outputLanguage: ctx.order.outputLanguage,
        plan,
        strategia: strategiaDataSchema.parse(current.strategia.data),
        zrodla: zrodlaDataSchema.parse(current.zrodla.data),
        runAgent: ctx.runAgent,
        ledger: ctx.ledger,
        models: ctx.models,
        cache: ctx.cache,
        onEvent: ctx.onEvent,
      })
      const agentFindings = result.findings.filter((f) => f.owner === 'agent' && f.severity === 'blocking')
      if (result.verdict === 'needs_agent_fix' && repairs < maxRepairs) {
        repairs += 1
        ctx.log(`6.3: ${agentFindings.length} agent findings — repair ${repairs}/${maxRepairs}`)
        await deps.planStep({ ...ctx, repairFindings: agentFindings, attempt: ctx.attempt + repairs })
        current = await load()
        run.inputVersions = inputVersions()
        await ctx.em.flush()
        continue
      }
      const readyForApproval = result.verdict === 'ready_for_approval' && planReadyForApproval(plan, ctx.order.topics)
      const document = await ctx.em.findOne(AgencyResearchDocument, {
        ...ctx.scope, orderRef: ctx.orderRef, templateId: 'WZR-PLAN', deletedAt: null,
        ...(ctx.planningInputs ? { currentVersionId: current.plan.versionId } : {}),
      })
      if (document) {
        document.status = readyForApproval ? 'ready_for_review' : 'draft'
        await ctx.em.flush()
      }
      await finishTaskRun(ctx.em, run, {
        status: result.verdict === 'needs_agent_fix' ? 'to_fix' : 'done',
        outputVersionId: current.plan.versionId,
        qaResult: { verdict: result.verdict, findings: result.findings, summary: result.summary, repairs, readyForApproval },
        agentRunIds: ctx.agentRunIds,
        cost: ctx.ledger.snapshot(),
      })
      return { verdict: result.verdict, findings: result.findings, taskRunId: run.id, repairs, planVersionId: current.plan.versionId, readyForApproval }
    }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
