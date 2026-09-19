import { z } from 'zod'
import { documentReviewSchema } from '../../data/document-review'

export const postReviewSchema = z.object({ caseId: z.string().min(1), post: documentReviewSchema })
  .refine((review) => review.post.caseId === review.caseId && review.post.templateId === 'WZR-POST' && review.post.mode === 'content')
export const postReviewProjectionSchema = z.object({ ok: z.literal(true), review: postReviewSchema, canRespond: z.boolean() })
export type PostReview = z.infer<typeof postReviewSchema>
export type PostReviewProjection = z.infer<typeof postReviewProjectionSchema>

const responseValuesSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('approval'), approveContent: z.literal(true) }),
  z.object({ kind: z.literal('message'), body: z.string().min(1).max(20000).refine((body) => Boolean(body.trim())) }),
])

export function postReviewKey(review: PostReview) {
  return JSON.stringify([review.caseId, review.post.documentId, review.post.versionId])
}

export function canRespondToPost(review: PostReview) {
  return review.post.isCurrent && review.post.status === 'ready_for_review'
}

export function buildPostReviewRequest(review: PostReview, rawValues: unknown, externalEventId: string) {
  const values = responseValuesSchema.parse(rawValues)
  if (!canRespondToPost(review)) throw new Error('[internal] Post is not available for response')
  const identity = { channel: 'portal' as const, post: { documentId: review.post.documentId, versionId: review.post.versionId }, externalEventId }
  if (values.kind === 'message') return { ...identity, kind: 'message' as const, body: values.body }
  return { ...identity, kind: 'approval' as const, approveContent: true as const }
}
