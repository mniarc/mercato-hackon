import { clientProjectionOf } from '../../data/contracts'
import type { TemplateId } from '../../data/schemas/envelope'
import type { DocumentIssue } from '../../data/schemas/envelope'
import { countClientWords } from './util'

/**
 * Client projections (`client_projection` in Rafał's contracts): a short view
 * rendered from the canonical data, never overwriting it. Word limits are counted
 * per his rule (visible tokens after removing ids and URLs); a view over budget is
 * an issue on the document, not a silent cut.
 */

export type ClientView = { markdown: string; words: number; limit: number | null; issue: DocumentIssue | null }

export function checkClientView(templateId: TemplateId, markdown: string): ClientView {
  const projection = clientProjectionOf(templateId)
  const words = countClientWords(markdown)
  const limit = projection.word_limit
  const issue: DocumentIssue | null =
    limit !== null && words > limit
      ? { code: 'CLIENT_VIEW_OVER_BUDGET', severity: 'limitation', detail: `client view has ${words} words, limit ${limit}`, path: 'client_view' }
      : null
  return { markdown, words, limit, issue }
}

/** Keeps the first items of a list until the budget would be exceeded; used to trim client views deterministically. */
export function trimToBudget(items: string[], budgetWords: number, alreadyUsed = 0): string[] {
  const kept: string[] = []
  let used = alreadyUsed
  for (const item of items) {
    const words = countClientWords(item)
    if (used + words > budgetWords) break
    kept.push(item)
    used += words
  }
  return kept
}
