import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { orderDataSchema, orderFactsOf, type OrderData } from '../data/schemas/zamowienie'
import type { InputVersion } from '../data/schemas/envelope'
import { limits } from '../data/templates'
import { AGENCY_RESEARCH_SERVICE, researchRunRequestSchema, type AgencyResearchService, type ResearchExecutionContext, type ResearchRunRequest, type ResearchRunResult } from './contracts'
import { collectSources, type CollectOptions, type FetchPage } from './research/fetch'
import { createFirecrawlFetcher } from './research/firecrawl'
import { BudgetPausedError, createLedger, type LedgerEvent } from './research/ledger'
import { runSourcesStep } from './research/steps/sources'
import type { ModelSet, PipelineCache, PipelineEvent, ResearchAgentRunner } from './research/pipeline'
import { renderZrodla } from './research/render/zrodla'
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
  socialPosts?: CollectOptions['socialPosts']
  pages?: string[]
  through: '3.2'
  maxCostPln?: number
  cache?: PipelineCache
  concurrency?: number
  onEvent?: (event: PipelineEvent | LedgerEvent) => void
  log?: (message: string) => void
  agentRunIds?: string[]
}

export type RunResearchOutcome = ResearchRunResult & { zrodlaVersionId: string | null }

/** The models the pipeline assumes for estimates; the orchestrator resolves the real one per agent. */
export function defaultModels(env: NodeJS.ProcessEnv = process.env): ModelSet {
  const extract = env.OM_AGENCY_RESEARCH_MODEL_EXTRACT ?? 'anthropic/claude-haiku-4.5'
  return {
    extract: extract.replace(/^openrouter\//, ''),
    synthesis: (env.OM_AGENCY_RESEARCH_MODEL_SYNTHESIS ?? 'anthropic/claude-sonnet-5').replace(/^openrouter\//, ''),
    qa: (env.OM_AGENCY_RESEARCH_MODEL_QA ?? extract).replace(/^openrouter\//, ''),
  }
}

/**
 * Shared CLI/server composition of the process: 3.1 pins the order as a document
 * version, 3.2 fetches, stores sources, runs the pipeline and stores WEW-ZRODLA.
 * Every step is a task run that starts as `running` and ends as done / failed /
 * paused_budget with its ledger. Agents remain read-only throughout.
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
  const pinnedOrder: InputVersion = { document_id: orderVersion.envelope.document_id, version: orderVersion.envelope.version, status: orderVersion.envelope.status }

  // 3.2 — sources.
  const previous = await currentInputVersion(em, scope, orderRef, 'WZR-ZRODLA')
  const run = await startTaskRun(em, scope, {
    orderRef,
    brand: facts.brand,
    stepId: '3.2',
    attempt: 1,
    runner: opts.runner,
    models: opts.models,
    inputVersions: previous ? [pinnedOrder, { document_id: previous.document_id, version: previous.version, status: previous.status }] : [pinnedOrder],
  })
  taskRunIds.push(run.id)
  let zrodlaVersionId: string | null = null
  try {
    const collected = await collectSources(facts, { fetchPage: opts.fetchPage, socialPosts: opts.socialPosts, pages: opts.pages, log })
    await saveSources(em, scope, orderRef, run.id, collected)
    const result = await runSourcesStep({
      order: facts,
      sources: collected,
      runAgent: opts.runAgent,
      ledger,
      models: opts.models,
      cache: opts.cache,
      concurrency: opts.concurrency,
      onEvent,
    })
    // The register is reviewed in 3.7; its blockers travel as issues, not as a status.
    const saved = await saveDocumentVersion(em, scope, {
      orderRef,
      brand: facts.brand,
      templateId: 'WZR-ZRODLA',
      status: 'ready_for_review',
      inputVersions: [pinnedOrder],
      data: result.data as unknown as Record<string, unknown>,
      issues: result.issues,
      renderedMd: renderZrodla({ brand: facts.brand, data: result.data, businessProfile: result.businessProfile, issues: result.issues, versionLabel: previous ? String(Number(previous.version.split('.')[0]) + 1) : '1' }),
      taskRunId: run.id,
    })
    zrodlaVersionId = saved.version.id
    documentVersionIds.push(saved.version.id)
    await finishTaskRun(em, run, { status: 'done', outputVersionId: saved.version.id, summary: { businessProfile: result.businessProfile, stats: result.stats }, agentRunIds, cost: ledger.snapshot() })
    return { taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total, completedThrough: '3.2', zrodlaVersionId }
  } catch (error) {
    const paused = error instanceof BudgetPausedError
    await finishTaskRun(em, run, { status: paused ? 'paused_budget' : 'failed', agentRunIds, cost: ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    if (paused) return { taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total, completedThrough: null, zrodlaVersionId: null }
    throw error
  }
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
        socialPosts: parsed.socialPosts,
        pages: parsed.pages,
        through: parsed.through,
        maxCostPln: parsed.maxCostPln,
        agentRunIds,
      })
      return { taskRunIds: outcome.taskRunIds, documentVersionIds: outcome.documentVersionIds, agentRunIds: outcome.agentRunIds, spentPln: outcome.spentPln, completedThrough: outcome.completedThrough }
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
