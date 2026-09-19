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

const SENTENCE_BREAK = /(?<=[.!?…])\s+(?=[^a-ząćęłńóśźż])/u
const FIT_NOTE = { pl: '_Skrócono do limitu słów widoku klienta; pełna treść jest w dokumencie wewnętrznym._', en: '_Shortened to the client-view word budget; the full text is in the internal document._' }

function firstSentences(line: string, count: number): string {
  if (/^#|^\s*$|^\|/.test(line)) return line
  const label = line.match(/^(\s*(?:[-*]|\d+\.)?\s*(?:\*\*[^*]+\*\*:?\s*)?)/)?.[1] ?? ''
  const body = line.slice(label.length)
  const sentences = body.split(SENTENCE_BREAK)
  return sentences.length <= count ? line : label + sentences.slice(0, count).join(' ')
}

/**
 * Fits rendered lines into the template's word budget deterministically, in
 * Rafał's spirit (the view is a projection, never the document): first every
 * body line is cut to two sentences, then to one, then trailing lines are
 * dropped; a note says the full text lives in the internal document. Headings
 * and table rows are never cut.
 */
/** Evidence ids are internal: the client reads "(…)" groups of ids and bare id runs as nothing at all. */
export function stripEvidenceIds(text: string): string {
  const id = '(?:(?:S|F|C|P|L|A|T|X|G|D|Q|ER)-?\\d{2,}|VOICE-[AB])'
  const run = `${id}(?:\\s*(?:[,;/–-]|\\bi\\b|\\boraz\\b|\\band\\b)\\s*${id})*`
  return text
    .replace(new RegExp(`\\s*\\(\\s*${run}\\s*\\)`, 'g'), '')
    .replace(new RegExp(`\\s*\\b(?:w|in|see|zob\\.)\\s+${run}(?=[\\s,.;:)]|$)`, 'g'), '')
    .replace(new RegExp(`\\b${run}\\b`, 'g'), '')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function fitClientView(templateId: TemplateId, lines: string[], language: 'pl' | 'en', budgetWords?: number): ClientView {
  const limit = budgetWords ?? clientProjectionOf(templateId).word_limit
  const joined = (parts: string[]) => parts.join('\n')
  if (limit === null || countClientWords(joined(lines)) <= limit) return checkClientView(templateId, joined(lines))
  const note = FIT_NOTE[language]
  const noteWords = countClientWords(note)
  for (const count of [2, 1]) {
    const cut = lines.map((line) => firstSentences(line, count))
    if (countClientWords(joined(cut)) + noteWords <= limit) return checkClientView(templateId, joined([...cut, '', note]))
  }
  const cut = lines.map((line) => firstSentences(line, 1))
  return checkClientView(templateId, joined([...trimToBudget(cut, limit - noteWords), '', note]))
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
