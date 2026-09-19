import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { WorkflowDefinition } from '@open-mercato/core/modules/workflows/data/entities'
import { authorizeWorkflowGrantChange, syncWorkflowDefinitionPrincipal } from '@open-mercato/core/modules/workflows/lib/definition-grant'
import { AGENCY_ANALYSIS_GRANTED_FEATURES } from '../../../lib/analysisProcess/configure'
import { createAgencyAnalysisWorkflowDefinition, AGENCY_ANALYSIS_WORKFLOW_ID } from '../../../lib/analysisProcess/workflow'
import { analysisExecutionPolicySchema } from '../../../lib/analysisProcess/contracts'
import { configureBriefReviewWorkflow } from '../../../lib/briefStrategyProcess/configure'
import { configureStrategyPairReviewWorkflow } from '../../../lib/strategyPairReview/configure'
import { configurePlanReviewWorkflow } from '../../../lib/planReview/configure'
import { configurePostReviewWorkflow } from '../../../lib/postReview/configure'
import nativePostPolicy from '../nativePostPolicy.json'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '../../../../agency_research/lib/contracts'
import { nativeClientSubmissionDefinition, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../../../agents/client-triage/workflow'
import { workflowDefinitionDataSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchTaskRun } from '../../../../agency_research/data/entities'
import { readJourneyMode } from './mode'
import { STAFF_TOV_INTAKE_SERVICE, type StaffTovIntakeService } from '../../../lib/tovIntake/contracts'

async function open() {
  await bootstrapFromAppRoot(path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato')))
  return createRequestContainer()
}

async function configureCurrentTriageDefinition(
  container: Awaited<ReturnType<typeof open>>, em: EntityManager,
  input: { tenantId: string; organizationId: string; userId: string },
): Promise<string[]> {
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  const triage = await em.findOne(WorkflowDefinition, { workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, ...scope, enabled: true, lifecycle: 'published' }, { orderBy: { version: 'DESC' } })
  if (!triage || triage.metadata?.generatedBy?.ownerId !== 'client_triage') throw new Error('Configure the owned native client triage definition before this journey')
  if (!triage.grantedFeatures?.includes('agent_orchestrator.agents.run')) throw new Error('Native triage requires its existing authorized execution grant')
  if (JSON.stringify(workflowDefinitionDataSchema.parse(triage.definition)) !== JSON.stringify(workflowDefinitionDataSchema.parse(nativeClientSubmissionDefinition))) {
    const grantFailure = await authorizeWorkflowGrantChange(container.resolve('rbacService'), {
      userId: input.userId, scope, requested: triage.grantedFeatures ?? [], current: [],
    })
    if (grantFailure) throw new Error(`Cannot publish the native triage execution grant: ${grantFailure.status}`)
    const latestTriage = await em.findOne(WorkflowDefinition, { workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, tenantId: input.tenantId }, { orderBy: { version: 'DESC' } })
    const nextTriage = em.create(WorkflowDefinition, {
      id: randomUUID(), ...scope, workflowId: triage.workflowId, workflowName: triage.workflowName,
      description: triage.description, version: (latestTriage?.version ?? 0) + 1,
      definition: workflowDefinitionDataSchema.parse(nativeClientSubmissionDefinition),
      enabled: true, lifecycle: 'published', grantedFeatures: triage.grantedFeatures ?? [],
      metadata: { ...triage.metadata, tags: [...(triage.metadata?.tags ?? []), 'fixture:agency-journey'] },
      createdBy: input.userId, updatedBy: input.userId, createdAt: new Date(), updatedAt: new Date(),
    })
    await syncWorkflowDefinitionPrincipal(container, nextTriage)
    em.persist(nextTriage)
    return [nextTriage.id]
  }
  return []
}

export async function configureCurrentTriageJourney(input: { tenantId: string; organizationId: string; userId: string }): Promise<string[]> {
  if (process.env.NODE_ENV === 'production' || process.env.AGENCY_TEST_NATIVE_TRIAGE !== '1') {
    throw new Error('The recovery journey requires explicit local native triage mode')
  }
  const container = await open()
  try {
    const em = container.resolve<EntityManager>('em').fork()
    const definitionIds = await configureCurrentTriageDefinition(container, em, input)
    await em.flush()
    return definitionIds
  } finally { await container.dispose() }
}

export async function configureProductionJourney(input: {
  tenantId: string; organizationId: string; userId: string; productSelection: unknown; includePost?: boolean;
}): Promise<string[]> {
  const mode = readJourneyMode()
  if (!process.env.AGENCY_TEST_RESEARCH_FIXTURE_DIR) throw new Error('Select the source-material fixture directory independently of intelligence mode')
  const container = await open()
  try {
    const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
    const failure = await authorizeWorkflowGrantChange(container.resolve('rbacService'), {
      userId: input.userId, scope, requested: AGENCY_ANALYSIS_GRANTED_FEATURES, current: [],
    })
    if (failure) throw new Error(`Cannot configure the native fixture execution grant: ${failure.status}`)
    await configureBriefReviewWorkflow(container, input)
    await configureStrategyPairReviewWorkflow(container, input)
    await configurePlanReviewWorkflow(container, input)
    if (input.includePost) await configurePostReviewWorkflow(container, input)
    const em = container.resolve<EntityManager>('em').fork()
    const specialist = await em.findOne(WorkflowDefinition, { workflowId: 'agency_operations.tov-research.v1', ...scope, enabled: true, lifecycle: 'published' })
    if (!specialist || specialist.metadata?.generatedBy?.ownerId !== 'tone_of_voice') {
      throw new Error('Configure the owned native ToV specialist with configure-tov before this journey')
    }
    const definitionIds = await configureCurrentTriageDefinition(container, em, input)
    const latest = await em.findOne(WorkflowDefinition, { workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, tenantId: input.tenantId }, { orderBy: { version: 'DESC' } })
    const policy = analysisExecutionPolicySchema.parse(mode === 'live'
      ? JSON.parse(fs.readFileSync(process.env.AGENCY_JOURNEY_POLICY_FILE!, 'utf8'))
      : { through: '4.2', maxCostPln: 20,
      briefRevision: { maxCostPln: 10 }, strategyExecution: { maxCostPln: 20 }, planningExecution: { maxCostPln: 20 },
      ...(input.includePost ? { postExecution: nativePostPolicy.postExecution } : {}),
      productSelection: input.productSelection })
    if (JSON.stringify(policy.productSelection) !== JSON.stringify(analysisExecutionPolicySchema.parse({ ...policy, productSelection: input.productSelection }).productSelection)) {
      throw new Error('The approved execution policy must match this exact purchased offer')
    }
    // A new, real native version with its own execution principal. No existing
    // definition or active instance is rewritten to authorize this test journey.
    const definition = em.create(WorkflowDefinition, {
      id: randomUUID(), ...scope, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, workflowName: `Owned brief-to-plan journey (${mode} intelligence)`,
      version: (latest?.version ?? 0) + 1, definition: createAgencyAnalysisWorkflowDefinition(policy),
      enabled: true, lifecycle: 'published', grantedFeatures: AGENCY_ANALYSIS_GRANTED_FEATURES,
      metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' }, tags: ['fixture:TC-AGENCY-002'] },
      createdBy: input.userId, updatedBy: input.userId, createdAt: new Date(), updatedAt: new Date(),
    })
    await syncWorkflowDefinitionPrincipal(container, definition)
    em.persist(definition)
    await em.flush()
    return [...definitionIds, definition.id]
  } finally { await container.dispose() }
}

export async function readProducedBrief(scope: { tenantId: string; organizationId: string }, caseId: string, versionId: string) {
  const container = await open()
  try {
    const review = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getBriefReview(scope, caseId, versionId)
    if (!review) return null
    const run = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyResearchTaskRun, {
      ...scope, orderRef: caseId, stepId: '4.2', outputVersionId: versionId,
    }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
    return { ...review, qaDetails: run?.qaResult }
  }
  finally { await container.dispose() }
}

export async function readSpecialistForCase(input: { tenantId: string; organizationId: string; caseId: string }) {
  const container = await open()
  try { return await container.resolve<StaffTovIntakeService>(STAFF_TOV_INTAKE_SERVICE).resolveForCase(input) }
  finally { await container.dispose() }
}

export async function removeProductionJourneyDefinition(input: { id: string; tenantId: string; organizationId: string }): Promise<void> {
  const container = await open()
  try {
    const em = container.resolve<EntityManager>('em').fork()
    const definition = await em.findOne(WorkflowDefinition, { ...input })
    if (!definition || !definition.metadata?.tags?.some((tag) => ['fixture:TC-AGENCY-002', 'fixture:agency-journey'].includes(tag))) return
    const used = await em.getConnection().execute('select id from workflow_instances where definition_id=? limit 1', [input.id])
    if (used.length) throw new Error('The test-owned analysis definition still has an instance; preserve it rather than delete live configuration')
    const previousFeatures = definition.grantedFeatures
    definition.grantedFeatures = []
    await syncWorkflowDefinitionPrincipal(container, definition, { previousFeatures })
    em.remove(definition)
    await em.flush()
  } finally { await container.dispose() }
}
