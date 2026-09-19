import { z } from 'zod'
import { briefAcceptanceSourceSchema } from '../briefAcceptance/contracts'
import type { PostReviewProjection } from '../postReview/types'

export const postAcceptanceRequestSchema = z.object({ orderRef: z.string().min(1), postVersionId: z.uuid() }).strict()
export type PostAcceptanceRequest = z.infer<typeof postAcceptanceRequestSchema>
export const postAcceptanceRecordSchema = z.object({
  person: z.uuid(), at: z.iso.datetime(), scope: z.literal('post_content'),
  documentId: z.uuid(), documentVersionId: z.uuid(), version: z.string().regex(/^[1-9]\d*\.0$/), qaTaskRunId: z.uuid(),
  source: briefAcceptanceSourceSchema.extend({ kind: z.literal('agency_post_acceptance') }),
}).strict()
export type PostAcceptanceRecord = z.infer<typeof postAcceptanceRecordSchema>
export const acceptPostInputSchema = z.object({
  context: z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).strict(),
  request: z.object({ orderRef: z.string().min(1), documentId: z.uuid(), versionId: z.uuid(), customerUserId: z.uuid(),
    source: briefAcceptanceSourceSchema.omit({ kind: true }),
  }).strict(),
}).strict()
export type AcceptPostInput = z.infer<typeof acceptPostInputSchema>
export const postAcceptanceReceiptSchema = z.object({ status: z.literal('post_accepted'), orderRef: z.string().min(1), record: postAcceptanceRecordSchema, replayed: z.boolean() })
export type PostAcceptanceReceipt = z.infer<typeof postAcceptanceReceiptSchema>
export type PostAcceptance =
  | { status: 'not_ready'; orderRef: string; reason: 'post_not_found' | 'post_not_current' | 'post_not_reviewable' | 'post_qa_not_ready' | 'approval_record_missing' }
  | { status: 'ready'; orderRef: string; post: PostReviewProjection; receipt: PostAcceptanceRecord | null }
