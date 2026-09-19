import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import { authorizeWorkflowGrantChange } from '@open-mercato/core/modules/workflows/lib/definition-grant'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { z } from 'zod'
import { nativeClientSubmissionDefinition, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from './workflow'

const configurationInputSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() })
export const CLIENT_TRIAGE_GRANTED_FEATURES = ['agent_orchestrator.agents.run']

export async function configureNativeClientTriage(container: AppContainer, rawInput: unknown) {
  const input = configurationInputSchema.parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  const rbac = container.resolve<Parameters<typeof authorizeWorkflowGrantChange>[0]>('rbacService')
  const failure = await authorizeWorkflowGrantChange(rbac, {
    userId: input.userId, scope, requested: CLIENT_TRIAGE_GRANTED_FEATURES, current: [],
  })
  if (failure) throw new CrudHttpError(failure.status, failure.body)
  if (!container.hasRegistration('agentWorkflowBridge')) throw new Error('[internal] Native triage requires agent_orchestrator')
  const em = container.resolve<EntityManager>('em')
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const existing = await authoring.findOwnedDefinition(em, { workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, ...scope })
  if (existing) {
    throw new Error('[internal] Native triage definition already exists; use native workflow version publishing instead of overwriting running configuration')
  }
  const result = await authoring.upsertOwnedDefinition(em, {
    ownerModule: 'agency_operations', ownerId: 'client_triage',
    workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID,
    workflowName: 'Agency client submission triage',
    description: 'Native typed triage, saved answer/clarification and same-workflow employee recovery. Other business routes remain unapplied.',
    definition: nativeClientSubmissionDefinition,
    grantedFeatures: CLIENT_TRIAGE_GRANTED_FEATURES,
    ...scope, actorUserId: input.userId,
  })
  if (!result.ok) throw new Error('[internal] Native triage definition is owned by another author')
  return { workflowDefinitionId: result.definition.id, workflowId: result.definition.workflowId, version: result.definition.version }
}
