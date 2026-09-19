import { createElement } from 'react'
import type { PostAcceptance } from '@/modules/agency_research/lib/contracts'
import { postReviewSchema } from './contracts'

export function postReviewEligible(review: PostAcceptance, caseId: string): review is Extract<PostAcceptance, { status: 'ready' }> {
  return review.status === 'ready' && review.orderRef === caseId && review.post.isCurrent && Boolean(review.post.clientViewMd?.trim())
}

export async function renderPostReview(review: Extract<PostAcceptance, { status: 'ready' }>, caseId: string) {
  const [{ default: ReactMarkdown }, { renderToStaticMarkup }] = await Promise.all([import('react-markdown'), import('react-dom/server')])
  return postReviewSchema.parse({
    caseId,
    post: {
      caseId, documentId: review.post.documentId, versionId: review.post.versionId, version: review.post.version,
      templateId: 'WZR-POST', title: 'Post',
      html: renderToStaticMarkup(createElement(ReactMarkdown, { children: review.post.clientViewMd ?? '' })),
      status: review.receipt ? 'approved' : 'ready_for_review', isCurrent: true, mode: 'content',
      ...(review.receipt ? { acceptanceReceipt: { acceptedAt: review.receipt.at } } : {}),
    },
  })
}
