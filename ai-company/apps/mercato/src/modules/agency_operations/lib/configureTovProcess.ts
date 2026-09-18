import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import { authorizeWorkflowGrantChange } from '@open-mercato/core/modules/workflows/lib/definition-grant'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { z } from 'zod'
import { AGENCY_TOV_ACTIVITY_ID, AGENCY_TOV_FUNCTION_NAME, AGENCY_TOV_WORKFLOW_ID } from './tovProcess'

export const AGENCY_TOV_GRANTED_FEATURES = ['agency_tov.view', 'agency_tov.manage', 'agent_orchestrator.agents.run']

export const agencyTovWorkflowDefinition = {
  steps: [
    { stepId: 'start', stepName: 'Client material received', stepType: 'START' },
    { stepId: 'tov_research', stepName: 'Tone-of-voice research', stepType: 'AUTOMATED' },
    { stepId: 'end', stepName: 'Research available to agency', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'start_research', fromStepId: 'start', toStepId: 'tov_research', trigger: 'auto', priority: 100 },
    {
      transitionId: 'research_complete', fromStepId: 'tov_research', toStepId: 'end', trigger: 'auto', priority: 100,
      activities: [{
        activityId: AGENCY_TOV_ACTIVITY_ID,
        activityName: 'Tone-of-voice research',
        activityType: 'EXECUTE_FUNCTION',
        async: true,
        retryPolicy: { maxAttempts: 1, initialIntervalMs: 0, backoffCoefficient: 1, maxIntervalMs: 0 },
        config: {
          functionName: AGENCY_TOV_FUNCTION_NAME,
          args: { caseId: '{{context.caseId}}', process: '{{context.process}}' },
        },
      }],
    },
  ],
}

const configurationInputSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() })

export async function configureAgencyTovProcess(container: AppContainer, rawInput: unknown) {
  const input = configurationInputSchema.parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  const rbac = container.resolve<Parameters<typeof authorizeWorkflowGrantChange>[0]>('rbacService')
  const failure = await authorizeWorkflowGrantChange(rbac, {
    userId: input.userId, scope, requested: AGENCY_TOV_GRANTED_FEATURES, current: [],
  })
  if (failure) throw new CrudHttpError(failure.status, failure.body)
  if (!container.hasRegistration('agencyTovResearchService')) {
    throw new Error('[internal] Enable agency_tov and agent_orchestrator before configuring the process')
  }
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const result = await authoring.upsertOwnedDefinition(container.resolve<EntityManager>('em'), {
    ownerModule: 'agency_operations',
    ownerId: 'tone_of_voice',
    workflowId: AGENCY_TOV_WORKFLOW_ID,
    workflowName: 'Agency tone-of-voice research',
    description: 'Runs teammate-owned research on the client case corpus using native agent execution.',
    definition: agencyTovWorkflowDefinition,
    grantedFeatures: AGENCY_TOV_GRANTED_FEATURES,
    ...scope,
    actorUserId: input.userId,
  })
  if (!result.ok) throw new Error('[internal] Agency tone-of-voice workflow is owned by another author')
  return { workflowDefinitionId: result.definition.id, workflowId: result.definition.workflowId, created: result.created }
}
