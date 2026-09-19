import { z } from 'zod'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { documentReviewSchema } from '@/modules/agency/data/document-review'

export const POST_REVIEW_SERVICE = 'agencyPostReviewService'
export const POST_REVIEW_WORKFLOW_ID = 'agency_operations.post-review.v1'
export const POST_REVIEW_FORM_KEY = 'agency.post-review'
export const POST_REVIEW_CONTEXT_KEY = 'postInvitation'
export const POST_RESPONSE_CONTEXT_KEY = 'postResponse'
export const POST_RESPONSE_FUNCTION = 'agency_operations.receivePostResponse'
export const postReviewSchema = z.object({ caseId: z.uuid(), post: documentReviewSchema })
export const postReviewReadSchema = z.object({ ok: z.literal(true), review: postReviewSchema, canRespond: z.boolean() })
export const postReviewInvitationSchema = z.object({ caseId: z.uuid(), customerEntityId: z.uuid(), customerUserId: z.uuid(), review: postReviewSchema })
export const postReviewRequestSchema = z.object({
  channel: z.literal('portal'), kind: z.enum(['approval', 'message']),
  post: z.object({ documentId: z.uuid(), versionId: z.uuid() }).strict(),
  approveContent: z.literal(true).optional(),
  externalEventId: z.string().min(1).max(200), body: z.string().max(20000).optional(),
}).strict().superRefine((input, context) => {
  if (input.kind === 'approval' && (input.approveContent !== true || input.body !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Content approval requires explicit approval without a message body' })
  }
  if (input.kind === 'message' && (!input.body?.trim() || input.approveContent !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Message requires a body and no content approval' })
  }
})
export const postReviewReceiptSchema = z.object({ requestId: z.uuid(), status: z.literal('response_received'), replayed: z.boolean() })
export type PostReviewRequest = z.infer<typeof postReviewRequestSchema>
export type PostReviewService = {
  invite(input: { caseId: string; postVersionId: string; tenantId: string; organizationId: string; userId: string }): Promise<{ workflowInstanceId: string; taskId: string; replayed: boolean }>
  read(auth: CustomerAuthContext, taskId: string): Promise<z.infer<typeof postReviewReadSchema>>
  respond(auth: CustomerAuthContext, taskId: string, input: PostReviewRequest): Promise<z.infer<typeof postReviewReceiptSchema>>
  receiveResponse(input: unknown, context: unknown): Promise<z.infer<typeof postReviewReceiptSchema>>
}
