import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyClientSubmission } from '../../data/entities'
import { PLAN_REVIEW_SERVICE, type PlanReviewService } from '../planReview/contracts'
import { PLANNING_EXECUTION_RESULT_KEY, planningExecutionActivityResultSchema } from './contracts'

const contextSchema = z.object({
  userId: z.uuid(),
  workflowInstance: z.object({ id: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
    tenantId: z.uuid(), organizationId: z.uuid(), context: z.record(z.string(), z.unknown()) }),
})

export function createPlanReviewHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const context = contextSchema.parse(rawContext)
    const result = z.object({ result: planningExecutionActivityResultSchema })
      .parse(context.workflowInstance.context[PLANNING_EXECUTION_RESULT_KEY] ?? context.workflowInstance.context.agencyPlanningExecution).result
    if (result.status !== 'completed' || !result.readyForApproval || result.qaVerdict !== 'ready_for_approval' || !result.planVersionId) {
      return { invitation: null, reason: 'plan_not_ready' }
    }
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const submission = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, caseId: result.orderRef, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Plan review is outside the originating case submission')
    const invitation = await container.resolve<PlanReviewService>(PLAN_REVIEW_SERVICE).invite({
      ...scope, userId: context.userId, caseId: submission.caseId, planVersionId: result.planVersionId,
    })
    return { invitation }
  }
}
