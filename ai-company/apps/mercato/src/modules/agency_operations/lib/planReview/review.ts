import { createElement } from 'react'
import type { PlanReview } from '@/modules/agency_research/lib/contracts'
import { planReviewSchema } from './contracts'

export function planReviewEligible(review: PlanReview, caseId: string): review is Extract<PlanReview, { status: 'ready' }> {
  return review.status === 'ready' && review.orderRef === caseId && review.plan.isCurrent && Boolean(review.plan.clientViewMd?.trim())
}

export async function renderPlanReview(review: Extract<PlanReview, { status: 'ready' }>, caseId: string) {
  const [{ default: ReactMarkdown }, { renderToStaticMarkup }] = await Promise.all([import('react-markdown'), import('react-dom/server')])
  return planReviewSchema.parse({
    caseId,
    plan: {
      caseId, documentId: review.plan.documentId, versionId: review.plan.versionId, version: review.plan.version,
      templateId: 'WZR-PLAN', title: 'Content plan / Plan treści',
      html: renderToStaticMarkup(createElement(ReactMarkdown, { children: review.plan.clientViewMd ?? '' })),
      status: review.receipt ? 'approved' : 'ready_for_review', isCurrent: true, mode: 'content',
      ...(review.receipt ? { acceptanceReceipt: { acceptedAt: review.receipt.at } } : {}),
    },
    topics: review.topics, recommendedTopicId: review.recommendedTopicId,
    ...(review.receipt ? { selectedTopicId: review.receipt.selectedTopicId } : {}),
  })
}
