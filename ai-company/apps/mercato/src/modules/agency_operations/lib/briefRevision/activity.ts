import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema } from '../contracts/clientSubmission'
import { createBriefRevisionBinding } from './binding'
import { BRIEF_REVISION_STEP_ID, briefRevisionUnavailableSchema, type NativeBriefRevisionResult } from './contracts'

const contextSchema = z.object({ stepInstanceId: z.uuid().optional(), workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })
const authorizationSchema = z.object({ maxCostPln: z.number().positive() }).strict()

export function createBriefRevisionActivity(container: AppContainer) {
  const binding = createBriefRevisionBinding(container)
  return async (_input: unknown, rawContext: unknown): Promise<NativeBriefRevisionResult> => {
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    const workflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: context.workflowInstance.id, workflowId: context.workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    if (!submission || !workflow) throw new Error('[internal] Brief revision submission is outside the native workflow')
    const request = await binding.load(submission, workflow.context.nativeClientTriageInterpretation)
    if (!request) throw new Error('[internal] Brief revision requires the original invitation response and saved native change decision')
    const saved = z.object({ result: clientSubmissionDispositionSchema }).parse(workflow.context.clientTriageResult).result
    if (saved.kind !== 'change' || saved.source !== 'native_agent' || saved.effectsApplied
      || saved.targets.caseId !== submission.caseId || saved.targets.submissionId !== submission.id
      || saved.targets.documentVersionReference !== request.briefVersionId) {
      throw new Error('[internal] Brief revision does not match the saved G disposition')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Brief revision case is outside the submission scope')
    const unavailable = (reason: z.infer<typeof briefRevisionUnavailableSchema>['reason']) => briefRevisionUnavailableSchema.parse({
      status: 'not_configured', orderRef: agencyCase.id, reason,
    })
    if (!agencyCase.workflowInstanceId) return unavailable('missing_process_configuration')
    const analysis = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: agencyCase.workflowInstanceId, workflowId: 'agency_operations.analysis.v1', deletedAt: null,
    }, undefined, scope)
    if (!analysis) return unavailable('missing_process_configuration')
    const definition = await findOneWithDecryption(em, WorkflowDefinition, {
      ...scope, id: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version, deletedAt: null,
    }, undefined, scope)
    if (!definition || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'analysis') return unavailable('missing_process_configuration')
    const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
      .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === 'agency_operations.runAnalysis')
    const authorization = activities.length === 1 ? authorizationSchema.safeParse(activities[0].config.args?.policy?.briefRevision) : null
    if (!authorization?.success) return unavailable('missing_brief_revision_authorization')
    if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return unavailable('execution_disabled')
    const userId = await resolveWorkflowPrincipalUserId(em, workflow)
    if (!userId) throw new Error('[internal] Brief revision requires the native workflow execution principal')
    return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).runBriefRevision({
      context: { ...scope, userId, workflowInstanceId: workflow.id, stepId: BRIEF_REVISION_STEP_ID,
        ...(context.stepInstanceId ? { invocationId: context.stepInstanceId } : {}) },
      request: { ...request, maxCostPln: authorization.data.maxCostPln },
    })
  }
}
