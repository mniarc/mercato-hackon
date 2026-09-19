import { z } from 'zod'
import { documentReviewSchema } from '../../data/document-review'

export const planReviewSchema = z.object({
  caseId: z.string().min(1), plan: documentReviewSchema,
  topics: z.array(z.object({ topicId: z.string().min(1), title: z.string().min(1), recommended: z.boolean() })).min(1),
  recommendedTopicId: z.string().min(1), selectedTopicId: z.string().min(1).optional(),
}).refine((review) => review.plan.caseId === review.caseId && review.plan.templateId === 'WZR-PLAN'
  && new Set(review.topics.map((topic) => topic.topicId)).size === review.topics.length
  && review.topics.some((topic) => topic.topicId === review.recommendedTopicId))
export const planReviewProjectionSchema = z.object({ ok: z.literal(true), review: planReviewSchema, canRespond: z.boolean() })
export type PlanReview = z.infer<typeof planReviewSchema>
export type PlanReviewProjection = z.infer<typeof planReviewProjectionSchema>

const responseValuesSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('approval'), approvePlan: z.literal(true), selectedTopicId: z.string().min(1) }),
  z.object({ kind: z.literal('message'), body: z.string().min(1).max(20000).refine((body) => Boolean(body.trim())) }),
])

export function planReviewKey(review: PlanReview) {
  return JSON.stringify([review.caseId, review.plan.documentId, review.plan.versionId])
}

export function canRespondToPlan(review: PlanReview) {
  return review.plan.isCurrent && ['ready_for_review', 'approved'].includes(review.plan.status)
}

export function buildPlanReviewRequest(review: PlanReview, rawValues: unknown, externalEventId: string) {
  const values = responseValuesSchema.parse(rawValues)
  if (!canRespondToPlan(review)) throw new Error('[internal] Plan is not available for response')
  const identity = { channel: 'portal' as const, plan: { documentId: review.plan.documentId, versionId: review.plan.versionId }, externalEventId }
  if (values.kind === 'message') return { ...identity, kind: 'message' as const, body: values.body }
  if (!review.topics.some((topic) => topic.topicId === values.selectedTopicId)) throw new Error('[internal] Selected topic does not belong to this plan')
  return { ...identity, kind: 'approval' as const, approvePlan: true as const, selectedTopicId: values.selectedTopicId }
}
