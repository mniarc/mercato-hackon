import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AGENCY_RESEARCH_SERVICE, strategyProcessReferenceSchema, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { assertAnalysisExecutionEnabled } from '../analysisProcess/activity'
import { STRATEGY_READINESS_RESULT_KEY } from '../strategyHandoff/contracts'
import { STRATEGY_EXECUTION_STEP_ID, strategyExecutionActivityResultSchema, type NativeStrategyExecutionResult } from './contracts'

const contextSchema = z.object({
  userId: z.uuid(), stepInstanceId: z.uuid().optional(),
  workflowInstance: z.object({ id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1') }),
})
const readinessSchema = z.object({
  status: z.literal('ready'), orderRef: z.string().min(1),
  brief: z.object({ versionId: z.uuid() }),
  acceptance: z.object({ documentVersionId: z.uuid(), source: z.object({ submissionId: z.uuid(), workflowInstanceId: z.uuid() }) }),
  process: strategyProcessReferenceSchema,
})
const authorizationSchema = z.object({ maxCostPln: z.number().positive() }).strict()

/** Continues the accepted case through the teammate's existing phase runner. */
export function createStrategyExecutionActivity(container: AppContainer) {
  return async (_args: unknown, rawContext: unknown): Promise<NativeStrategyExecutionResult> => {
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Strategy execution submission is outside the native workflow')
    const source = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: context.workflowInstance.id, workflowId: context.workflowInstance.workflowId,
    }, undefined, scope)
    const previousReadiness = z.object({ result: strategyExecutionActivityResultSchema }).safeParse(source?.context?.[STRATEGY_READINESS_RESULT_KEY])
    if (previousReadiness.success && previousReadiness.data.result.status === 'not_ready') {
      if (previousReadiness.data.result.orderRef !== submission.caseId) throw new Error('[internal] Strategy readiness belongs to another case')
      return previousReadiness.data.result
    }
    const saved = z.object({ result: readinessSchema }).safeParse(source?.context?.[STRATEGY_READINESS_RESULT_KEY])
    if (!saved.success) return { status: 'not_configured', orderRef: submission.caseId, reason: 'missing_process_configuration' }
    const readiness = saved.data.result
    if (readiness.orderRef !== submission.caseId || readiness.acceptance.source.submissionId !== submission.id
      || readiness.acceptance.source.workflowInstanceId !== context.workflowInstance.id
      || readiness.acceptance.documentVersionId !== readiness.brief.versionId) {
      throw new Error('[internal] Saved strategy readiness does not belong to the original acceptance')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Strategy execution case is outside the submission scope')
    const unconfigured = { status: 'not_configured' as const, orderRef: agencyCase.id, reason: 'missing_process_configuration' as const }
    if (!agencyCase.workflowInstanceId) return unconfigured
    const analysis = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: agencyCase.workflowInstanceId, workflowId: 'agency_operations.analysis.v1',
    }, undefined, scope)
    if (!analysis || analysis.definitionId !== readiness.process.workflowDefinitionId
      || analysis.workflowId !== readiness.process.workflowId || analysis.version !== readiness.process.version) return unconfigured
    const definition = await findOneWithDecryption(em, WorkflowDefinition, {
      ...scope, id: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version, deletedAt: null,
    }, undefined, scope)
    if (!definition || definition.metadata?.generatedBy?.module !== 'agency_operations'
      || definition.metadata.generatedBy.ownerId !== 'analysis') return unconfigured
    const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
      .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === 'agency_operations.runAnalysis')
    // Exactly one original configured analysis activity; never read a client payload,
    // guessed latest version or the analysis-only cap as strategy authorization.
    const authorization = activities.length === 1
      ? authorizationSchema.safeParse(activities[0].config.args?.policy?.strategyExecution)
      : null
    if (!authorization?.success) return { status: 'not_configured', orderRef: agencyCase.id, reason: 'missing_strategy_authorization' }
    try {
      assertAnalysisExecutionEnabled()
    } catch (error) {
      if (!isCrudHttpError(error) || error.status !== 409) throw error
      return { status: 'not_configured', orderRef: agencyCase.id, reason: 'execution_disabled' }
    }
    return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).runStrategy({
      context: { ...scope, userId: context.userId, workflowInstanceId: source!.id, stepId: STRATEGY_EXECUTION_STEP_ID,
        invocationId: context.stepInstanceId ?? source!.id },
      request: { orderRef: agencyCase.id, briefVersionId: readiness.brief.versionId, acceptanceSubmissionId: submission.id,
        process: readiness.process, maxCostPln: authorization.data.maxCostPln },
    })
  }
}
