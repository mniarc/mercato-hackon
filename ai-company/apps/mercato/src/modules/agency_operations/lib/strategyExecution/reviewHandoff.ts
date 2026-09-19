import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyClientSubmission } from '../../data/entities'
import { STRATEGY_PAIR_REVIEW_SERVICE, type StrategyPairReviewService } from '../strategyPairReview/contracts'
import { STRATEGY_EXECUTION_RESULT_KEY, strategyExecutionActivityResultSchema } from './contracts'

const contextSchema = z.object({
  userId: z.uuid(),
  workflowInstance: z.object({ id: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
    tenantId: z.uuid(), organizationId: z.uuid(), context: z.record(z.string(), z.unknown()) }),
})

export function createStrategyReviewHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const context = contextSchema.parse(rawContext)
    const result = z.object({ result: strategyExecutionActivityResultSchema })
      .parse(context.workflowInstance.context[STRATEGY_EXECUTION_RESULT_KEY]).result
    if (result.status !== 'completed' || result.qaVerdict !== 'ready_for_approval'
      || !result.strategyVersionId || !result.tovVersionId || result.escalationVersionId) {
      return { invitation: null, reason: 'strategy_pair_not_ready' }
    }
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const submission = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, caseId: result.orderRef, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Strategy review is outside the originating case submission')
    const invitation = await container.resolve<StrategyPairReviewService>(STRATEGY_PAIR_REVIEW_SERVICE).invite({
      ...scope, userId: context.userId, caseId: submission.caseId,
      strategyVersionId: result.strategyVersionId, tovVersionId: result.tovVersionId,
    })
    return { invitation }
  }
}
