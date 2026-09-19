import { createHash } from 'node:crypto'

/**
 * Small deterministic helpers. The matcher and the concurrency helper are copies
 * of `agency_tov/lib/tov/{grounding,batch}.ts` — modules stay self-contained
 * (no imports of another module's internals), so the origin is noted here and
 * the two copies are expected to drift only deliberately.
 */

/** Whitespace, quote glyphs and case are presentation; the words are the evidence. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const SHINGLE_WORDS = 4
const MIN_SHINGLE_COVERAGE = 0.75
const MIN_QUOTE_WORDS = 3

export function words(text: string): string[] {
  return normalizeForMatch(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 0)
}

/**
 * A quote is verbatim when the text contains at least MIN_SHINGLE_COVERAGE of its
 * consecutive SHINGLE_WORDS-word runs, counted within each fragment between
 * ellipses (a short fragment must appear whole). Word runs survive what models do
 * to a quote they copy honestly — joining paragraphs, dropping a label, quote marks
 * or an emoji, eliding with "…" — while a paraphrase shares almost none of them.
 */
export function quoteIsVerbatim(quote: string, text: string): boolean {
  const haystack = ` ${words(text).join(' ')} `
  const fragments = quote
    .split(/…|\.\.\./)
    .map((fragment) => words(fragment))
    .filter((fragment) => fragment.length > 0)
  if (fragments.reduce((sum, fragment) => sum + fragment.length, 0) < MIN_QUOTE_WORDS) return false
  let hits = 0
  let total = 0
  for (const fragment of fragments) {
    if (fragment.length < SHINGLE_WORDS + 2) {
      total += 1
      if (haystack.includes(` ${fragment.join(' ')} `)) hits += 1
      continue
    }
    const runs = fragment.length - SHINGLE_WORDS + 1
    total += runs
    for (let index = 0; index < runs; index += 1) {
      if (haystack.includes(` ${fragment.slice(index, index + SHINGLE_WORDS).join(' ')} `)) hits += 1
    }
  }
  return total > 0 && hits / total >= MIN_SHINGLE_COVERAGE
}

/** Character offset of the quote's first word run in the original text, or null when it cannot be anchored. */
export function quoteOffset(quote: string, text: string): number | null {
  const firstWords = words(quote).slice(0, SHINGLE_WORDS)
  if (firstWords.length === 0) return null
  const pattern = firstWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}]+')
  const match = new RegExp(pattern, 'iu').exec(text)
  return match ? match.index : null
}

/** Jaccard over word sets — used to spot near-duplicate pages and repeated seeds. */
export function wordSetSimilarity(a: string, b: string): number {
  const setA = new Set(words(a))
  const setB = new Set(words(b))
  if (setA.size === 0 && setB.size === 0) return 1
  let inter = 0
  for (const word of setA) if (setB.has(word)) inter += 1
  return inter / (setA.size + setB.size - inter)
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function fingerprint(parts: unknown): string {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16)
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/** Rafał's word-count rule: visible whitespace-separated tokens after removing technical ids and URLs. */
export function countClientWords(markdown: string): number {
  return markdown
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b(?:S|F|C|P|L|A|T|X|G|D|Q|ER)-?\d{2,}\b/g, ' ')
    .replace(/[#*_>|`-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

/** Something a fetched page says to the model rather than to a reader — kept as data, never as a fact. */
export function looksLikeInstruction(text: string): boolean {
  return /\b(ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+)?(?:previous\s+|prior\s+|above\s+|earlier\s+)?(instructions|prompts|rules)\b|\byou are now\b|\bsystem prompt\b|\bas an ai\b/i.test(text)
}
