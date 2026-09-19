import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AgentRunCtx, AgentRuntimeService } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/runtime/agentRuntime'
import { tovOutputLanguages, tovPostSchema, type TovOutputLanguage, type TovPost } from '../data/validators'
import { groupByProfile } from './corpus'
import { citationsOf, finishResearchRun, importCorpus, loadCorpus, saveDocumentVersion, startResearchRun, type StoredCorpus, type TovScope } from './store'
import { runTovPipeline, type TovAgentRunner, type TovPipelineOptions, type TovPipelineResult } from './tov/pipeline'
import { linkResolverFor, renderBrandTov, renderProfileVoice } from './tov/render'
import { readTovDocumentVersion, type TovDocumentVersionRequest } from './documentVersion/read'
import type { SpecialistTovDocument } from './documentVersion/contracts'
import { runTovRevision } from './revision/run'
import { readRevisionPolicy } from './revision/policy'
import { tovRevisionRequestSchema, type TovRevisionInput, type TovRevisionResult } from './revision/contracts'

export type { TovDocumentVersionRequest } from './documentVersion/read'
export type { SpecialistTovDocument, SpecialistTovReference } from './documentVersion/contracts'
export type { TovRevisionInput, TovRevisionRequest, TovRevisionResult } from './revision/contracts'

export const AGENCY_TOV_RESEARCH_SERVICE = 'agencyTovResearchService' as const

export type TovResearchOptions = Omit<TovPipelineOptions, 'posts' | 'brand' | 'outputLanguage' | 'runAgent'>
export type TovResearchInput = {
  /** Trusted server execution identity, never a portal customer identity. */
  context: AgentRunCtx
  brand: string
  outputLanguage: TovOutputLanguage
  posts: TovPost[]
  options?: TovResearchOptions
}
export type TovResearchResult = {
  researchRunId: string
  documentVersionIds: string[]
  /** Exact persisted native runs, including delegated children reported by the runtime. */
  agentRunIds: string[]
  result: TovPipelineResult
}
export interface AgencyTovResearchService {
  run(input: TovResearchInput): Promise<TovResearchResult>
  revise(input: TovRevisionInput): Promise<TovRevisionResult>
  /** Server-only: caller owns staff ACL or exact customer-task/case authorization. */
  getDocumentVersion(scope: TovScope, reference: TovDocumentVersionRequest): Promise<SpecialistTovDocument | null>
}
type Container = { resolve(name: string): unknown }

/** Native runtime is the only intelligence boundary on the server path. */
export function createTovAgentRunner(container: Container, context: AgentRunCtx, agentRunIds: string[] = []): TovAgentRunner {
  const runtime = container.resolve('agentRuntime') as AgentRuntimeService
  let invocation = 0
  return (agentId, input, options) => runtime.run(agentId, input, {
    ...context,
    // A pipeline contains multiple invocations in the same workflow step.
    invocationId: context.invocationId ? `${context.invocationId}:${invocation++}` : undefined,
    runTimeoutMs: options.runTimeoutMs,
    onRunPersisted(runId) {
      if (!agentRunIds.includes(runId)) agentRunIds.push(runId)
      context.onRunPersisted?.(runId)
    },
  })
}

/** Shared CLI/server persistence composition; agents themselves remain read-only. */
export async function runStoredTovResearch(input: {
  em: EntityManager
  scope: TovScope
  brand: string
  outputLanguage: TovOutputLanguage
  corpus: StoredCorpus
  runAgent: TovAgentRunner
  runner: string
  models?: unknown
  options?: TovResearchOptions
}): Promise<Omit<TovResearchResult, 'agentRunIds'>> {
  const { em, scope, brand, outputLanguage, corpus, runAgent, options } = input
  const run = await startResearchRun(em, scope, { brand, outputLanguage, corpus, runner: input.runner, models: input.models ?? null })
  const groundingReport: unknown[] = []
  try {
    const result = await runTovPipeline({
      ...options, posts: corpus.posts, brand, outputLanguage, runAgent,
      onEvent(event) {
        if (event.type === 'grounding' || event.type === 'grounding_rejected') groundingReport.push(event)
        options?.onEvent?.(event)
      },
    })
    const documentVersionIds: string[] = []
    const linkOf = linkResolverFor(corpus.posts)
    const byProfile = groupByProfile(corpus.posts)
    for (const profile of result.profiles) {
      const { version } = await saveDocumentVersion(em, scope, {
        brand, kind: 'TOV-PROFILE', profileUrl: profile.profile.profileUrl,
        title: `Voice profile — ${profile.profile.displayName}`, researchRunId: run.id,
        body: profile.voice, renderedMd: renderProfileVoice(profile.profile, profile.voice, linkOf),
        citations: citationsOf(profile.voice, byProfile.get(profile.profile.profileUrl) ?? [], corpus.rowOf),
      })
      documentVersionIds.push(version.id)
    }
    const { version } = await saveDocumentVersion(em, scope, {
      brand, kind: 'KLI-TOV', profileUrl: '', title: `Tone of voice — ${brand}`, researchRunId: run.id,
      body: result.brand, renderedMd: renderBrandTov(result.brand, result.profiles, linkOf),
      citations: citationsOf(result.brand, corpus.posts, corpus.rowOf),
    })
    documentVersionIds.push(version.id)
    await finishResearchRun(em, run, { status: 'done', stats: result.stats, groundingReport })
    return { researchRunId: run.id, documentVersionIds, result }
  } catch (error) {
    await finishResearchRun(em, run, { status: 'failed', error: error instanceof Error ? error.message : String(error), groundingReport })
    throw error
  }
}

export function createAgencyTovResearchService(container: Container): AgencyTovResearchService {
  return {
    async revise(input) {
      const { context } = input
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('[internal] ToV revision requires explicit execution scope')
      const request = tovRevisionRequestSchema.parse(input.request)
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!await rbac.userHasAllFeatures(context.userId, ['agency_tov.manage', 'agent_orchestrator.agents.run'], scope)) {
        throw new Error('[internal] ToV revision execution is not authorized')
      }
      const em = (container.resolve('em') as EntityManager).fork()
      const executionPolicy = await readRevisionPolicy(em, input)
      if (!executionPolicy) return { status: 'not_configured', reason: 'revision_execution_not_authorized' }
      const agentRunIds: string[] = []
      return runTovRevision({ em, scope, request, executionPolicy, agentRunIds,
        runAgent: createTovAgentRunner(container, context, agentRunIds) })
    },
    async getDocumentVersion(scope, reference) {
      return readTovDocumentVersion((container.resolve('em') as EntityManager).fork(), scope, reference)
    },
    async run(input) {
      const { context, brand, outputLanguage, options } = input
      if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('ToV research requires an explicit tenant, organization and execution user')
      if (!brand.trim() || !tovOutputLanguages.includes(outputLanguage)) throw new Error('ToV research requires a brand and supported output language')
      const posts = input.posts.map((post) => tovPostSchema.parse(post))
      if (!posts.length) throw new Error('ToV research requires a non-empty normalized corpus')
      const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
      const rbac = container.resolve('rbacService') as Pick<RbacService, 'userHasAllFeatures'>
      if (!await rbac.userHasAllFeatures(context.userId, ['agency_tov.manage', 'agent_orchestrator.agents.run'], scope)) {
        throw new Error('ToV research execution is not authorized')
      }
      const em = (container.resolve('em') as EntityManager).fork()
      const agentRunIds: string[] = []
      const runAgent = createTovAgentRunner(container, context, agentRunIds)
      await importCorpus(em, scope, { brand, mode: 'file', targets: [], reports: [], corpus: { posts, skipped: [] } })
      const stored = await loadCorpus(em, scope, { profileUrls: [...groupByProfile(posts).keys()] })
      // A client request must not silently expand to every historical post for its profiles.
      const identity = (post: TovPost) => JSON.stringify([post.source, post.profileUrl, post.id])
      const requested = new Set(posts.map(identity))
      const selected = stored.posts.map((post, index) => ({ post, rowId: stored.rowIds[index] })).filter(({ post }) => requested.has(identity(post)))
      const storedByIdentity = new Map(selected.map(({ post }) => [identity(post), post]))
      // Imports are immutable by source identity. Never analyze old text as if
      // it were this request's material, or cite old rows for substituted text.
      if (posts.some((post) => storedByIdentity.get(identity(post))?.text !== post.text)) {
        throw new Error('ToV corpus conflicts with stored source text; use a new post identity for changed material')
      }
      const corpus: StoredCorpus = { ...stored, posts: selected.map(({ post }) => post), rowIds: selected.map(({ rowId }) => rowId) }
      const outcome = await runStoredTovResearch({ em, scope, brand, outputLanguage, corpus, runAgent, runner: 'orchestrator', options })
      return { ...outcome, agentRunIds }
    },
  }
}
