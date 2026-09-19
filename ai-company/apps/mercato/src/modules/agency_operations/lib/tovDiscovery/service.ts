import { createHash } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import type { AgentRuntimeService } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/runtime/agentRuntime'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { TOV_SOURCE_SCOUT_AGENT_ID } from '@/modules/agency_tov/lib/agentIds'
import {
  tovSourceScoutInputSchema,
  tovSourceScoutResult,
} from '@/modules/agency_tov/data/validators'
import { AgencyCase } from '../../data/entities'
import { AGENCY_ANALYSIS_WORKER_ID } from '../analysisProcess'
import { AGENCY_ANALYSIS_WORKFLOW_ID } from '../analysisProcess/workflow'
import { directPaidPurchaseOriginSchema } from '../paidCaseAnalysis/contracts'
import {
  TOV_DISCOVERY_MIN_CONFIDENCE,
  TOV_DISCOVERY_STEP_ID,
  tovDiscoveryInputSchema,
  tovDiscoveryStatusSchema,
  type TovDiscoveryService,
  type TovDiscoveryStatus,
} from './contracts'

export const TOV_DISCOVERY_WRITE_FEATURES = [
  'agency_operations.cases.view',
  'customers.companies.view',
  'agency_tov.manage',
  'agent_orchestrator.agents.run',
  'agent_orchestrator.web_search',
  'agent_orchestrator.web_fetch',
]
const READ_FEATURES = ['agency_operations.cases.view', 'customers.companies.view', 'agency_tov.view']

type Scope = { tenantId: string; organizationId: string }
type CorpusScraper = { available(): boolean; sourceOf(url: string): string | null }

function forbidden(): never {
  throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
}

function missing(): never {
  throw new CrudHttpError(404, { error: 'api.errors.notFound' })
}

function conflict(): never {
  throw new CrudHttpError(409, { error: 'api.errors.conflict' })
}

async function authorize(container: AppContainer, userId: string, scope: Scope, write: boolean): Promise<void> {
  const allowed = await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService')
    .userHasAllFeatures(userId, write ? TOV_DISCOVERY_WRITE_FEATURES : READ_FEATURES, scope)
  if (!allowed) forbidden()
}

export async function readPaidDiscoveryCase(em: EntityManager, scope: Scope, caseId: string): Promise<AgencyCase> {
  const agencyCase = await findOneWithDecryption(em, AgencyCase, {
    ...scope,
    id: caseId,
    deletedAt: null,
  }, undefined, scope)
  if (!agencyCase) missing()
  if (agencyCase.agentWorkerId !== AGENCY_ANALYSIS_WORKER_ID || !agencyCase.workflowInstanceId) conflict()
  const analysis = await findOneWithDecryption(em, WorkflowInstance, {
    ...scope,
    id: agencyCase.workflowInstanceId,
    workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
    deletedAt: null,
  }, undefined, scope)
  const directOrigin = directPaidPurchaseOriginSchema.safeParse(analysis?.context?.purchase)
  const directCase = directOrigin.success && analysis?.metadata?.entityType === 'agency_operations:agency_case'
    && analysis.metadata.entityId === agencyCase.id
  if (!analysis || analysis.context?.caseId !== agencyCase.id
    || analysis.context?.customerEntityId !== agencyCase.customerEntityId || !directCase) conflict()
  return agencyCase
}

function invocationId(eventId: string): string {
  return eventId
}

export function tovDiscoveryTargetId(target: {
  source: string
  url: string
  owner: string
  evidenceUrl: string
}): string {
  return createHash('sha256').update(JSON.stringify([
    target.source, target.url, target.owner, target.evidenceUrl,
  ])).digest('hex').slice(0, 24)
}

async function findRunByInvocation(em: EntityManager, scope: Scope, workflowInstanceId: string, eventId: string) {
  return findOneWithDecryption(em, AgentRun, {
    ...scope,
    agentId: TOV_SOURCE_SCOUT_AGENT_ID,
    workflowInstanceId,
    stepId: TOV_DISCOVERY_STEP_ID,
    invocationId: invocationId(eventId),
    deletedAt: null,
  }, undefined, scope)
}

function handoff(run: AgentRun, hasValidOutput: boolean) {
  const state = run.status === 'running' ? 'discovery_running' as const
    : hasValidOutput ? 'awaiting_staff_corpus' as const : 'discovery_attention_required' as const
  const reason = run.status === 'running' ? 'source_discovery_in_progress' as const
    : hasValidOutput ? 'source_scout_returns_targets_not_normalized_corpus' as const
      : 'source_discovery_did_not_complete' as const
  const nextAction = run.status === 'running' ? 'wait_for_saved_discovery_result' as const
    : hasValidOutput ? 'review_targets_collect_and_upload_normalized_corpus' as const
      : 'review_run_and_submit_new_event_if_authorized' as const
  return {
    state,
    corpusReady: false as const,
    intakeStarted: false as const,
    reason,
    nextAction,
    suppliedCorpusEndpoint: '/api/agency_operations/tov-intakes' as const,
  }
}

function project(run: AgentRun, agencyCase: AgencyCase, replayed: boolean, scraper: CorpusScraper | null): TovDiscoveryStatus {
  const input = tovSourceScoutInputSchema.parse(run.input)
  const parsed = run.status === 'ok' ? tovSourceScoutResult.safeParse(run.output) : null
  const targets = parsed?.success ? parsed.data.data.targets.map((target) => ({
    ...target,
    targetId: tovDiscoveryTargetId(target),
    collectorSupported: scraper?.sourceOf(target.url) === target.source,
    meetsMinimumConfidence: target.confidence >= TOV_DISCOVERY_MIN_CONFIDENCE,
  })) : []
  return tovDiscoveryStatusSchema.parse({
    discoveryRunId: run.id,
    caseId: agencyCase.id,
    customerEntityId: agencyCase.customerEntityId,
    runStatus: run.status,
    state: run.status === 'running' ? 'running' : run.status === 'ok' && parsed?.success ? 'completed' : 'attention_required',
    replayed,
    brand: input.brand,
    outputLanguage: input.outputLanguage,
    minimumConfidence: TOV_DISCOVERY_MIN_CONFIDENCE,
    notes: parsed?.success ? parsed.data.data.notes : null,
    targets,
    collectorAvailable: scraper?.available() === true,
    collectorCandidateCount: targets.filter((target) => target.collectorSupported && target.meetsMinimumConfidence).length,
    handoff: handoff(run, parsed?.success === true),
  })
}

export function createTovDiscoveryService(container: AppContainer): TovDiscoveryService {
  const em = container.resolve<EntityManager>('em')
  const runtime = container.resolve<AgentRuntimeService>('agentRuntime')
  const scraper = container.hasRegistration('agencyTovCorpusScraper')
    ? container.resolve<CorpusScraper>('agencyTovCorpusScraper') : null
  return {
    async start(rawInput) {
      const input = tovDiscoveryInputSchema.parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      await authorize(container, input.userId, scope, true)
      const agencyCase = await readPaidDiscoveryCase(em, scope, input.caseId)
      const workflowInstanceId = agencyCase.workflowInstanceId
      if (!workflowInstanceId) conflict()
      const existing = await findRunByInvocation(em, scope, workflowInstanceId, input.eventId)
      if (existing) return project(existing, agencyCase, true, scraper)

      let persistedRunId: string | null = null
      try {
        await runtime.run(TOV_SOURCE_SCOUT_AGENT_ID, tovSourceScoutInputSchema.parse({
          brand: input.brand,
          people: input.people,
          websiteUrl: input.websiteUrl,
          outputLanguage: input.outputLanguage,
        }), {
          ...scope,
          userId: input.userId,
          workflowInstanceId,
          stepId: TOV_DISCOVERY_STEP_ID,
          invocationId: invocationId(input.eventId),
          onRunPersisted(runId) {
            persistedRunId ??= runId
          },
        })
      } catch (error) {
        const failed = persistedRunId
          ? await findOneWithDecryption(em, AgentRun, { ...scope, id: persistedRunId, agentId: TOV_SOURCE_SCOUT_AGENT_ID, deletedAt: null }, undefined, scope)
          : await findRunByInvocation(em, scope, workflowInstanceId, input.eventId)
        if (failed) return project(failed, agencyCase, false, scraper)
        throw error
      }
      const run = persistedRunId
        ? await findOneWithDecryption(em, AgentRun, { ...scope, id: persistedRunId, agentId: TOV_SOURCE_SCOUT_AGENT_ID, deletedAt: null }, undefined, scope)
        : await findRunByInvocation(em, scope, workflowInstanceId, input.eventId)
      if (!run) missing()
      return project(run, agencyCase, false, scraper)
    },

    async get(rawInput) {
      const input = tovDiscoveryInputSchema.pick({ tenantId: true, organizationId: true, userId: true })
        .extend({ discoveryRunId: tovDiscoveryInputSchema.shape.caseId }).parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      await authorize(container, input.userId, scope, false)
      const run = await findOneWithDecryption(em, AgentRun, {
        ...scope,
        id: input.discoveryRunId,
        agentId: TOV_SOURCE_SCOUT_AGENT_ID,
        stepId: TOV_DISCOVERY_STEP_ID,
        deletedAt: null,
      }, undefined, scope)
      if (!run?.workflowInstanceId) missing()
      const agencyCase = await findOneWithDecryption(em, AgencyCase, {
        ...scope,
        workflowInstanceId: run.workflowInstanceId,
        deletedAt: null,
      }, undefined, scope)
      if (!agencyCase) missing()
      const scopedCase = await readPaidDiscoveryCase(em, scope, agencyCase.id)
      if (scopedCase.workflowInstanceId !== run.workflowInstanceId) missing()
      return project(run, scopedCase, true, scraper)
    },
  }
}
