import { createElement } from 'react'
import type { StrategyPairAcceptanceState, StrategyReviewProjection } from '@/modules/agency_research/lib/contracts'
import { strategyPairReviewSchema } from './contracts'

export function pairReviewEligible(pair: StrategyReviewProjection | null, acceptance: StrategyPairAcceptanceState | null, caseId: string): boolean {
  if (!pair || pair.orderRef !== caseId || !acceptance || acceptance.status === 'not_ready' || acceptance.orderRef !== caseId) return false
  // The producer owns QA/base-brief/acceptance rules. Bind its current result to
  // the exact displayed pair instead of rebuilding those business rules here.
  return (['strategy', 'tov'] as const).every((kind) => pair[kind].isCurrent && Boolean(pair[kind].clientViewMd?.trim())
    && acceptance.pair[kind].documentId === pair[kind].documentId && acceptance.pair[kind].versionId === pair[kind].versionId)
}

export async function renderStrategyPair(pair: StrategyReviewProjection, caseId: string) {
  const [{ default: ReactMarkdown }, { renderToStaticMarkup }] = await Promise.all([import('react-markdown'), import('react-dom/server')])
  const render = (document: StrategyReviewProjection['strategy'] | StrategyReviewProjection['tov']) => ({
    caseId, documentId: document.documentId, versionId: document.versionId, version: document.version, templateId: document.templateId,
    title: document.templateId === 'WZR-STRATEGIA' ? 'Strategy / Strategia' : 'Tone of voice',
    html: renderToStaticMarkup(createElement(ReactMarkdown, { children: document.clientViewMd ?? '' })),
    status: 'ready_for_review', isCurrent: true, mode: 'content',
  })
  return strategyPairReviewSchema.parse({ caseId, strategy: render(pair.strategy), tov: render(pair.tov) })
}
