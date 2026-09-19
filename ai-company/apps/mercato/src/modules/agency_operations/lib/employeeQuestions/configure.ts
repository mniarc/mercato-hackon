import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { EMPLOYEE_QUESTION_WORKFLOW_ID } from './contracts'
import { employeeQuestionWorkflowDefinition } from './workflow'

export async function configureEmployeeQuestionWorkflow(container: AppContainer, rawInput: unknown) {
  const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['workflows.definitions.edit'], scope)) {
    throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  }
  const em = container.resolve<EntityManager>('em')
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const existing = await authoring.findOwnedDefinition(em, { ...scope, workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID })
  if (existing) {
    if (existing.metadata?.generatedBy?.module !== 'agency_operations' || existing.metadata.generatedBy.ownerId !== 'employee_question') {
      throw new CrudHttpError(409, { error: 'api.errors.conflict' })
    }
    return { workflowId: existing.workflowId, version: existing.version }
  }
  const result = await authoring.upsertOwnedDefinition(em, {
    ...scope, ownerModule: 'agency_operations', ownerId: 'employee_question', workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID,
    workflowName: 'Employee question to customer', definition: employeeQuestionWorkflowDefinition, actorUserId: input.userId, grantedFeatures: [],
  })
  if (!result.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  return { workflowId: result.definition.workflowId, version: result.definition.version }
}
