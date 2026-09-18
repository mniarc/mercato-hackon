import type { TovBatchObservation, TovBrandVoice, TovPost, TovProfileVoice } from '../../data/validators'

/**
 * Deterministic cite-or-abstain check for the ToV agents — the research-agent
 * counterpart of the orchestrator's grounding gate (`lib/guardrails/grounding.ts`):
 * pure, replayable, no model call.
 *
 * A model may only point at evidence it was given: every `postId` must be one of
 * the input posts and every quote must appear verbatim in that post. Anything else
 * is dropped and reported; a result that keeps NO grounded exemplar is rejected so
 * the pipeline retries instead of propagating an invented voice.
 */

export type GroundingIssueReason = 'unknown_post' | 'quote_not_verbatim' | 'hook_not_in_corpus' | 'wrong_profile'

export type GroundingIssue = { path: string; reason: GroundingIssueReason; postId?: string }

/** A cited id that was repaired to the one input post it unambiguously prefixes. */
export type GroundingRepair = { path: string; from: string; to: string }

export type Grounded<T> = { value: T; issues: GroundingIssue[]; repairs: GroundingRepair[]; kept: number; dropped: number }

export class GroundingError extends Error {
  constructor(readonly agentPath: string, readonly issues: GroundingIssue[]) {
    super(`[internal] ${agentPath}: no grounded exemplar survived (${issues.length} issues)`)
  }
}

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

function words(text: string): string[] {
  return normalizeForMatch(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 0)
}

/**
 * A quote is verbatim when the post contains at least MIN_SHINGLE_COVERAGE of its
 * consecutive SHINGLE_WORDS-word runs, counted within each fragment between
 * ellipses (a short fragment must appear whole). Word runs survive what models
 * do to a quote they copy honestly — joining paragraphs, dropping a speaker
 * label, quote marks or an emoji, eliding with "…" — while a paraphrase shares
 * almost none of them.
 */
export function quoteIsVerbatim(quote: string, postText: string): boolean {
  const haystack = ` ${words(postText).join(' ')} `
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

/**
 * Small models sometimes truncate the 19-digit LinkedIn ids. Inside the evidence
 * the agent was given, a cited id that is the unambiguous prefix of exactly one
 * post id is that post; anything else stays unknown.
 */
export function resolvePostId(cited: string, byId: Map<string, TovPost>): TovPost | null {
  const exact = byId.get(cited)
  if (exact) return exact
  if (cited.length < 6) return null
  const candidates = [...byId.values()].filter((post) => post.id.startsWith(cited))
  return candidates.length === 1 ? candidates[0] : null
}

function indexPosts(posts: TovPost[]): Map<string, TovPost> {
  return new Map(posts.map((post) => [post.id, post]))
}

function groundHooks(examples: string[], posts: TovPost[], path: string, issues: GroundingIssue[]): string[] {
  return examples.filter((example, index) => {
    const ok = posts.some((post) => quoteIsVerbatim(example, post.text))
    if (!ok) issues.push({ path: `${path}[${index}]`, reason: 'hook_not_in_corpus' })
    return ok
  })
}

function groundExemplars<T extends { postId: string; quote: string; profileUrl?: string }>(
  exemplars: T[],
  byId: Map<string, TovPost>,
  path: string,
  issues: GroundingIssue[],
  repairs: GroundingRepair[],
): T[] {
  const kept: T[] = []
  exemplars.forEach((exemplar, index) => {
    const post = resolvePostId(exemplar.postId, byId)
    if (!post) {
      issues.push({ path: `${path}[${index}]`, reason: 'unknown_post', postId: exemplar.postId })
      return
    }
    if (exemplar.profileUrl !== undefined && post.profileUrl !== exemplar.profileUrl) {
      issues.push({ path: `${path}[${index}]`, reason: 'wrong_profile', postId: exemplar.postId })
      return
    }
    if (!quoteIsVerbatim(exemplar.quote, post.text)) {
      issues.push({ path: `${path}[${index}]`, reason: 'quote_not_verbatim', postId: exemplar.postId })
      return
    }
    if (post.id !== exemplar.postId) repairs.push({ path: `${path}[${index}]`, from: exemplar.postId, to: post.id })
    kept.push({ ...exemplar, postId: post.id })
  })
  return kept
}

function finish<T>(value: T, issues: GroundingIssue[], repairs: GroundingRepair[], keptExemplars: number, agentPath: string): Grounded<T> {
  if (keptExemplars === 0) throw new GroundingError(agentPath, issues)
  return { value, issues, repairs, kept: keptExemplars, dropped: issues.length }
}

/** Batch analyst: evidence = the posts of that batch. */
export function groundObservation(observation: TovBatchObservation, posts: TovPost[]): Grounded<TovBatchObservation> {
  const issues: GroundingIssue[] = []
  const repairs: GroundingRepair[] = []
  const byId = indexPosts(posts)
  const exemplars = groundExemplars(observation.exemplars, byId, 'exemplars', issues, repairs)
  const hooks = { ...observation.hooks, examples: groundHooks(observation.hooks.examples, posts, 'hooks.examples', issues) }
  return finish({ ...observation, exemplars, hooks }, issues, repairs, exemplars.length, 'batch_analyst')
}

/** Profile synthesizer: evidence = every post of that author (not only the batch exemplars). */
export function groundProfileVoice(voice: TovProfileVoice, posts: TovPost[]): Grounded<TovProfileVoice> {
  const issues: GroundingIssue[] = []
  const repairs: GroundingRepair[] = []
  const byId = indexPosts(posts)
  const exemplars = groundExemplars(voice.exemplars, byId, 'exemplars', issues, repairs)
  const hooks = { ...voice.hooks, examples: groundHooks(voice.hooks.examples, posts, 'hooks.examples', issues) }
  return finish({ ...voice, exemplars, hooks }, issues, repairs, exemplars.length, 'profile_synthesizer')
}

/** Brand synthesizer: evidence = all posts, and the cited profile must own the post. */
export function groundBrandVoice(brand: TovBrandVoice, posts: TovPost[]): Grounded<TovBrandVoice> {
  const issues: GroundingIssue[] = []
  const repairs: GroundingRepair[] = []
  const byId = indexPosts(posts)
  const exemplars = groundExemplars(brand.exemplars, byId, 'exemplars', issues, repairs)
  const hooks = { ...brand.hooks, examples: groundHooks(brand.hooks.examples, posts, 'hooks.examples', issues) }
  return finish({ ...brand, exemplars, hooks }, issues, repairs, exemplars.length, 'brand_synthesizer')
}
