import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, strategyProcessReferenceSchema, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { STRATEGY_PAIR_CONTINUATION_RESULT_KEY } from '../strategyPairApproval/contracts'
import { PLANNING_EXECUTION_STEP_ID, type NativePlanningExecutionResult } from './contracts'

const contextSchema = z.object({
  stepInstanceId: z.uuid().optional(),
  workflowInstance: z.object({ id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1') }),
})
const pairSchema = z.object({ strategy: z.object({ documentId: z.uuid(), versionId: z.uuid() }), tov: z.object({ documentId: z.uuid(), versionId: z.uuid() }) })
const acceptedPairSchema = z.object({ status: z.literal('accepted'), orderRef: z.string().min(1), pair: pairSchema })
const continuationSchema = z.object({
  status: z.literal('accepted'), orderRef: z.string().min(1), cumulative: acceptedPairSchema,
  planningReadiness: z.object({ status: z.literal('ready'), orderRef: z.string().min(1), accepted: acceptedPairSchema, process: strategyProcessReferenceSchema }),
})
const failureSchema = z.object({ status: z.enum(['not_ready', 'partial', 'accepted']), orderRef: z.string().min(1), reason: z.string().optional(),
  planningReadiness: z.object({ status: z.literal('not_ready'), orderRef: z.string().min(1), reason: z.string().min(1) }).optional(),
})
const authorizationSchema = z.object({ maxCostPln: z.number().positive() }).strict()

export function createPlanningExecutionActivity(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<NativePlanningExecutionResult> => {
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, { ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null }, undefined, scope)
    if (!submission) throw new Error('[internal] Planning execution submission is outside the native workflow')
    const source = await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: context.workflowInstance.id, workflowId: context.workflowInstance.workflowId, deletedAt: null }, undefined, scope)
    const saved = z.object({ result: continuationSchema }).safeParse(source?.context?.[STRATEGY_PAIR_CONTINUATION_RESULT_KEY])
    if (!saved.success) {
      const previous = z.object({ result: failureSchema }).safeParse(source?.context?.[STRATEGY_PAIR_CONTINUATION_RESULT_KEY])
      if (previous.success) {
        const failure = previous.data.result
        if (failure.orderRef !== submission.caseId || (failure.planningReadiness && failure.planningReadiness.orderRef !== submission.caseId)) {
          throw new Error('[internal] Planning readiness belongs to another case')
        }
        return { status: 'not_ready', orderRef: submission.caseId, reason: failure.status === 'partial' ? 'pair_acceptance_incomplete' : failure.planningReadiness?.reason ?? failure.reason ?? 'missing_planning_readiness' }
      }
      return { status: 'not_ready', orderRef: submission.caseId, reason: 'missing_planning_readiness' }
    }
    const continuation = saved.data.result
    const readiness = continuation.planningReadiness
    const response = clientSubmissionRequestSchema.parse(submission.original).strategyReviewResponse
    if (!response || response.kind !== 'approval' || continuation.orderRef !== submission.caseId
      || continuation.cumulative.orderRef !== submission.caseId || readiness.orderRef !== submission.caseId || readiness.accepted.orderRef !== submission.caseId
      || (['strategy', 'tov'] as const).some((kind) =>
        response[kind].documentId !== readiness.accepted.pair[kind].documentId || response[kind].versionId !== readiness.accepted.pair[kind].versionId
        || continuation.cumulative.pair[kind].documentId !== readiness.accepted.pair[kind].documentId || continuation.cumulative.pair[kind].versionId !== readiness.accepted.pair[kind].versionId)) {
      throw new Error('[internal] Saved planning readiness does not belong to the original pair')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Planning execution case is outside the submission scope')
    const unconfigured = { status: 'not_configured' as const, orderRef: agencyCase.id, reason: 'missing_process_configuration' as const }
    if (!agencyCase.workflowInstanceId) return unconfigured
    const analysis = await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: agencyCase.workflowInstanceId, workflowId: 'agency_operations.analysis.v1', deletedAt: null }, undefined, scope)
    if (!analysis || analysis.definitionId !== readiness.process.workflowDefinitionId || analysis.workflowId !== readiness.process.workflowId || analysis.version !== readiness.process.version) return unconfigured
    const definition = await findOneWithDecryption(em, WorkflowDefinition, { ...scope, id: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version, deletedAt: null }, undefined, scope)
    if (!definition || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'analysis') return unconfigured
    const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
      .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === 'agency_operations.runAnalysis')
    const authorization = activities.length === 1 ? authorizationSchema.safeParse(activities[0].config.args?.policy?.planningExecution) : null
    if (!authorization?.success) return { status: 'not_configured', orderRef: agencyCase.id, reason: 'missing_planning_authorization' }
    if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return { status: 'not_configured', orderRef: agencyCase.id, reason: 'execution_disabled' }
    const userId = await resolveWorkflowPrincipalUserId(em, source!)
    if (!userId) throw new Error('[internal] Planning execution requires the native workflow execution principal')
    return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).runPlanning({
      context: { ...scope, userId, workflowInstanceId: source!.id, stepId: PLANNING_EXECUTION_STEP_ID,
        ...(context.stepInstanceId ? { invocationId: context.stepInstanceId } : {}) },
      request: { orderRef: agencyCase.id, strategyVersionId: readiness.accepted.pair.strategy.versionId,
        tovVersionId: readiness.accepted.pair.tov.versionId, process: readiness.process, maxCostPln: authorization.data.maxCostPln },
    })
  }
}
