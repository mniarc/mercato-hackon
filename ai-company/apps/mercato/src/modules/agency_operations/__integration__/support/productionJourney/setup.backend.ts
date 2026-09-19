import { randomUUID } from 'node:crypto'
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

async function open() {
  await bootstrapFromAppRoot(path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato')))
  return createRequestContainer()
}

export async function configureProductionJourney(input: {
  tenantId: string; organizationId: string; userId: string; productSelection: unknown; includePost?: boolean;
}): Promise<string[]> {
  if (process.env.NODE_ENV === 'production' || process.env.AGENCY_TEST_NATIVE_TRIAGE !== '1'
    || !process.env.AGENCY_TEST_RESEARCH_FIXTURE_DIR) throw new Error('The production journey requires explicit local source and intelligence fixtures')
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
    const triage = await em.findOne(WorkflowDefinition, { workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, ...scope, enabled: true, lifecycle: 'published' }, { orderBy: { version: 'DESC' } })
    if (!triage || triage.metadata?.generatedBy?.ownerId !== 'client_triage') throw new Error('Configure the owned native client triage definition before this journey')
    const definitionIds: string[] = []
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
        metadata: { ...triage.metadata, tags: [...(triage.metadata?.tags ?? []), 'fixture:TC-AGENCY-002'] },
        createdBy: input.userId, updatedBy: input.userId, createdAt: new Date(), updatedAt: new Date(),
      })
      await syncWorkflowDefinitionPrincipal(container, nextTriage)
      em.persist(nextTriage)
      definitionIds.push(nextTriage.id)
    }
    const latest = await em.findOne(WorkflowDefinition, { workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, tenantId: input.tenantId }, { orderBy: { version: 'DESC' } })
    const policy = analysisExecutionPolicySchema.parse({ through: '4.2', maxCostPln: 20,
      briefRevision: { maxCostPln: 10 }, strategyExecution: { maxCostPln: 20 }, planningExecution: { maxCostPln: 20 },
      ...(input.includePost ? { postExecution: nativePostPolicy.postExecution } : {}),
      productSelection: input.productSelection })
    // A new, real native version with its own execution principal. No existing
    // definition or active instance is rewritten to authorize this test journey.
    const definition = em.create(WorkflowDefinition, {
      id: randomUUID(), ...scope, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, workflowName: 'Fixture-only brief-to-plan journey',
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

export async function removeProductionJourneyDefinition(input: { id: string; tenantId: string; organizationId: string }): Promise<void> {
  const container = await open()
  try {
    const em = container.resolve<EntityManager>('em').fork()
    const definition = await em.findOne(WorkflowDefinition, { ...input })
    if (!definition || !definition.metadata?.tags?.includes('fixture:TC-AGENCY-002')) return
    const used = await em.getConnection().execute('select id from workflow_instances where definition_id=? limit 1', [input.id])
    if (used.length) throw new Error('The test-owned analysis definition still has an instance; preserve it rather than delete live configuration')
    const previousFeatures = definition.grantedFeatures
    definition.grantedFeatures = []
    await syncWorkflowDefinitionPrincipal(container, definition, { previousFeatures })
    em.remove(definition)
    await em.flush()
  } finally { await container.dispose() }
}
