import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyClientSubmission } from '../../data/entities'
import { PLAN_REVIEW_SERVICE, type PlanReviewService } from '../planReview/contracts'
import { PLANNING_EXECUTION_RESULT_KEY, planningExecutionActivityResultSchema, type NativePlanningExecutionResult, type PlanningReviewHandoffResult } from './contracts'

const contextSchema = z.object({
  userId: z.uuid(),
  workflowInstance: z.object({ id: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
    tenantId: z.uuid(), organizationId: z.uuid(), context: z.record(z.string(), z.unknown()) }),
})

function blockedHandoff(result: NativePlanningExecutionResult): Extract<PlanningReviewHandoffResult, { status: 'blocked' }> {
  const blocked = { status: 'blocked' as const, orderRef: result.orderRef, invitation: null }
  if (result.status === 'not_configured') {
    return { ...blocked, reason: result.reason, nextAction: 'review_configuration' }
  }
  if (result.status === 'not_ready') {
    return { ...blocked, reason: result.reason, templateId: result.templateId,
      nextAction: result.reason === 'missing_process_configuration' ? 'review_configuration' : 'review_dependencies' }
  }
  if (result.status === 'execution_incomplete') {
    return { ...blocked, reason: result.reason, activationTaskRunId: result.activationTaskRunId, nextAction: 'reconcile_execution' }
  }
  return { ...blocked, reason: result.status === 'paused_budget' ? 'paused_budget' : 'plan_not_ready',
    nextAction: result.escalationVersionId ? 'review_employee_exception' : 'review_qa' }
}

export function createPlanReviewHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<PlanningReviewHandoffResult> => {
    const context = contextSchema.parse(rawContext)
    const result = z.object({ result: planningExecutionActivityResultSchema })
      .parse(context.workflowInstance.context[PLANNING_EXECUTION_RESULT_KEY] ?? context.workflowInstance.context.agencyPlanningExecution).result
    if (result.status !== 'completed' || !result.readyForApproval || result.qaVerdict !== 'ready_for_approval' || !result.planVersionId || result.escalationVersionId) {
      return blockedHandoff(result)
    }
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const submission = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, caseId: result.orderRef, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Plan review is outside the originating case submission')
    const invitation = await container.resolve<PlanReviewService>(PLAN_REVIEW_SERVICE).invite({
      ...scope, userId: context.userId, caseId: submission.caseId, planVersionId: result.planVersionId,
    })
    return { status: 'invited', orderRef: result.orderRef, invitation }
  }
}
