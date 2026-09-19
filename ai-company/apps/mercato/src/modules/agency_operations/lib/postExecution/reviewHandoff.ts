import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { POST_REVIEW_SERVICE, type PostReviewService } from '../postReview/contracts'
import { POST_EXECUTION_RESULT_KEY, postExecutionActivityResultSchema, type NativePostExecutionResult, type PostReviewHandoffResult } from './contracts'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'), tenantId: z.uuid(), organizationId: z.uuid(),
}) })

export function createPostReviewHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<PostReviewHandoffResult> => {
    const { workflowInstance } = contextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const source = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    if (!source) throw new Error('[internal] Post review requires the originating native workflow')
    const saved = z.object({ result: postExecutionActivityResultSchema }).safeParse(source.context[POST_EXECUTION_RESULT_KEY] ?? source.context.agencyPostExecution)
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: source.id, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Post review is outside the originating case selection')
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Post review case is outside the submission scope')
    if (!saved.success) return { status: 'blocked', orderRef: agencyCase.id, invitation: null,
      reason: 'missing_post_execution', nextAction: 'reconcile_execution', execution: null }
    const result = saved.data.result
    if (result.orderRef !== submission.caseId || ('selectionSubmissionId' in result && result.selectionSubmissionId !== submission.id)) {
      throw new Error('[internal] Post review is outside the originating case selection')
    }
    if (result.status !== 'completed' || !result.readyForReview || result.qaVerdict !== 'pass_for_draft' || !result.postVersionId || result.escalationVersionId) {
      return blockedHandoff(result)
    }
    const userId = await resolveWorkflowPrincipalUserId(em, source)
    if (!userId) throw new Error('[internal] Post review requires the native workflow execution principal')
    const invitation = await container.resolve<PostReviewService>(POST_REVIEW_SERVICE).invite({
      ...scope, userId, caseId: agencyCase.id, postVersionId: result.postVersionId,
    })
    return { status: 'invited', orderRef: result.orderRef, invitation }
  }
}

function blockedHandoff(execution: NativePostExecutionResult): Extract<PostReviewHandoffResult, { status: 'blocked' }> {
  const blocked = { status: 'blocked' as const, orderRef: execution.orderRef, invitation: null, execution }
  if (execution.status === 'not_configured') return { ...blocked, reason: execution.reason, nextAction: 'review_configuration' }
  if (execution.status === 'not_ready') return { ...blocked, reason: execution.reason, nextAction: 'review_dependencies' }
  if (execution.status === 'execution_incomplete') return { ...blocked, reason: execution.reason, nextAction: 'reconcile_execution' }
  return { ...blocked, reason: execution.status === 'paused_budget' ? 'paused_budget' : 'post_not_ready',
    nextAction: execution.escalationVersionId ? 'review_employee_exception' : 'review_qa' }
}
