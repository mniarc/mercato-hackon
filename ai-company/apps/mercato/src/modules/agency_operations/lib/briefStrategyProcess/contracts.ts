import { z } from 'zod'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { documentReviewSchema } from '@/modules/agency/data/document-review'

export const BRIEF_REVIEW_SERVICE = 'agencyBriefReviewService'
export const BRIEF_REVIEW_WORKFLOW_ID = 'agency_operations.brief-review.v1'
export const BRIEF_REVIEW_STEP_ID = 'client_review'
export const BRIEF_REVIEW_CONTEXT_KEY = 'briefReviewInvitation'
export const BRIEF_RESPONSE_FUNCTION = 'agency_operations.receiveBriefReviewResponse'
export const BRIEF_RESPONSE_CONTEXT_KEY = 'briefReviewResponse'
export const BRIEF_REVIEW_FORM_KEY = 'agency.brief-review'

export const briefReviewInvitationSchema = z.object({
  caseId: z.uuid(), customerEntityId: z.uuid(), customerUserId: z.uuid(), review: documentReviewSchema,
})
export const briefReviewReadSchema = z.object({ ok: z.literal(true), review: documentReviewSchema, canRespond: z.boolean() })

export const briefReviewRequestSchema = z.object({
  channel: z.literal('portal'),
  kind: z.enum(['approval', 'message']),
  documentId: z.uuid(),
  versionId: z.uuid(),
  externalEventId: z.string().min(1).max(200),
  body: z.string().max(20000).optional(),
}).strict().superRefine((request, context) => {
  if (request.kind === 'message' && !request.body?.trim()) {
    context.addIssue({ code: 'custom', path: ['body'], message: 'Message body is required' })
  }
  if (request.kind === 'approval' && request.body?.trim()) {
    context.addIssue({ code: 'custom', path: ['body'], message: 'An approval request cannot contain a conflicting message' })
  }
})

export const briefReviewReceiptSchema = z.object({
  requestId: z.uuid(), status: z.literal('response_received'), replayed: z.boolean(),
})

export type BriefReviewRequest = z.infer<typeof briefReviewRequestSchema>
export type BriefReviewReceipt = z.infer<typeof briefReviewReceiptSchema>
export type BriefReviewInvitationInput = {
  caseId: string; versionId: string; tenantId: string; organizationId: string; userId: string;
  sourceSubmissionId?: string;
}
export type BriefReviewService = {
  invite(input: BriefReviewInvitationInput): Promise<{ workflowInstanceId: string; taskId: string; replayed: boolean }>
  read(auth: CustomerAuthContext, taskId: string): Promise<z.infer<typeof briefReviewReadSchema>>
  respond(auth: CustomerAuthContext, caseId: string, input: BriefReviewRequest): Promise<BriefReviewReceipt>
}
