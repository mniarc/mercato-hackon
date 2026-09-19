import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { STRATEGY_PAIR_REVIEW_WORKFLOW_ID } from './contracts'
import { strategyPairReviewWorkflowDefinition } from './workflow'

export async function configureStrategyPairReviewWorkflow(container: AppContainer, rawInput: unknown) {
  const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['agency_research.manage'], scope)) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  const em = container.resolve<EntityManager>('em')
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const existing = await authoring.findOwnedDefinition(em, { workflowId: STRATEGY_PAIR_REVIEW_WORKFLOW_ID, ...scope })
  if (existing) {
    if (existing.metadata?.generatedBy?.module !== 'agency_operations' || existing.metadata.generatedBy.ownerId !== 'strategy_pair_review') throw new CrudHttpError(409, { error: 'api.errors.conflict' })
    return { workflowId: existing.workflowId, version: existing.version }
  }
  const created = await authoring.upsertOwnedDefinition(em, {
    ...scope, ownerModule: 'agency_operations', ownerId: 'strategy_pair_review', workflowId: STRATEGY_PAIR_REVIEW_WORKFLOW_ID,
    workflowName: 'Strategy and tone-of-voice customer response', definition: strategyPairReviewWorkflowDefinition, actorUserId: input.userId, grantedFeatures: [],
  })
  if (!created.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  return { workflowId: created.definition.workflowId, version: created.definition.version }
}
