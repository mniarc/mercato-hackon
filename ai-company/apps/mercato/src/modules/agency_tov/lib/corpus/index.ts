import type { TovPost, TovProfileMeta } from '../../data/validators'

export type SkipReason = 'not_a_post' | 'repost' | 'empty_text' | 'no_profile' | 'invalid' | 'duplicate'

export type NormalizeResult = {
  posts: TovPost[]
  skipped: { reason: SkipReason; id: string | null }[]
}

/** One voice per channel: the key is the scraped profile / page / site URL. */
export function groupByProfile(posts: TovPost[]): Map<string, TovPost[]> {
  const groups = new Map<string, TovPost[]>()
  for (const post of posts) {
    const list = groups.get(post.profileUrl) ?? []
    list.push(post)
    groups.set(post.profileUrl, list)
  }
  for (const list of groups.values()) list.sort((a, b) => a.postedAt.localeCompare(b.postedAt))
  return groups
}

/**
 * Display name per profile = the most frequent author name among its posts, so one
 * garbled item cannot rename a person.
 */
export function profileMetaFor(profileUrl: string, posts: TovPost[]): TovProfileMeta {
  const names = new Map<string, number>()
  let first: string | null = null
  let last: string | null = null
  for (const post of posts) {
    names.set(post.authorName, (names.get(post.authorName) ?? 0) + 1)
    if (!first || post.postedAt < first) first = post.postedAt
    if (!last || post.postedAt > last) last = post.postedAt
  }
  const displayName = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? profileUrl
  return {
    source: posts[0]?.source ?? 'other',
    profileUrl,
    displayName,
    postCount: posts.length,
    firstPostedAt: first,
    lastPostedAt: last,
  }
}

/** Merges corpora from several sources; a post id is unique within its source only. */
export function mergeCorpora(parts: NormalizeResult[]): NormalizeResult {
  const seen = new Set<string>()
  const posts: TovPost[] = []
  const skipped: NormalizeResult['skipped'] = []
  for (const part of parts) {
    skipped.push(...part.skipped)
    for (const post of part.posts) {
      const key = `${post.source}:${post.id}`
      if (seen.has(key)) {
        skipped.push({ reason: 'duplicate', id: post.id })
        continue
      }
      seen.add(key)
      posts.push(post)
    }
  }
  return { posts, skipped }
}
