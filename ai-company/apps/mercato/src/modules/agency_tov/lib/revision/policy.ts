import { isDeepStrictEqual } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getWorkflowInstance } from '@open-mercato/core/modules/workflows/lib/workflow-executor'
import { findDefinitionForInstance } from '@open-mercato/core/modules/workflows/lib/find-definition'
import { TOV_REVISION_FUNCTION, TOV_REVISION_POLICY_KEY, tovRevisionExecutionPolicySchema, tovRevisionPolicySchema, type TovRevisionInput } from './contracts'

export async function readRevisionPolicy(em: EntityManager, input: TovRevisionInput) {
  const proposed = tovRevisionExecutionPolicySchema.safeParse(input.executionPolicy)
  if (!proposed.success) return null
  const { context } = input
  if (!context.workflowInstanceId || !context.stepId || !context.invocationId) return null
  const instance = await getWorkflowInstance(em, context.workflowInstanceId)
  if (!instance || instance.tenantId !== context.tenantId || instance.organizationId !== context.organizationId
    || !['RUNNING', 'PAUSED'].includes(instance.status)) return null
  const definition = await findDefinitionForInstance(em, instance)
  if (!definition || definition.tenantId !== context.tenantId || definition.organizationId !== context.organizationId
    || definition.deletedAt || !definition.enabled || definition.id !== proposed.data.definitionId
    || definition.version !== proposed.data.definitionVersion || instance.version !== definition.version) return null
  const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
    .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === TOV_REVISION_FUNCTION)
  const saved = tovRevisionPolicySchema.safeParse(activities.length === 1 ? activities[0].config.args?.policy?.[TOV_REVISION_POLICY_KEY] : undefined)
  const { definitionId: _id, definitionVersion: _version, ...limits } = proposed.data
  return saved.success && isDeepStrictEqual(saved.data, limits) ? proposed.data : null
}
