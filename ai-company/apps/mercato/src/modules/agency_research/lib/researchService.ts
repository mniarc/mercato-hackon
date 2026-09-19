import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { orderDataSchema, orderFactsOf, type OrderData } from '../data/schemas/zamowienie'
import { limits } from '../data/templates'
import { AGENCY_RESEARCH_SERVICE, researchRunRequestSchema, researchSteps, type AgencyResearchService, type ResearchExecutionContext, type ResearchRunRequest, type ResearchRunResult, type ResearchStep } from './contracts'
import { collectSources, type FetchPage, type SocialPost } from './research/fetch'
import { createFirecrawlFetcher, createFirecrawlSearch, type SearchWeb } from './research/firecrawl'
import { BudgetPausedError, createLedger, type LedgerEvent } from './research/ledger'
import type { ModelSet, PipelineCache, PipelineEvent, ResearchAgentRunner } from './research/pipeline'
import { renderZrodla } from './research/render/zrodla'
import { budgetExhaustedResolutions, openEscalation } from './research/escalate'
import { runAuditStep } from './research/steps/audit'
import { runCompetitorsStep } from './research/steps/competitors'
import type { StepContext, StepOutcome } from './research/steps/context'
import { runFindingsStep } from './research/steps/findings'
import { runFreezeStep } from './research/steps/freeze'
import { runQaLoop } from './research/steps/qa'
import { runSourcesStep } from './research/steps/sources'
import { createOrchestratorRunner } from './runners'
import { currentInputVersion, finishTaskRun, orderStatus, saveDocumentVersion, saveSources, startTaskRun, type ResearchScope } from './store'

export { AGENCY_RESEARCH_SERVICE }

export type RunResearchOptions = {
  em: EntityManager
  scope: ResearchScope
  orderRef: string
  order: OrderData
  runAgent: ResearchAgentRunner
  runner: string
  models: ModelSet
  fetchPage: FetchPage
  searchWeb?: SearchWeb
  socialPosts?: SocialPost[]
  pages?: string[]
  through: ResearchStep
  maxCostPln?: number
  cache?: PipelineCache
  concurrency?: number
  onEvent?: (event: PipelineEvent | LedgerEvent) => void
  log?: (message: string) => void
  agentRunIds?: string[]
}

export type RunResearchOutcome = ResearchRunResult & { versionsByStep: Record<string, string | null> }

/** The models the pipeline assumes for estimates; the orchestrator resolves the real one per agent. */
export function defaultModels(env: NodeJS.ProcessEnv = process.env): ModelSet {
  const extract = env.OM_AGENCY_RESEARCH_MODEL_EXTRACT ?? 'anthropic/claude-haiku-4.5'
  return {
    extract: extract.replace(/^openrouter\//, ''),
    synthesis: (env.OM_AGENCY_RESEARCH_MODEL_SYNTHESIS ?? 'anthropic/claude-sonnet-5').replace(/^openrouter\//, ''),
    qa: (env.OM_AGENCY_RESEARCH_MODEL_QA ?? extract).replace(/^openrouter\//, ''),
  }
}

const stepOrder: ResearchStep[] = [...researchSteps]
const reaches = (through: ResearchStep, step: ResearchStep) => stepOrder.indexOf(through) >= stepOrder.indexOf(step)

/** 3.2 as a step over the shared context: fetch → sources rows → pipeline → WEW-ZRODLA v1. */
export async function runSourcesStepDb(ctx: StepContext): Promise<StepOutcome> {
  const previous = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
  const run = await startTaskRun(ctx.em, ctx.scope, {
    orderRef: ctx.orderRef,
    brand: ctx.order.brand,
    stepId: '3.2',
    attempt: ctx.attempt,
    runner: ctx.runner,
    models: ctx.models,
    inputVersions: previous ? [ctx.orderVersion, { document_id: previous.document_id, version: previous.version, status: previous.status }] : [ctx.orderVersion],
  })
  ctx.taskRunIds.push(run.id)
  try {
    const collected = await collectSources(ctx.order, { fetchPage: ctx.fetchPage, socialPosts: ctx.socialPosts, pages: ctx.pages, log: ctx.log })
    await saveSources(ctx.em, ctx.scope, ctx.orderRef, run.id, collected)
    const result = await runSourcesStep({ order: ctx.order, sources: collected, runAgent: ctx.runAgent, ledger: ctx.ledger, models: ctx.models, cache: ctx.cache, concurrency: ctx.concurrency, onEvent: ctx.onEvent })
    // The register is reviewed in 3.7; its blockers travel as issues, not as a status.
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-ZRODLA',
      status: 'ready_for_review',
      inputVersions: [ctx.orderVersion],
      data: result.data as unknown as Record<string, unknown>,
      issues: result.issues,
      renderedMd: renderZrodla({ brand: ctx.order.brand, data: result.data, businessProfile: result.businessProfile, issues: result.issues, versionLabel: previous ? String(Number(previous.version.split('.')[0]) + 1) : '1' }),
      taskRunId: run.id,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { businessProfile: result.businessProfile, stats: result.stats }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    const paused = error instanceof BudgetPausedError
    await finishTaskRun(ctx.em, run, { status: paused ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

/**
 * Shared CLI/server composition of the process: 3.1 pins the order as a document
 * version, then the steps run in STD-PROCES order up to `through`, each as a task
 * run that starts `running` and ends done / failed / paused_budget with its ledger.
 * A budget pause ends the run cleanly; any other error is re-thrown after the
 * task run has recorded it. Agents remain read-only throughout.
 */
export async function runResearch(opts: RunResearchOptions): Promise<RunResearchOutcome> {
  const { em, scope, orderRef } = opts
  const order = orderDataSchema.parse(opts.order)
  const facts = orderFactsOf(order)
  const log = opts.log ?? (() => {})
  const onEvent = opts.onEvent ?? (() => {})
  const agentRunIds = opts.agentRunIds ?? []
  const taskRunIds: string[] = []
  const documentVersionIds: string[] = []
  const ledger = createLedger({ maxPln: opts.maxCostPln, onEvent })
  const versionsByStep: Record<string, string | null> = {}

  // 3.1 — activation: the order becomes the pinned WEW-DANE-ZAMOWIENIA version every later step cites.
  const activation = await startTaskRun(em, scope, { orderRef, brand: facts.brand, stepId: '3.1', attempt: 1, runner: 'system', models: {}, inputVersions: [] })
  taskRunIds.push(activation.id)
  const orderVersion = await saveDocumentVersion(em, scope, {
    orderRef,
    brand: facts.brand,
    templateId: 'WZR-ZAMOWIENIE',
    status: 'approved',
    inputVersions: [],
    data: order as unknown as Record<string, unknown>,
    issues: [],
    renderedMd: `# WEW-DANE-ZAMOWIENIA — ${facts.brand}\n\n- WWW: ${facts.websiteUrl}\n- Rynek / język: ${facts.market} / ${facts.language}\n- Profil: ${facts.officialSocialUrl ?? '—'}\n- Cel zakupu: ${facts.purchaseGoal ?? '—'}\n`,
    taskRunId: activation.id,
  })
  documentVersionIds.push(orderVersion.version.id)
  await finishTaskRun(em, activation, { status: 'done', outputVersionId: orderVersion.version.id, summary: { limits: limits.research, topics: facts.topics } })

  const ctx: StepContext = {
    em,
    scope,
    orderRef,
    order: facts,
    orderVersion: { document_id: orderVersion.envelope.document_id, version: orderVersion.envelope.version, status: orderVersion.envelope.status },
    runAgent: opts.runAgent,
    runner: opts.runner,
    models: opts.models,
    ledger,
    cache: opts.cache,
    concurrency: opts.concurrency,
    onEvent,
    log,
    agentRunIds,
    taskRunIds,
    documentVersionIds,
    fetchPage: opts.fetchPage,
    searchWeb: opts.searchWeb,
    socialPosts: opts.socialPosts,
    pages: opts.pages,
    repairFindings: [],
    attempt: 1,
  }

  let qaVerdict: 'ready' | 'to_fix' | 'exception' | undefined
  let escalationVersionId: string | undefined
  const chain: { step: ResearchStep; run: (ctx: StepContext) => Promise<StepOutcome | null> }[] = [
    { step: '3.2', run: runSourcesStepDb },
    {
      step: '3.5',
      run: async (c) => {
        await runAuditStep(c)
        return runCompetitorsStep(c)
      },
    },
    {
      // 3.6 findings map → 3.7 QA (repairs through the author steps, E.1 on exhaustion) → 3.8 freeze.
      step: '3.8',
      run: async (c) => {
        await runFindingsStep(c)
        const qa = await runQaLoop(c, { authorSteps: { '3.2': runSourcesStepDb, '3.3': runAuditStep, '3.4': runCompetitorsStep, '3.5': runCompetitorsStep, '3.6': runFindingsStep } })
        qaVerdict = qa.verdict
        escalationVersionId = qa.escalationVersionId
        if (qa.verdict !== 'ready') return null
        return runFreezeStep(c)
      },
    },
  ]
  let completedThrough: ResearchStep | null = null
  let currentStep: ResearchStep = '3.2'
  try {
    for (const { step, run } of chain) {
      if (!reaches(opts.through, step)) break
      currentStep = step
      const outcome = await run(ctx)
      if (!outcome) break
      versionsByStep[step] = outcome.versionId
      completedThrough = step
    }
  } catch (error) {
    if (!(error instanceof BudgetPausedError)) throw error
    log(`budget paused during ${currentStep}: ${ledger.snapshot().total.toFixed(2)} PLN`)
    const failedRun = taskRunIds[taskRunIds.length - 1]
    const escalation = await openEscalation(ctx, {
      code: 'budget_exhausted',
      summary: `Research paused at ${ledger.snapshot().total.toFixed(2)} PLN of a ${ledger.snapshot().cap} PLN cap during step ${currentStep}`,
      triggerStep: currentStep,
      evidence: [{ ref: failedRun, fact: `task run paused on budget; next call estimated ${error.nextEstimatePln.toFixed(2)} PLN` }],
      blockedSteps: stepOrder.filter((step) => stepOrder.indexOf(step) >= stepOrder.indexOf(currentStep)),
      decisionQuestion: `Raise the per-run cap or narrow the scope (fewer pages / competitors) and resume step ${currentStep}?`,
      allowedResolutions: budgetExhaustedResolutions(currentStep),
      resumeStep: currentStep,
    })
    escalationVersionId = escalation.versionId
  }
  return { taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total, completedThrough, versionsByStep, qaVerdict, escalationVersionId }
}

type Container = { resolve(name: string): unknown }

export function createAgencyResearchService(container: Container): AgencyResearchService {
  return {
    async run({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] research requires an explicit tenant, organization and execution user')
      const parsed = researchRunRequestSchema.parse(request)
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!(await rbac.userHasAllFeatures(context.userId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope))) {
        throw new Error('[internal] research execution is not authorized')
      }
      const apiKey = process.env.FIRECRAWL_API_KEY ?? ''
      const em = (container.resolve('em') as EntityManager).fork()
      const agentRunIds: string[] = []
      const runAgent = createOrchestratorRunner(container, { ...scope, userId: context.userId, workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId }, agentRunIds)
      const outcome = await runResearch({
        em,
        scope,
        orderRef: parsed.orderRef,
        order: parsed.order,
        runAgent,
        runner: 'orchestrator',
        models: defaultModels(),
        fetchPage: createFirecrawlFetcher({ apiKey }),
        searchWeb: apiKey ? createFirecrawlSearch({ apiKey }) : undefined,
        socialPosts: parsed.socialPosts,
        pages: parsed.pages,
        through: parsed.through,
        maxCostPln: parsed.maxCostPln,
        agentRunIds,
      })
      return { taskRunIds: outcome.taskRunIds, documentVersionIds: outcome.documentVersionIds, agentRunIds: outcome.agentRunIds, spentPln: outcome.spentPln, completedThrough: outcome.completedThrough, qaVerdict: outcome.qaVerdict, escalationVersionId: outcome.escalationVersionId }
    },
    async status(scope, orderRef) {
      const em = (container.resolve('em') as EntityManager).fork()
      const status = await orderStatus(em, scope, orderRef)
      return {
        documents: status.documents.map(({ templateId, outputId, status: s, versionNo, versionId }) => ({ templateId, outputId, status: s, versionNo, versionId })),
        taskRuns: status.taskRuns.map(({ id, stepId, attempt, status: s, costPln, outputVersionId, error }) => ({ id, stepId, attempt, status: s, costPln, outputVersionId, error })),
        totalPln: status.totalPln,
        sources: status.sources,
      }
    },
  }
}

export type { ResearchExecutionContext, ResearchRunRequest, ResearchRunResult }
