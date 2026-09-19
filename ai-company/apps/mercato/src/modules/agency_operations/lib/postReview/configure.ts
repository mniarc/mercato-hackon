import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { POST_REVIEW_WORKFLOW_ID } from './contracts'
import { postReviewWorkflowDefinition } from './workflow'

export async function configurePostReviewWorkflow(container: AppContainer, rawInput: unknown) {
  const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['agency_research.manage'], scope)) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  const em = container.resolve<EntityManager>('em')
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const existing = await authoring.findOwnedDefinition(em, { workflowId: POST_REVIEW_WORKFLOW_ID, ...scope })
  if (existing) {
    if (existing.metadata?.generatedBy?.module !== 'agency_operations' || existing.metadata.generatedBy.ownerId !== 'post_review') throw new CrudHttpError(409, { error: 'api.errors.conflict' })
    return { workflowId: existing.workflowId, version: existing.version }
  }
  const created = await authoring.upsertOwnedDefinition(em, {
    ...scope, ownerModule: 'agency_operations', ownerId: 'post_review', workflowId: POST_REVIEW_WORKFLOW_ID,
    workflowName: 'Post content review', definition: postReviewWorkflowDefinition, actorUserId: input.userId, grantedFeatures: [],
  })
  if (!created.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  return { workflowId: created.definition.workflowId, version: created.definition.version }
}


