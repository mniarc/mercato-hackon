import { z } from 'zod'
import { canAcceptDocument, canCommentDocument, documentReviewSchema } from '../../data/document-review'

export const strategyPairReviewSchema = z.object({
  caseId: z.string().min(1),
  strategy: documentReviewSchema,
  tov: documentReviewSchema,
}).refine((review) => review.strategy.caseId === review.caseId && review.tov.caseId === review.caseId
  && review.strategy.templateId === 'WZR-STRATEGIA' && review.tov.templateId === 'WZR-TOV'
  && review.strategy.mode === 'content' && review.tov.mode === 'content'
  && review.strategy.documentId !== review.tov.documentId)

export const strategyPairProjectionSchema = z.object({
  ok: z.literal(true), review: strategyPairReviewSchema, canRespond: z.boolean(),
})

export type StrategyPairReview = z.infer<typeof strategyPairReviewSchema>
export type StrategyPairProjection = z.infer<typeof strategyPairProjectionSchema>
export type PairDocument = 'strategy' | 'tov'

const responseValuesSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('approval'), strategy: z.boolean().default(false), tov: z.boolean().default(false) })
    .refine((value) => value.strategy || value.tov),
  z.object({ kind: z.literal('message'), body: z.string().trim().min(1).max(20000) }),
])

export function strategyPairKey(review: StrategyPairReview) {
  return JSON.stringify([review.caseId, review.strategy.documentId, review.strategy.versionId, review.tov.documentId, review.tov.versionId])
}

export function canRespondToStrategyPair(review: StrategyPairReview) {
  const documents = [review.strategy, review.tov]
  return documents.every((document) => document.isCurrent && (document.status === 'approved' || canCommentDocument(document)))
    && documents.some(canCommentDocument)
}

export function buildStrategyPairRequest(review: StrategyPairReview, rawValues: unknown, externalEventId: string) {
  const values = responseValuesSchema.parse(rawValues)
  if (!canRespondToStrategyPair(review)) throw new Error('[internal] Strategy pair is not available for response')
  const identities = {
    channel: 'portal' as const,
    strategy: { documentId: review.strategy.documentId, versionId: review.strategy.versionId },
    tov: { documentId: review.tov.documentId, versionId: review.tov.versionId },
    externalEventId,
  }
  if (values.kind === 'message') return { ...identities, kind: 'message' as const, body: values.body }
  const approvedDocuments: PairDocument[] = []
  if (values.strategy) approvedDocuments.push('strategy')
  if (values.tov) approvedDocuments.push('tov')
  if (approvedDocuments.some((document) => !canAcceptDocument(review[document], ''))) {
    throw new Error('[internal] Selected strategy document is not available for approval')
  }
  return { ...identities, kind: 'approval' as const, approvedDocuments }
}
