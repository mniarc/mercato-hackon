import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import { authorizeWorkflowGrantChange } from '@open-mercato/core/modules/workflows/lib/definition-grant'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AGENCY_RESEARCH_SERVICE } from '@/modules/agency_research/lib/contracts'
import { analysisExecutionPolicySchema } from './contracts'
import { assertAnalysisExecutionEnabled } from './activity'
import { AGENCY_ANALYSIS_WORKFLOW_ID, createAgencyAnalysisWorkflowDefinition } from './workflow'
import { configureBriefReviewWorkflow } from '../briefStrategyProcess/configure'
import { configureStrategyPairReviewWorkflow } from '../strategyPairReview/configure'

export const AGENCY_ANALYSIS_GRANTED_FEATURES = ['agency_research.manage', 'agent_orchestrator.agents.run']
const inputSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), policy: analysisExecutionPolicySchema })

export async function configureAgencyAnalysisProcess(container: AppContainer, rawInput: unknown) {
  const input = inputSchema.parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  const failure = await authorizeWorkflowGrantChange(container.resolve<Parameters<typeof authorizeWorkflowGrantChange>[0]>('rbacService'), {
    userId: input.userId, scope, requested: AGENCY_ANALYSIS_GRANTED_FEATURES, current: [],
  })
  if (failure) throw new CrudHttpError(failure.status, failure.body)
  if (!container.hasRegistration(AGENCY_RESEARCH_SERVICE) || !container.hasRegistration('agentWorkflowBridge')) {
    throw new Error('[internal] Agency analysis requires agency_research and agent_orchestrator')
  }
  const em = container.resolve<EntityManager>('em')
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  if (await authoring.findOwnedDefinition(em, { workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, ...scope })) {
    throw new Error('[internal] Analysis is already configured; publish a new native workflow version to change its execution policy')
  }
  if (input.policy.through === '4.2') await configureBriefReviewWorkflow(container, input)
  if (input.policy.strategyExecution || input.policy.planningExecution) await configureStrategyPairReviewWorkflow(container, input)
  const result = await authoring.upsertOwnedDefinition(em, {
    ownerModule: 'agency_operations', ownerId: 'analysis', workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
    workflowName: 'Agency analysis', description: 'Case-scoped teammate research with explicitly authorized execution limits; not payment or client approval.',
    definition: createAgencyAnalysisWorkflowDefinition(input.policy),
    grantedFeatures: AGENCY_ANALYSIS_GRANTED_FEATURES, ...scope, actorUserId: input.userId,
  })
  if (!result.ok) throw new Error('[internal] Analysis workflow belongs to another author')
  return { workflowDefinitionId: result.definition.id, workflowId: result.definition.workflowId, version: result.definition.version }
}

export async function assertAnalysisProcessConfigured(container: AppContainer, scope: { tenantId: string; organizationId: string }) {
  assertAnalysisExecutionEnabled()
  if (!container.hasRegistration(AGENCY_RESEARCH_SERVICE) || !container.hasRegistration('agentWorkflowBridge')) {
    throw new CrudHttpError(409, { error: 'Agency analysis services are unavailable' })
  }
  const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring').findOwnedDefinition(container.resolve<EntityManager>('em'), {
    workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, tenantId: scope.tenantId, organizationId: scope.organizationId,
  })
  if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata?.generatedBy?.ownerId !== 'analysis' || !definition.grantedFeatures?.length) {
    throw new CrudHttpError(409, { error: 'Configure the agency analysis workflow before starting research' })
  }
  return { workflowId: definition.workflowId, version: definition.version }
}
