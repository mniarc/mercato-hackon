import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import { authorizeWorkflowGrantChange } from '@open-mercato/core/modules/workflows/lib/definition-grant'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { z } from 'zod'
import { nativeClientSubmissionDefinition, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from './workflow'
import { TOV_REVISION_FUNCTION, tovCorrectionPolicySchema } from '../../lib/tovRevision/contracts'

const configurationInputSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), tovRevision: tovCorrectionPolicySchema.optional() })
export const CLIENT_TRIAGE_GRANTED_FEATURES = ['agent_orchestrator.agents.run', 'agency_research.manage']

/** Explicit staff policy only; old/default definitions cannot authorize specialist correction. */
export function clientTriageDefinitionWithTovRevision(rawPolicy?: unknown) {
  const definition = structuredClone(nativeClientSubmissionDefinition)
  if (rawPolicy === undefined) return definition
  const { pairQaMaxCostPln, ...agencyTovRevision } = tovCorrectionPolicySchema.parse(rawPolicy)
  const activity = definition.transitions.flatMap((transition) => transition.activities ?? [])
    .find((entry) => entry.activityType === 'EXECUTE_FUNCTION' && entry.config.functionName === TOV_REVISION_FUNCTION)
  if (!activity) throw new Error('[internal] Native ToV correction activity is missing')
  activity.config.args = { policy: { agencyTovRevision, pairQaMaxCostPln } }
  return definition
}

export async function configureNativeClientTriage(container: AppContainer, rawInput: unknown) {
  const input = configurationInputSchema.parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  const grantedFeatures = input.tovRevision ? [...CLIENT_TRIAGE_GRANTED_FEATURES, 'agency_tov.manage'] : CLIENT_TRIAGE_GRANTED_FEATURES
  const rbac = container.resolve<Parameters<typeof authorizeWorkflowGrantChange>[0]>('rbacService')
  const failure = await authorizeWorkflowGrantChange(rbac, {
    userId: input.userId, scope, requested: grantedFeatures, current: [],
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
    description: 'Native typed triage, saved answer/clarification, exact brief acceptance and same-workflow employee recovery. Other business routes remain unapplied.',
    definition: clientTriageDefinitionWithTovRevision(input.tovRevision),
    grantedFeatures,
    ...scope, actorUserId: input.userId,
  })
  if (!result.ok) throw new Error('[internal] Native triage definition is owned by another author')
  return { workflowDefinitionId: result.definition.id, workflowId: result.definition.workflowId, version: result.definition.version }
}
