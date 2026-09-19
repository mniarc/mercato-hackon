import type { EntityManager } from '@mikro-orm/postgresql'
import { AGENCY_TOV_RESEARCH_SERVICE, type AgencyTovResearchService } from '@/modules/agency_tov/lib/researchService'
import type { ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { runMaterialRevision } from './materialRevision/run'
import { materialRevisionRequestSchema } from './materialRevision/contracts'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { orderDataSchema, orderFactsOf, type OrderData } from '../data/schemas/zamowienie'
import { limits } from '../data/templates'
import { AGENCY_RESEARCH_SERVICE, researchRunRequestSchema, researchSteps, type AgencyResearchService, type ResearchExecutionContext, type ResearchRunRequest, type ResearchRunResult, type ResearchStep } from './contracts'
import { collectSources, type CollectedSource, type FetchPage, type SocialPost } from './research/fetch'
import { canonicalUrl, sourceId, sampleId } from './research/ids'
import type { ResearchMaterialSource } from './contracts/agencyResearch'
import { createFirecrawlFetcher, createFirecrawlSearch, type SearchWeb } from './research/firecrawl'
import { configuredFixtureSources } from './research/fixtureSources'
import { BudgetPausedError, createLedger, type LedgerEvent } from './research/ledger'
import { fileCache, orderCacheDir } from './research/fileCache'
import { createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner, type StepFn } from './research/pipeline'
import { renderZrodla } from './research/render/zrodla'
import type { UstaleniaData } from '../data/schemas/ustalenia'
import type { ZrodlaData } from '../data/schemas/zrodla'
import type { DocumentIssue, TemplateId } from '../data/schemas/envelope'
import { budgetExhaustedResolutions, openEscalation } from './research/escalate'
import { firstContactQuestions } from './research/render/brief'
import { readBriefReview } from './briefReview/read'
import { acceptBrief } from './briefAcceptance/accept'
import { readBriefAcceptance } from './briefAcceptance/read'
import { acceptStrategyPair } from './strategyPairAcceptance/accept'
import { readStrategyPairAcceptance } from './strategyPairAcceptance/read'
import { readPlanningReadiness } from './planningReadiness/read'
import { acceptPlan } from './planAcceptance/accept'
import { readPlanReview, readPlanAcceptance } from './planAcceptance/read'
import { acceptPlanInputSchema } from './planAcceptance/contracts'
import { runPostInstructionExecution } from './postInstructionExecution/run'
import { postInstructionExecutionRequestSchema } from './postInstructionExecution/contracts'
import { readResearchException } from './exceptionReview/read'
import { readPostReview } from './postReview/read'
import { resolveStrategyReadiness } from './strategyReadiness'
import { readStrategyReview } from './strategyReview/read'
import { runStrategyExecution, strategyExecutionRequestSchema } from './strategyExecution'
import { runBriefRevision, briefRevisionRequestSchema } from './briefRevision'
import { runPlanningExecution, planningExecutionRequestSchema } from './planningExecution'
import { runPostExecution, postExecutionRequestSchema } from './postExecution'
import { runPostRevision, postRevisionRequestSchema } from './postRevision'
import { runPostEvidence, runPostEvidenceRequestSchema } from './postEvidence'
import { acceptPost } from './postAcceptance/accept'
import { readPostAcceptance } from './postAcceptance/read'
import { acceptPostInputSchema } from './postAcceptance/contracts'
import { preparePublication } from './publicationPreparation'
import { preparePublicationInputSchema } from './publicationPreparation/contracts'
import { readPublicationConsent } from './publicationConsent/read'
import { recordPublicationConsent } from './publicationConsent/record'
import { recordPublicationConsentInputSchema } from './publicationConsent/contracts'
import { configurePublicationDestination } from './publicationDestination/configure'
import { configurePublicationDestinationInputSchema } from './publicationDestination/contracts'
import { runAuditStep } from './research/steps/audit'
import { runBriefStep } from './research/steps/brief'
import { runBriefQaLoop } from './research/steps/briefQa'
import { runComparisonStep, runCompetitorsStep } from './research/steps/competitors'
import type { StepContext, StepOutcome } from './research/steps/context'
import { discoverPeople, type KnownPerson, type ScrapeProfilePosts } from './research/steps/people'
import { runFindingsStep } from './research/steps/findings'
import { runFreezeStep } from './research/steps/freeze'
import { runQaLoop } from './research/steps/qa'
import { runSourcesStep } from './research/steps/sources'
import { runPlanStep } from './research/steps/plan'
import { runPlanQaLoop } from './research/steps/planQa'
import { runSelectionStep } from './research/steps/selection'
import { runPostInstructionStep } from './research/steps/postInstruction'
import { runPostStep } from './research/steps/post'
import { runPostQaLoop } from './research/steps/postQa'
import { runPublicationConfigStep } from './research/steps/publicationConfig'
import { runPublicationOrderStep } from './research/steps/publicationOrder'
import { runPublicationConfirmationStep } from './research/steps/publicationConfirmation'
import { runPackageStep } from './research/steps/package'
import { runClosureStep } from './research/steps/closure'
import { createOrchestratorRunner } from './runners'
import { AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../data/entities'
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
  materialSources?: ResearchMaterialSource[]
  /** 3.2a — people the client named on the order (name, role, known profile URLs). */
  knownPeople?: KnownPerson[]
  /** 3.2a — profile-post scraper; the service wires the ToV lane's Apify seam when APIFY_TOKEN is set. */
  scrapeProfilePosts?: ScrapeProfilePosts
  through: ResearchStep
  /** 6.5 — the client's plan selection; null = simulated selection of the recommendation. */
  selectedTopicId?: string | null
  /** Search for competitors again instead of reusing the stored selection. */
  freshSelection?: boolean
  /** Skip the chain groups before the one that holds this step (their stored versions are the inputs). */
  resumeFrom?: ResearchStep | null
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
  const moduleModel = env.OM_AI_AGENCY_RESEARCH_MODEL?.trim() || env.AGENCY_RESEARCH_AI_MODEL?.trim() || undefined
  const sharedModel = env.OM_AI_MODEL?.trim() || undefined
  const extract = moduleModel ?? env.OM_AGENCY_RESEARCH_MODEL_EXTRACT ?? sharedModel ?? 'anthropic/claude-haiku-4.5'
  return {
    extract: extract.replace(/^openrouter\//, ''),
    synthesis: (moduleModel ?? env.OM_AGENCY_RESEARCH_MODEL_SYNTHESIS ?? sharedModel ?? 'anthropic/claude-sonnet-5').replace(/^openrouter\//, ''),
    qa: (moduleModel ?? env.OM_AGENCY_RESEARCH_MODEL_QA ?? extract).replace(/^openrouter\//, ''),
  }
}

const stepOrder: ResearchStep[] = [...researchSteps]
const reaches = (through: ResearchStep, step: ResearchStep) => stepOrder.indexOf(through) >= stepOrder.indexOf(step)
/** The document a chain group leaves as its output; read back when a resumed run skips the group. */
const groupOutput: Record<ResearchStep, TemplateId> = {
  '3.2': 'WZR-ZRODLA', '3.5': 'WZR-KONKURENCJA', '3.8': 'WZR-USTALENIA', '4.2': 'WZR-BRIEF', '5.4': 'WZR-STRATEGIA',
  '6.7': 'WZR-ZLECENIE-POSTU', '7.3': 'WZR-POST', '8.7': 'WZR-POTWIERDZENIE-PUBLIKACJI', '9.3': 'WZR-PAKIET',
}

/** Only the resumed groups (including their bounded author repairs), never another phase's workers. */
export function resumedResearchTaskSteps(from: ResearchStep, through: ResearchStep): string[] {
  const groups: Record<ResearchStep, string[]> = {
    '3.2': ['3.1', '3.2'], '3.5': ['3.3', '3.4', '3.5'],
    '3.8': ['3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8'],
    '4.2': ['4.1', '4.2'], '5.4': ['5.1', '5.2', '5.3', '5.4'],
    '6.7': ['6.1', '6.2', '6.3', '6.5', '6.7'], '7.3': ['7.1', '7.2', '7.3'],
    '8.7': ['8.2', '8.3', '8.7'], '9.3': ['9.1', '9.3'],
  }
  return [...new Set(stepOrder.filter((step) => reaches(step, from) && reaches(through, step)).flatMap((step) => groups[step]))]
}

/**
 * The competitor half of a stored register — what 3.4 appended: facts of a
 * non-client entity, the sources only they cite, and the language samples of
 * those sources — merged behind a freshly built client half. Collection keeps
 * source identities stable; colliding new client sample IDs are remapped while
 * the competitor references used by existing comparisons remain unchanged.
 */
export function carryCompetitorEntries(fresh: ZrodlaData, previous: ZrodlaData): ZrodlaData {
  const clientEntity = fresh.facts[0]?.entity ?? null
  const competitorFacts = previous.facts.filter((fact) => fact.fact_id.startsWith('C') && fact.entity !== clientEntity && !fresh.facts.some((row) => row.fact_id === fact.fact_id))
  if (!competitorFacts.length) return fresh
  const competitorSourceIds = new Set(competitorFacts.flatMap((fact) => [...fact.source_ids, fact.locator.source_id]))
  for (const source of previous.sources.filter((source) => competitorSourceIds.has(source.source_id))) {
    const collision = fresh.sources.find((row) => row.source_id === source.source_id)
    if (collision && (canonicalUrl(collision.url_or_file) !== canonicalUrl(source.url_or_file)
      || collision.source_visibility !== source.source_visibility || collision.origin !== source.origin)) {
      throw new Error(`[internal] Source identity collision while retaining competitor evidence: ${source.source_id}`)
    }
  }
  const freshSourceIds = new Set(fresh.sources.map((source) => source.source_id))
  const sources = previous.sources.filter((source) => competitorSourceIds.has(source.source_id) && !freshSourceIds.has(source.source_id))
  const samples = previous.language_samples.filter((sample) => competitorSourceIds.has(sample.source_id))
  const sampleRenames = new Map<string, string>()
  let nextSample = Math.max(0, ...[...previous.language_samples, ...fresh.language_samples].map((row) => Number(/^L(\d+)$/.exec(row.sample_id)?.[1] ?? 0)))
  const clientSamples = fresh.language_samples.map((sample) => {
    const collision = samples.find((row) => row.sample_id === sample.sample_id)
    if (!collision || (collision.source_id === sample.source_id && collision.excerpt_or_paraphrase === sample.excerpt_or_paraphrase)) return sample
    const id = sampleId(nextSample++)
    sampleRenames.set(sample.sample_id, id)
    return { ...sample, sample_id: id }
  })
  const freshSampleIds = new Set(clientSamples.map((sample) => sample.sample_id))
  return {
    ...fresh,
    sources: [...fresh.sources, ...sources],
    facts: [...fresh.facts, ...competitorFacts],
    language_samples: [...clientSamples, ...samples.filter((sample) => !freshSampleIds.has(sample.sample_id))],
    coverage: fresh.coverage.map((row) => row.item_type === 'requirement_coverage'
      ? { ...row, evidence_ids: row.evidence_ids.map((id) => sampleRenames.get(id) ?? id) } : row),
  }
}

/** A repaired collection retains existing source identities before extraction and native source persistence. */
export function retainCollectedSourceIds(collected: CollectedSource[], previous: ZrodlaData): CollectedSource[] {
  const used = new Set<string>()
  let nextSource = Math.max(0, ...previous.sources.map((row) => Number(/^S-(\d+)$/.exec(row.source_id)?.[1] ?? 0)))
  return collected.map((source) => {
    const stored = previous.sources.find((row) => !used.has(row.source_id)
      && canonicalUrl(row.url_or_file) === canonicalUrl(source.url) && row.origin === source.origin
      && row.publisher === source.publisher && row.source_visibility === (source.source_visibility ?? 'public'))
    const id = stored?.source_id ?? sourceId(nextSource++)
    used.add(id)
    return { ...source, source_id: id }
  })
}

/** The step runner 3.2a uses for its two agents: the same budget, cache, gates and retries as every other call. */
function peopleStepRunner(ctx: StepContext): StepFn {
  return createStepRunner({
    runAgent: ctx.runAgent, ledger: ctx.ledger, models: ctx.models, cache: ctx.cache,
    groundingRetries: limits.generation.groundingRetries, onEvent: ctx.onEvent,
    timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
    stats: { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 },
  })
}

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
    const collected = await collectSources(ctx.order, { fetchPage: ctx.fetchPage, socialPosts: ctx.socialPosts, pages: ctx.pages, materialSources: ctx.materialSources, log: ctx.log })
    // 3.2a — the people who speak for the brand and what they say elsewhere; skipped when an explicit page list replaces discovery.
    const people = ctx.pages?.length
      ? null
      : await discoverPeople({
          order: ctx.order, collected, knownPeople: ctx.knownPeople ?? [], searchWeb: ctx.searchWeb, fetchPage: ctx.fetchPage,
          scrapeProfilePosts: ctx.scrapeProfilePosts, step: peopleStepRunner(ctx), log: ctx.log,
        })
    if (people) ctx.log(`3.2a people: ${people.people.length} followed, ${people.stats.searches} searches, ${people.stats.scraped_posts} posts, ${people.stats.fetched_pages} pages`)
    const fetched = people ? [...collected, ...people.sources] : collected
    const sources = previous ? retainCollectedSourceIds(fetched, previous.data as ZrodlaData) : fetched
    if (previous && people) {
      const ids = new Map(fetched.map((source, index) => [source.source_id, sources[index].source_id]))
      const retainedId = (id: string) => ids.get(id) ?? id
      people.people = people.people.map((person) => ({
        ...person,
        evidence_source_id: person.evidence_source_id ? retainedId(person.evidence_source_id) : null,
        own_channels: person.own_channels.map((channel) => ({ ...channel, source_ids: channel.source_ids.map(retainedId) })),
        mentions: person.mentions.map((mention) => ({ ...mention, source_id: mention.source_id ? retainedId(mention.source_id) : null })),
      }))
    }
    await saveSources(ctx.em, ctx.scope, ctx.orderRef, run.id, sources)
    const result = await runSourcesStep({ order: ctx.order, sources, runAgent: ctx.runAgent, ledger: ctx.ledger, models: ctx.models, cache: ctx.cache, concurrency: ctx.concurrency, onEvent: ctx.onEvent })
    if (people) {
      result.data.people = people.people
      result.issues.push(...people.issues.map((item) => ({ code: item.code, severity: item.severity === 'dropped' || item.severity === 'repaired' ? 'repaired' : 'limitation', detail: item.detail, path: `people.${item.path}` } as DocumentIssue)))
    }
    // A repair of 3.2 rebuilds the client's half of the register; the competitor half 3.4 appended (C-facts, their
    // sources and samples) is carried forward unchanged, so WEW-KONKURENCJA keeps citing ids that exist.
    const data = previous ? carryCompetitorEntries(result.data, previous.data as ZrodlaData) : result.data
    // The register is reviewed in 3.7; its blockers travel as issues, not as a status.
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-ZRODLA',
      status: 'ready_for_review',
      inputVersions: [ctx.orderVersion],
      data: data as unknown as Record<string, unknown>,
      issues: result.issues,
      renderedMd: renderZrodla({ brand: ctx.order.brand, data, businessProfile: result.businessProfile, issues: result.issues, versionLabel: previous ? String(Number(previous.version.split('.')[0]) + 1) : '1' }),
      taskRunId: run.id,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { businessProfile: result.businessProfile, stats: result.stats, people: people?.stats ?? null }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    const paused = error instanceof BudgetPausedError
    await finishTaskRun(ctx.em, run, { status: paused ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

/**
 * Shared CLI/server composition of the process (P3 → P9): 3.1 pins the order as a
 * document version, then the steps run in STD-PROCES order up to `through`, each as a task
 * run that starts `running` and ends done / failed / paused_budget with its ledger.
 * A budget pause ends the run cleanly; any other error is re-thrown after the
 * task run has recorded it. Agents remain read-only throughout.
 */
export async function runResearch(opts: RunResearchOptions): Promise<RunResearchOutcome> {
  if (reaches(opts.through, '5.4')) {
    throw new Error('[internal] Research whole-pipeline execution ends at 4.2. Use the accepted-case native strategy and agency_tov specialist continuation for later phases; the competing ToV writer is retired.')
  }
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
    materialSources: opts.materialSources,
    knownPeople: opts.knownPeople,
    scrapeProfilePosts: opts.scrapeProfilePosts,
    repairFindings: [],
    attempt: 1,
    selectedTopicId: opts.selectedTopicId ?? null,
    freshSelection: opts.freshSelection ?? false,
  }

  let qaVerdict: 'ready' | 'to_fix' | 'exception' | undefined
  let briefQaVerdict: 'ready_for_approval' | 'needs_client_data' | 'needs_agent_fix' | undefined
  let strategyQaVerdict: 'ready_for_approval' | 'needs_agent_fix' | undefined
  let planQaVerdict: 'ready_for_approval' | 'needs_agent_fix' | undefined
  let postQaVerdict: 'pass_for_draft' | 'needs_fix' | 'reject' | undefined
  let closeAllowed: boolean | undefined
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
        const qa = await runQaLoop(c, { authorSteps: { '3.2': runSourcesStepDb, '3.3': runAuditStep, '3.4': runCompetitorsStep, '3.5': runComparisonStep, '3.6': runFindingsStep } })
        qaVerdict = qa.verdict
        escalationVersionId = qa.escalationVersionId
        if (qa.verdict !== 'ready') return null
        return runFreezeStep(c)
      },
    },
    {
      // 4.1 brief draft → 4.2 brief QA (agent errors repaired ≤ 2 times; client gaps become the questions, never a QA failure).
      step: '4.2',
      run: async (c) => {
        await runBriefStep(c)
        const qa = await runBriefQaLoop(c, { briefStep: runBriefStep })
        briefQaVerdict = qa.verdict
        escalationVersionId = qa.escalationVersionId ?? escalationVersionId
        return { taskRunId: qa.taskRunId, versionId: qa.briefVersionId, status: qa.verdict === 'needs_agent_fix' ? 'to_fix' : 'done' }
      },
    },
    {
      // Historical phase identity retained; new work goes through the accepted-case specialist path.
      step: '5.4',
      run: async () => { throw new Error('[internal] Strategy requires the accepted-case native specialist continuation') },
    },
    {
      // 6.2 plan → 6.3 Q-P → 6.5 selection (client's topic or the recommendation, simulated) → 6.7 post instruction (code only).
      step: '6.7',
      run: async (c) => {
        await runPlanStep(c)
        const qa = await runPlanQaLoop(c, { planStep: runPlanStep })
        planQaVerdict = qa.verdict
        // A plan still `to_fix` after its repairs is a draft, not a dead end: the selection is simulated on it and the
        // instruction is built in simulation, as every unapproved input is; the verdict stays on the task run.
        if (qa.verdict !== 'ready_for_approval') log(`6.3: plan stays a draft (${qa.verdict}); selection and instruction continue in simulation`)
        const selection = await runSelectionStep(c)
        if (selection.status !== 'done') return null
        const instruction = await runPostInstructionStep(c)
        return qa.verdict === 'ready_for_approval' ? instruction : { ...instruction, status: 'to_fix' }
      },
    },
    {
      // 7.2 post by the isolated author → 7.3 independent editor (repairs ≤ 2, then E.1).
      step: '7.3',
      run: async (c) => {
        await runPostStep(c)
        const qa = await runPostQaLoop(c, { postStep: runPostStep })
        postQaVerdict = qa.verdict
        escalationVersionId = qa.escalationVersionId ?? escalationVersionId
        return { taskRunId: qa.taskRunId, versionId: qa.postVersionId, status: qa.verdict === 'pass_for_draft' ? 'done' : 'to_fix' }
      },
    },
    {
      // 8.2 configuration → 8.3 publication order + preflight → 8.7 confirmation. Documents only: nothing is sent.
      step: '8.7',
      run: async (c) => {
        await runPublicationConfigStep(c)
        await runPublicationOrderStep(c)
        return runPublicationConfirmationStep(c)
      },
    },
    {
      // 9.1 package → 9.3 closure gate (recorded on the task run; the spine owns order closure).
      step: '9.3',
      run: async (c) => {
        await runPackageStep(c)
        const closure = await runClosureStep(c)
        closeAllowed = closure.closeAllowed
        return { taskRunId: closure.taskRunId, versionId: closure.versionId, status: 'done' }
      },
    },
  ]
  let completedThrough: ResearchStep | null = null
  let currentStep: ResearchStep = '3.2'
  if (opts.resumeFrom) {
    // The authorized caller establishes recovery; do not sweep unrelated phase workers.
    const orphaned = await em.find(AgencyResearchTaskRun, {
      ...scope, orderRef, status: 'running', stepId: { $in: resumedResearchTaskSteps(opts.resumeFrom, opts.through) },
    })
    for (const run of orphaned) {
      run.status = 'failed'
      run.error = `[internal] superseded by a resumed run from ${opts.resumeFrom} at ${new Date().toISOString()}`
      run.finishedAt = new Date()
    }
    if (orphaned.length) await em.flush()
  }
  try {
    for (const { step, run } of chain) {
      if (!reaches(opts.through, step)) break
      if (opts.resumeFrom && !reaches(step, opts.resumeFrom)) {
        // Resumed run: this group already produced its current versions; the next group reads them from the store.
        versionsByStep[step] = (await currentInputVersion(em, scope, orderRef, groupOutput[step]))?.versionId ?? null
        if (step === '3.8') {
          // Carry the saved gate into the resumed native result; skipping the
          // analysis is not a new QA pass, nor should it erase the real one.
          const qa = await em.findOne(AgencyResearchTaskRun, { ...scope, orderRef, stepId: '3.7' }, { orderBy: { createdAt: 'desc' } })
          const verdict = (qa?.qaResult as { verdict?: unknown } | null)?.verdict
          if (qa?.status === 'done' && verdict === 'ready') qaVerdict = 'ready'
          else if (verdict === 'to_fix' || verdict === 'exception') qaVerdict = verdict
        }
        completedThrough = step
        log(`resume: skipping ${step}, current versions stand`)
        continue
      }
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
  return { taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total, completedThrough, versionsByStep, qaVerdict, briefQaVerdict, strategyQaVerdict, planQaVerdict, postQaVerdict, closeAllowed, escalationVersionId }
}

type Container = { resolve(name: string): unknown; hasRegistration?(name: string): boolean }

type CorpusScraper = { available(): boolean; sourceOf(url: string): string | null; scrape(input: { url: string; maxPosts: number }): Promise<{ posts: Array<{ id: string; url: string; text: string; postedAt: string; authorName: string; likes: number; comments: number; shares: number }> }> }

/** The ToV lane's Apify seam, resolved optionally (ADR-001: no import across the agency modules). */
export function profileScraperFrom(container: Container): ScrapeProfilePosts | undefined {
  if (!container.hasRegistration?.('agencyTovCorpusScraper')) return undefined
  const scraper = container.resolve('agencyTovCorpusScraper') as CorpusScraper
  if (!scraper.available()) return undefined
  return async ({ url, maxPosts }) => {
    if (!scraper.sourceOf(url)) return []
    const { posts } = await scraper.scrape({ url, maxPosts })
    return posts.map((post) => ({ id: post.id, url: post.url, text: post.text, postedAt: post.postedAt, authorName: post.authorName, likes: post.likes, comments: post.comments, shares: post.shares }))
  }
}

export function createAgencyResearchService(container: Container): AgencyResearchService {
  const readSpecialistTov: ReadSpecialistTov = (scope, reference) =>
    (container.resolve(AGENCY_TOV_RESEARCH_SERVICE) as AgencyTovResearchService).getDocumentVersion(scope, reference)
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
      const fixtureSources = configuredFixtureSources(parsed.order)
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
        fetchPage: fixtureSources?.fetchPage ?? createFirecrawlFetcher({ apiKey }),
        searchWeb: fixtureSources ? fixtureSources.searchWeb : apiKey ? createFirecrawlSearch({ apiKey }) : undefined,
        socialPosts: fixtureSources?.socialPosts ?? parsed.socialPosts,
        pages: fixtureSources?.pages ?? parsed.pages,
        materialSources: parsed.materialSources,
        knownPeople: (parsed.people ?? []).map((person) => ({ name: person.name, role: person.role ?? null, provided_by: 'client' as const, knownUrls: person.knownUrls ?? [] })),
        scrapeProfilePosts: fixtureSources ? undefined : profileScraperFrom(container),
        through: parsed.through,
        selectedTopicId: parsed.selectedTopicId ?? null,
        maxCostPln: parsed.maxCostPln,
        resumeFrom: parsed.resumeFrom ?? null,
        cache: fileCache(orderCacheDir(parsed.orderRef)),
        agentRunIds,
      })
      const { versionsByStep: _versionsByStep, ...result } = outcome
      return result
    },
    async runMaterialRevision({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] material revision requires an explicit tenant, organization and execution user')
      const parsed = materialRevisionRequestSchema.parse(request)
      if (context.workflowInstanceId !== parsed.source.workflowInstanceId) throw new Error('[internal] material revision source must belong to the executing workflow')
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!(await rbac.userHasAllFeatures(context.userId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope))) throw new Error('[internal] material revision execution is not authorized')
      const agentRunIds: string[] = []
      const runAgent = createOrchestratorRunner(container, { ...scope, userId: context.userId, workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId }, agentRunIds)
      return runMaterialRevision({ em: (container.resolve('em') as EntityManager).fork(), scope, request: parsed,
        runAgent, runner: 'orchestrator', models: defaultModels(), agentRunIds })
    },
    async runBriefRevision({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] brief revision requires an explicit tenant, organization and execution user')
      const parsed = briefRevisionRequestSchema.parse(request)
      if (context.workflowInstanceId !== parsed.source.workflowInstanceId) throw new Error('[internal] brief revision source must belong to the executing workflow')
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!(await rbac.userHasAllFeatures(context.userId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope))) {
        throw new Error('[internal] brief revision execution is not authorized')
      }
      const agentRunIds: string[] = []
      const runAgent = createOrchestratorRunner(container, { ...scope, userId: context.userId, workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId }, agentRunIds)
      return runBriefRevision({
        em: (container.resolve('em') as EntityManager).fork(), scope, request: parsed,
        runAgent, runner: 'orchestrator', models: defaultModels(), agentRunIds,
      })
    },
    async runStrategy({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] strategy execution requires an explicit tenant, organization and execution user')
      const parsed = strategyExecutionRequestSchema.parse(request)
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!(await rbac.userHasAllFeatures(context.userId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope))) {
        throw new Error('[internal] strategy execution is not authorized')
      }
      const agentRunIds: string[] = []
      const runAgent = createOrchestratorRunner(container, { ...scope, userId: context.userId, workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId }, agentRunIds)
      return runStrategyExecution({
        em: (container.resolve('em') as EntityManager).fork(),
        scope,
        request: parsed,
        runAgent,
        runner: 'orchestrator',
        models: defaultModels(),
        agentRunIds,
        readSpecialistTov,
      })
    },
    async runPlanning({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] planning execution requires an explicit tenant, organization and execution user')
      const parsed = planningExecutionRequestSchema.parse(request)
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!(await rbac.userHasAllFeatures(context.userId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope))) {
        throw new Error('[internal] planning execution is not authorized')
      }
      const agentRunIds: string[] = []
      const runAgent = createOrchestratorRunner(container, { ...scope, userId: context.userId, workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId }, agentRunIds)
      return runPlanningExecution({
        em: (container.resolve('em') as EntityManager).fork(), scope, request: parsed,
        runAgent, runner: 'orchestrator', models: defaultModels(), agentRunIds, readSpecialistTov,
      })
    },
    async runPostExecution({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] post execution requires an explicit tenant, organization and execution user')
      const parsed = postExecutionRequestSchema.parse(request)
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!(await rbac.userHasAllFeatures(context.userId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope))) {
        throw new Error('[internal] post execution is not authorized')
      }
      const agentRunIds: string[] = []
      const runAgent = createOrchestratorRunner(container, { ...scope, userId: context.userId, workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId }, agentRunIds)
      return runPostExecution({
        em: (container.resolve('em') as EntityManager).fork(), scope, request: parsed,
        runAgent, runner: 'orchestrator', models: defaultModels(), agentRunIds, readSpecialistTov,
      })
    },
    async runPostRevision({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] post revision requires an explicit tenant, organization and execution user')
      const parsed = postRevisionRequestSchema.parse(request)
      if (context.workflowInstanceId !== parsed.source.workflowInstanceId) throw new Error('[internal] post revision source must belong to the executing workflow')
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!(await rbac.userHasAllFeatures(context.userId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope))) {
        throw new Error('[internal] post revision execution is not authorized')
      }
      const agentRunIds: string[] = []
      const runAgent = createOrchestratorRunner(container, { ...scope, userId: context.userId, workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId }, agentRunIds)
      return runPostRevision({
        em: (container.resolve('em') as EntityManager).fork(), scope, request: parsed,
        runAgent, runner: 'orchestrator', models: defaultModels(), agentRunIds, readSpecialistTov,
      })
    },
    async runPostEvidence({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] post evidence requires explicit scope and execution user')
      const parsed = runPostEvidenceRequestSchema.parse(request)
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!(await rbac.userHasAllFeatures(context.userId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope))) {
        throw new Error('[internal] post evidence execution is not authorized')
      }
      const agentRunIds: string[] = []
      const runAgent = createOrchestratorRunner(container, { ...scope, userId: context.userId,
        workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId }, agentRunIds)
      return runPostEvidence({ em: (container.resolve('em') as EntityManager).fork(), scope, request: parsed,
        runAgent, runner: 'orchestrator', models: defaultModels(), agentRunIds, readSpecialistTov })
    },
    async getClientView(scope, orderRef, templateId) {
      const em = (container.resolve('em') as EntityManager).fork()
      const current = await currentInputVersion(em, scope, orderRef, templateId)
      if (!current) return { status: 'not_ready' }
      const version = await em.findOne(AgencyResearchDocumentVersion, { id: current.versionId })
      // Only the brief carries the first-contact questions; every other client view is its projection alone.
      const ustalenia = templateId === 'WZR-BRIEF' ? await currentInputVersion(em, scope, orderRef, 'WZR-USTALENIA') : null
      const questions = ustalenia ? firstContactQuestions(ustalenia.data as UstaleniaData) : []
      return {
        status: current.status ?? 'draft',
        version: current.version,
        client_view_md: version?.clientViewMd ?? null,
        questions: questions.map((q) => ({ question_id: q.question_id, question: q.question, hint: q.hint, reason: q.reason, brief_field: q.brief_field, priority: q.priority })),
      }
    },
    async getBriefReview(scope, orderRef, versionId) {
      return readBriefReview((container.resolve('em') as EntityManager).fork(), scope, orderRef, versionId)
    },
    async getStrategyReview(scope, orderRef, strategyVersionId, tovVersionId) {
      return readStrategyReview((container.resolve('em') as EntityManager).fork(), scope, orderRef, strategyVersionId, tovVersionId,
        readSpecialistTov)
    },
    async getPostReview(scope, orderRef, versionId) {
      return readPostReview((container.resolve('em') as EntityManager).fork(), scope, orderRef, versionId)
    },
    async acceptBrief(input) {
      return acceptBrief(container as AppContainer, input)
    },
    async acceptStrategyPair(input) {
      return acceptStrategyPair(container as AppContainer, input)
    },
    async getStrategyPairAcceptance(scope, input) {
      return readStrategyPairAcceptance((container.resolve('em') as EntityManager).fork(), scope, input, readSpecialistTov)
    },
    async getPlanningReadiness(scope, input) {
      return readPlanningReadiness((container.resolve('em') as EntityManager).fork(), scope, input, readSpecialistTov)
    },
    async getPlanReview(scope, input) {
      return readPlanReview((container.resolve('em') as EntityManager).fork(), scope, input, readSpecialistTov)
    },
    async getPlanAcceptance(scope, input) {
      return readPlanAcceptance((container.resolve('em') as EntityManager).fork(), scope, input, readSpecialistTov)
    },
    async acceptPlan(rawInput) {
      const input = acceptPlanInputSchema.parse(rawInput)
      const scope = { tenantId: input.context.tenantId, organizationId: input.context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!await rbac.userHasAllFeatures(input.context.userId, ['agency_research.manage'], scope)) {
        throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      }
      return acceptPlan((container.resolve('em') as EntityManager).fork(), input, readSpecialistTov)
    },
    async getPostAcceptance(scope, input) {
      return readPostAcceptance((container.resolve('em') as EntityManager).fork(), scope, input)
    },
    async getPublicationConsent(scope, input) {
      return readPublicationConsent((container.resolve('em') as EntityManager).fork(), scope, input)
    },
    async recordPublicationConsent(rawInput) {
      const input = recordPublicationConsentInputSchema.parse(rawInput)
      const scope = { tenantId: input.context.tenantId, organizationId: input.context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!await rbac.userHasAllFeatures(input.context.userId, ['agency_research.manage'], scope)) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      return recordPublicationConsent((container.resolve('em') as EntityManager).fork(), input)
    },
    async preparePublication(rawInput) {
      const input = preparePublicationInputSchema.parse(rawInput)
      const scope = { tenantId: input.context.tenantId, organizationId: input.context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!await rbac.userHasAllFeatures(input.context.userId, ['agency_research.manage'], scope)) {
        throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      }
      return preparePublication((container.resolve('em') as EntityManager).fork(), input)
    },
    async configurePublicationDestination(rawInput) {
      const input = configurePublicationDestinationInputSchema.parse(rawInput)
      const scope = { tenantId: input.context.tenantId, organizationId: input.context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!await rbac.userHasAllFeatures(input.context.userId, ['agency_research.manage'], scope)) {
        throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      }
      return configurePublicationDestination((container.resolve('em') as EntityManager).fork(), input)
    },
    async acceptPost(rawInput) {
      const input = acceptPostInputSchema.parse(rawInput)
      const scope = { tenantId: input.context.tenantId, organizationId: input.context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!await rbac.userHasAllFeatures(input.context.userId, ['agency_research.manage'], scope)) {
        throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      }
      return acceptPost((container.resolve('em') as EntityManager).fork(), input)
    },
    async runPostInstruction({ context, request }) {
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] Post instruction requires an explicit execution identity')
      const parsed = postInstructionExecutionRequestSchema.parse(request)
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!await rbac.userHasAllFeatures(context.userId, ['agency_research.manage'], scope)) {
        throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      }
      return runPostInstructionExecution({ em: (container.resolve('em') as EntityManager).fork(), scope, request: parsed, readSpecialistTov })
    },
    async getBriefAcceptance(scope, orderRef, versionId) {
      return readBriefAcceptance((container.resolve('em') as EntityManager).fork(), scope, orderRef, versionId)
    },
    async getStrategyReadiness(scope, input) {
      return resolveStrategyReadiness((container.resolve('em') as EntityManager).fork(), scope, input)
    },
    async getExceptionReview(scope, orderRef, versionId) {
      return readResearchException((container.resolve('em') as EntityManager).fork(), scope, orderRef, versionId)
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
