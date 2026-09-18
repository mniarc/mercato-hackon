import type { TovPost } from '../../data/validators'

export type TovBatch = {
  index: number
  posts: TovPost[]
  chars: number
}

export const DEFAULT_BATCH_SIZE = 40
/** ~7k tokens of post text per batch — small enough for a fast, cheap model call. */
export const DEFAULT_MAX_BATCH_CHARS = 28_000

/**
 * Slices one author's posts (already chronological) into batches bounded by BOTH a
 * post count and a character budget, so a run of 3000-char essays does not blow
 * the batch up while a run of 2-line captions still gets enough posts to read a
 * pattern from. A single post always fits (it is at most 3000 chars on LinkedIn).
 */
export function batchPosts(
  posts: TovPost[],
  opts: { batchSize?: number; maxBatchChars?: number } = {},
): TovBatch[] {
  const batchSize = Math.max(1, opts.batchSize ?? DEFAULT_BATCH_SIZE)
  const maxChars = Math.max(1, opts.maxBatchChars ?? DEFAULT_MAX_BATCH_CHARS)
  const batches: TovBatch[] = []
  let current: TovPost[] = []
  let chars = 0
  const flush = () => {
    if (current.length === 0) return
    batches.push({ index: batches.length, posts: current, chars })
    current = []
    chars = 0
  }
  for (const post of posts) {
    const len = post.text.length
    if (current.length > 0 && (current.length >= batchSize || chars + len > maxChars)) flush()
    current.push(post)
    chars += len
  }
  flush()
  return batches
}

export function dateRangeOf(posts: TovPost[]): { from: string; to: string } {
  let from = posts[0]?.postedAt ?? ''
  let to = from
  for (const post of posts) {
    if (post.postedAt < from) from = post.postedAt
    if (post.postedAt > to) to = post.postedAt
  }
  return { from, to }
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
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
