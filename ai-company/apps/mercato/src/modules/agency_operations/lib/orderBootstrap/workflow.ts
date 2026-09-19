import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'

export const DEMO_PURCHASE_WORKFLOW_ID = 'agency_operations.demo-purchase.v1'
export const DEMO_PURCHASE_WORKER_ID = 'agency_operations.demo-purchase.awaiting-execution.v1'
export const demoPurchaseWorkflowDefinition: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Verified demo payment received', stepType: 'START' },
    { stepId: 'awaiting_execution', stepName: 'Demo case awaiting execution', stepType: 'WAIT_FOR_SIGNAL', signalConfig: { signalName: 'agency.demo-purchase.execution-authorized' } },
  ],
  transitions: [{ transitionId: 'await_execution', fromStepId: 'start', toStepId: 'awaiting_execution', trigger: 'auto' }],
}

export async function configureDemoPurchaseWorkflow(container: AppContainer, rawInput: unknown) {
  const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['workflows.manage'], scope)) {
    throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  }
  const em = container.resolve<EntityManager>('em')
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const existing = await authoring.findOwnedDefinition(em, { ...scope, workflowId: DEMO_PURCHASE_WORKFLOW_ID })
  if (existing) {
    if (!existing.enabled || existing.metadata?.generatedBy?.module !== 'agency_operations' || existing.metadata.generatedBy.ownerId !== 'demo_purchase') {
      throw new CrudHttpError(409, { error: 'api.errors.conflict' })
    }
    return { workflowDefinitionId: existing.id, workflowId: existing.workflowId, version: existing.version }
  }
  const created = await authoring.upsertOwnedDefinition(em, {
    ...scope, ownerModule: 'agency_operations', ownerId: 'demo_purchase', workflowId: DEMO_PURCHASE_WORKFLOW_ID,
    workflowName: 'Demo purchase awaiting execution', definition: demoPurchaseWorkflowDefinition,
    actorUserId: input.userId, grantedFeatures: [],
  })
  if (!created.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  return { workflowDefinitionId: created.definition.id, workflowId: created.definition.workflowId, version: created.definition.version }
}
