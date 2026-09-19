import { z } from 'zod'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { documentReviewSchema } from '@/modules/agency/data/document-review'

export const PLAN_REVIEW_SERVICE = 'agencyPlanReviewService'
export const PLAN_REVIEW_WORKFLOW_ID = 'agency_operations.plan-review.v1'
export const PLAN_REVIEW_FORM_KEY = 'agency.plan-review'
export const PLAN_REVIEW_CONTEXT_KEY = 'planInvitation'
export const PLAN_RESPONSE_CONTEXT_KEY = 'planResponse'
export const PLAN_RESPONSE_FUNCTION = 'agency_operations.receivePlanResponse'
export const planReviewSchema = z.object({
  caseId: z.uuid(), plan: documentReviewSchema,
  topics: z.array(z.object({ topicId: z.string().min(1), title: z.string().min(1), recommended: z.boolean() })).min(1),
  recommendedTopicId: z.string().min(1),
  selectedTopicId: z.string().min(1).optional(),
})
export const planReviewReadSchema = z.object({ ok: z.literal(true), review: planReviewSchema, canRespond: z.boolean() })
export const planReviewInvitationSchema = z.object({ caseId: z.uuid(), customerEntityId: z.uuid(), customerUserId: z.uuid(), review: planReviewSchema })
export const planReviewRequestSchema = z.object({
  channel: z.literal('portal'), kind: z.enum(['approval', 'message']),
  plan: z.object({ documentId: z.uuid(), versionId: z.uuid() }).strict(),
  approvePlan: z.literal(true).optional(), selectedTopicId: z.string().trim().min(1).optional(),
  externalEventId: z.string().min(1).max(200), body: z.string().max(20000).optional(),
}).strict().superRefine((input, context) => {
  if (input.kind === 'approval' && (input.approvePlan !== true || !input.selectedTopicId || input.body !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Approval requires explicit plan approval and one topic, without a message body' })
  }
  if (input.kind === 'message' && (!input.body?.trim() || input.approvePlan !== undefined || input.selectedTopicId !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Message requires a body and no approval or topic selection' })
  }
})
export const planReviewReceiptSchema = z.object({ requestId: z.uuid(), status: z.literal('response_received'), replayed: z.boolean() })
export type PlanReviewRequest = z.infer<typeof planReviewRequestSchema>
export type PlanReviewService = {
  invite(input: { caseId: string; planVersionId: string; tenantId: string; organizationId: string; userId: string }): Promise<{ workflowInstanceId: string; taskId: string; replayed: boolean }>
  read(auth: CustomerAuthContext, taskId: string): Promise<z.infer<typeof planReviewReadSchema>>
  respond(auth: CustomerAuthContext, taskId: string, input: PlanReviewRequest): Promise<z.infer<typeof planReviewReceiptSchema>>
  receiveResponse(input: unknown, context: unknown): Promise<z.infer<typeof planReviewReceiptSchema>>
}
