import { z } from 'zod'

const reference = z.string().trim().min(1)

export const documentReviewSchema = z.object({
  caseId: reference,
  documentId: reference,
  versionId: reference,
  version: reference,
  templateId: z.enum(['WZR-BRIEF', 'WZR-STRATEGIA', 'WZR-TOV', 'WZR-PLAN', 'WZR-POST']),
  title: reference,
  html: z.string().trim().min(1),
  status: z.enum(['ready_for_review', 'approved', 'needs_review', 'blocked', 'draft']),
  isCurrent: z.boolean(),
  mode: z.enum(['content', 'topic_choice', 'publication']),
  topics: z.array(z.object({ id: reference, title: reference, readiness: z.enum(['ready', 'blocked']) })).optional(),
  target: z.object({ id: reference, ref: reference, label: reference, platform: reference }).optional(),
  contentApproved: z.boolean().optional(),
})

export type DocumentReview = z.infer<typeof documentReviewSchema>

export function readDocumentReview(formSchema: unknown) {
  if (!formSchema || typeof formSchema !== 'object' || !('agencyReview' in formSchema)) return { kind: 'other' } as const
  const result = documentReviewSchema.safeParse(formSchema.agencyReview)
  return result.success ? { kind: 'review', review: result.data } as const : { kind: 'invalid' } as const
}

export function canAcceptDocument(review: DocumentReview, topicId: string) {
  if (!review.isCurrent || review.status !== 'ready_for_review') return false
  if (review.mode === 'topic_choice') {
    return review.templateId === 'WZR-PLAN'
      && review.topics?.length === 12
      && new Set(review.topics.map((topic) => topic.id)).size === 12
      && review.topics.every((topic) => topic.readiness === 'ready')
      && review.topics.some((topic) => topic.id === topicId)
  }
  if (review.mode === 'publication') return review.templateId === 'WZR-POST' && review.contentApproved === true && !!review.target
  return review.templateId !== 'WZR-PLAN'
}

export function buildReviewRequest(review: DocumentReview, action: 'accept' | 'comments', topicId: string, body: string, externalEventId: string) {
  if (action === 'accept' && !canAcceptDocument(review, topicId)) throw new Error('[internal] Document is not ready for approval')
  if (action === 'comments' && !body.trim()) throw new Error('[internal] Comments are required')
  return {
    channel: 'portal' as const,
    kind: action === 'comments' ? 'message' as const : review.mode === 'publication' ? 'consent' as const : review.mode === 'topic_choice' ? 'topic_choice' as const : 'approval' as const,
    documentId: review.documentId,
    versionId: review.versionId,
    externalEventId,
    ...(action === 'comments' ? { body: body.trim() } : {}),
    ...(action === 'accept' && review.mode === 'topic_choice' ? { topicId } : {}),
    ...(action === 'accept' && review.mode === 'publication' && review.target ? { targetId: review.target.id, targetRef: review.target.ref } : {}),
  }
}
