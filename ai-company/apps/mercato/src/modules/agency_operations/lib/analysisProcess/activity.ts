import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase } from '../../data/entities'
import { AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from '../contracts'
import { analysisMaterialSchema, analysisExecutionPolicySchema, analysisProcessResultSchema, type AnalysisProcessResult } from './contracts'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_WORKFLOW_ID } from './workflow'
import { PAID_CASE_ANALYSIS_CONTEXT } from '../paidCaseAnalysis/contracts'
import { mapPaidPurchaseMaterial } from '../paidCaseAnalysis/material'
import { loadCaseMaterialSources } from './materialSources'
import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('agency_operations').child({ component: 'analysis' })
const SOCIAL_CORPUS_MAX_POSTS = 40

type CorpusScraper = {
  available(): boolean
  sourceOf(url: string): string | null
  scrape(input: { url: string; maxPosts: number; log?: (message: string) => void }): Promise<{ posts: Array<{ id: string; url: string; text: string; postedAt: string; authorName: string; likes: number; comments: number; shares: number }>; actorId: string; items: number; error: string | null }>
}

/**
 * The official social profile rarely renders for a plain fetch, so when the
 * material carries no corpus the case borrows the ToV lane's scraper (optional
 * DI seam, needs APIFY_TOKEN) for the profile the client named. A failure or a
 * missing scraper leaves the research to the website alone — never a stop.
 */
async function liveSocialCorpus(container: AppContainer, order: { official_social?: { url?: string | null; url_or_null?: string | null } }, caseId: string) {
  // Native fixture runs supply their source corpus at the research boundary.
  // Never spend on Apify just because a developer has its token configured.
  if (process.env.AGENCY_TEST_NATIVE_TRIAGE === '1') return undefined
  const url = order.official_social?.url ?? order.official_social?.url_or_null ?? null
  if (!url || !container.hasRegistration('agencyTovCorpusScraper')) return undefined
  const scraper = container.resolve<CorpusScraper>('agencyTovCorpusScraper')
  if (!scraper.available() || !scraper.sourceOf(url)) return undefined
  try {
    const result = await scraper.scrape({ url, maxPosts: SOCIAL_CORPUS_MAX_POSTS, log: (message) => logger.info(message, { caseId }) })
    logger.info('Social corpus scraped for analysis', { caseId, url, actorId: result.actorId, items: result.items, posts: result.posts.length, error: result.error })
    if (!result.posts.length) return undefined
    return result.posts.map((post) => ({ id: post.id, url: post.url, text: post.text, postedAt: post.postedAt, authorName: post.authorName, likes: post.likes, comments: post.comments, shares: post.shares }))
  } catch (error) {
    logger.warn('Social corpus scrape failed; analysis continues without it', { caseId, url, error: error instanceof Error ? error.message : String(error) })
    return undefined
  }
}

const RESUMABLE_STEPS = ['3.2', '3.5', '3.8', '4.2', '5.4', '6.7', '7.3', '8.7', '9.3'] as const
type ResumableStep = (typeof RESUMABLE_STEPS)[number]
/** The chain group a paused or exhausted run stopped in — the step a re-entered research activity resumes from. */
const GROUP_OF: Record<string, ResumableStep> = { '3.1': '3.2', '3.2': '3.2', '3.3': '3.5', '3.4': '3.5', '3.5': '3.5', '3.6': '3.8', '3.7': '3.8', '3.8': '3.8', '4.1': '4.2', '4.2': '4.2', 'E.1': '3.8' }

/**
 * Where a previous run of this case stopped, or null when it never ran or
 * finished cleanly. Only a budget pause or an exception makes a case resumable;
 * anything else keeps the "reconcile first" refusal.
 */
export function resumePoint(taskRuns: Array<{ stepId: string; status: string }>): ResumableStep | null {
  if (!taskRuns.length) return null
  // The store lists task runs in creation order.
  const ordered = [...taskRuns]
  const last = ordered[ordered.length - 1]
  const paused = [...ordered].reverse().find((run) => run.status === 'paused_budget')
  // A repair loop in flight (a 3.7 verdict exists) resumes at the QA group, whatever step the repair was on.
  const inRepair = last.stepId.startsWith('3.')
    && [...ordered].reverse().find((run) => run.stepId === '3.7')?.status === 'to_fix'
  if (last.status === 'exception' && paused) return GROUP_OF[paused.stepId] ?? null
  if (last.status === 'paused_budget') return GROUP_OF[last.stepId] ?? null
  if (last.status === 'exception') {
    const before = ordered.filter((run) => run.stepId !== 'E.1').pop()
    return before ? (GROUP_OF[before.stepId] ?? null) : null
  }
  // This identifies a candidate group, not liveness or permission to retry.
  // The caller separately requires an explicit restart of a terminal native workflow.
  if (last.status === 'running' || last.status === 'failed') return inRepair ? '3.8' : (GROUP_OF[last.stepId] ?? null)
  return null
}

export function assertAnalysisExecutionEnabled(): void {
  if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) {
    throw new CrudHttpError(409, { error: 'Agency analysis execution is not enabled' })
  }
}

export function parseAnalysisMaterial(buffer: Buffer) {
  if (buffer.length > 1024 * 1024) throw new CrudHttpError(400, { error: 'Analysis material must be at most 1 MiB' })
  let raw: unknown
  try { raw = JSON.parse(buffer.toString('utf8')) } catch {
    throw new CrudHttpError(400, { error: 'Analysis material must be JSON containing the approved order and source inputs' })
  }
  const material = analysisMaterialSchema.safeParse(raw)
  if (!material.success) throw new CrudHttpError(400, { error: 'Analysis requires explicit approved order data and product topic limit' })
  return material.data
}

const inputSchema = z.object({ caseId: z.uuid(), policy: analysisExecutionPolicySchema })
const contextSchema = z.object({
  userId: z.uuid(), stepInstanceId: z.uuid().optional(),
  workflowInstance: z.object({
    id: z.uuid(), workflowId: z.literal(AGENCY_ANALYSIS_WORKFLOW_ID),
    tenantId: z.uuid(), organizationId: z.uuid(), status: z.string(),
    context: z.record(z.string(), z.unknown()),
  }),
})

export function createAnalysisWorkflowActivity(container: AppContainer) {
  return async (rawInput: unknown, rawContext: unknown): Promise<AnalysisProcessResult> => {
    assertAnalysisExecutionEnabled()
    const input = inputSchema.parse(rawInput)
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const agencyCase = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyCase, {
      id: input.caseId, ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    const saved = z.object({ result: analysisProcessResultSchema }).safeParse(context.workflowInstance.context[AGENCY_ANALYSIS_RESULT_KEY] ?? context.workflowInstance.context.agencyAnalysisResult)
    const restart = z.object({ previousWorkflowInstanceId: z.uuid(), by: z.uuid(), attempt: z.number().int().positive() })
      .safeParse(context.workflowInstance.context.restart)
    // A queue redelivery is not a new paid attempt. Only the explicit staff
    // restart operation may continue a persisted waiting/interrupted result.
    if (saved.success && saved.data.result.caseId === agencyCase.id && saved.data.result.requestedThrough === input.policy.through) return saved.data.result
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'COMPENSATING'].includes(context.workflowInstance.status)) {
      throw new Error('[internal] Analysis cannot restart a terminal workflow')
    }
    const material = await container.resolve<AttachmentService>('attachmentService').readScoped({
      attachmentId: agencyCase.materialAttachmentId,
      auth: { sub: context.userId, tenantId: scope.tenantId, orgId: scope.organizationId },
      expectedOwner: { entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: agencyCase.id },
      expectedAssignment: { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: agencyCase.id },
      expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, requirePrivatePartition: true,
    })
    const purchaseOrigin = context.workflowInstance.context[PAID_CASE_ANALYSIS_CONTEXT]
    const parsed = purchaseOrigin === undefined ? parseAnalysisMaterial(material.buffer)
      : mapPaidPurchaseMaterial(material.buffer, purchaseOrigin, { caseId: agencyCase.id, ...scope,
        customerEntityId: agencyCase.customerEntityId, customerUserId: agencyCase.submittedByCustomerUserId }, input.policy)
    if (!isDeepStrictEqual(parsed.order.product_selection, input.policy.productSelection)) {
      throw new CrudHttpError(409, { error: 'Material product selection differs from the configured agency analysis policy' })
    }
    const service = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
    // Reuse the producer's phase continuation, preserving scoped material inputs.
    const previous = await service.status(scope, agencyCase.id)
    const resumeFrom = resumePoint(previous.taskRuns)
    if (previous.taskRuns.length && (!restart.success || !resumeFrom)) throw new CrudHttpError(409, { error: 'Research already exists for this case; reconcile the existing task runs before starting another analysis' })
    if (restart.success) {
      const attempted = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgentRun, {
        ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
      }, undefined, scope)
      if (attempted) throw new CrudHttpError(409, { error: 'This recovery workflow already invoked research; reconcile it before authorizing another recovery.' })
      const prior = await findOneWithDecryption(container.resolve<EntityManager>('em'), WorkflowInstance, {
        ...scope, id: restart.data.previousWorkflowInstanceId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
        status: { $in: ['FAILED', 'CANCELLED', 'COMPLETED'] }, deletedAt: null,
      }, undefined, scope)
      if (!prior || prior.metadata?.entityType !== 'agency_operations:agency_case' || prior.metadata.entityId !== agencyCase.id) {
        throw new CrudHttpError(409, { error: 'Research continuation requires the existing terminal case workflow.' })
      }
    }
    if (resumeFrom) logger.info('Resuming research after a pause', { caseId: agencyCase.id, resumeFrom, cap: input.policy.maxCostPln })
    const materialSources = await loadCaseMaterialSources(container, scope, agencyCase.id, context.userId)
    const socialPosts = parsed.socialPosts?.length ? parsed.socialPosts : await liveSocialCorpus(container, parsed.order, agencyCase.id)
    const result = await service.run({
      context: {
        ...scope, userId: context.userId, workflowInstanceId: context.workflowInstance.id, stepId: 'research',
        ...(context.stepInstanceId ? { invocationId: context.stepInstanceId } : {}),
      },
      request: { ...parsed, materialSources, ...(socialPosts ? { socialPosts } : {}), orderRef: agencyCase.id, through: input.policy.through, maxCostPln: input.policy.maxCostPln, ...(resumeFrom ? { resumeFrom } : {}) },
    })
    const completed = result.completedThrough === input.policy.through
      && (input.policy.through === '3.2' || input.policy.through === '3.5' || result.qaVerdict === 'ready')
      && (input.policy.through !== '4.2' || result.briefQaVerdict === 'ready_for_approval')
      && !result.escalationVersionId
    return { ...result, caseId: agencyCase.id, requestedThrough: input.policy.through, state: completed ? 'completed' : 'waiting' }
  }
}
