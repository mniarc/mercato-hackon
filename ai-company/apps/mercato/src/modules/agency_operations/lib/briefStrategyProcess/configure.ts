import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { BRIEF_REVIEW_WORKFLOW_ID } from './contracts'
import { briefReviewWorkflowDefinition } from './workflow'

const configureSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() })
export async function configureBriefReviewWorkflow(container: AppContainer, rawInput: unknown) {
  const input = configureSchema.parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['agency_research.manage'], scope)) {
    throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  }
  const em = container.resolve<EntityManager>('em')
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const existing = await authoring.findOwnedDefinition(em, { workflowId: BRIEF_REVIEW_WORKFLOW_ID, ...scope })
  if (existing) {
    if (existing.metadata?.generatedBy?.module !== 'agency_operations' || existing.metadata.generatedBy.ownerId !== 'brief_review') {
      throw new CrudHttpError(409, { error: 'api.errors.conflict' })
    }
    return { workflowId: existing.workflowId, version: existing.version }
  }
  const created = await authoring.upsertOwnedDefinition(em, {
    ...scope, ownerModule: 'agency_operations', ownerId: 'brief_review', workflowId: BRIEF_REVIEW_WORKFLOW_ID,
    workflowName: 'Brief customer response', definition: briefReviewWorkflowDefinition, actorUserId: input.userId, grantedFeatures: [],
  })
  if (!created.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  return { workflowId: created.definition.workflowId, version: created.definition.version }
}
