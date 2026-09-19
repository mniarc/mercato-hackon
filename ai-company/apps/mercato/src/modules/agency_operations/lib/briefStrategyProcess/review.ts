import { createElement } from 'react'
import type { BriefReviewProjection } from '@/modules/agency_research/lib/contracts'
import { documentReviewSchema, type DocumentReview } from '@/modules/agency/data/document-review'

export function briefReviewStatus(projection: BriefReviewProjection): 'ready_for_review' | 'needs_review' | null {
  if (!projection.isCurrent || !projection.clientViewMd?.trim() || projection.qa.state !== 'assessed') return null
  if (projection.documentStatus === 'approved' || projection.versionStatus === 'approved') return null
  if (projection.qa.verdict === 'ready_for_approval') return 'ready_for_review'
  return projection.qa.verdict === 'needs_client_data' ? 'needs_review' : null
}

export async function renderBriefReview(projection: BriefReviewProjection, caseId: string): Promise<DocumentReview | null> {
  const status = briefReviewStatus(projection)
  if (!status || projection.orderRef !== caseId) return null
  const [{ default: ReactMarkdown }, { renderToStaticMarkup }] = await Promise.all([
    import('react-markdown'), import('react-dom/server'),
  ])
  const questions = projection.questions.map((question) => `- ${question.question}${question.hint ? ` — ${question.hint}` : ''}`).join('\n')
  const markdown = [projection.clientViewMd, questions].filter(Boolean).join('\n\n')
  return documentReviewSchema.parse({
    caseId, documentId: projection.documentId, versionId: projection.versionId, version: projection.version,
    templateId: 'WZR-BRIEF', title: 'Brief', html: renderToStaticMarkup(createElement(ReactMarkdown, { children: markdown })),
    status, isCurrent: true, mode: 'content',
  })
}
