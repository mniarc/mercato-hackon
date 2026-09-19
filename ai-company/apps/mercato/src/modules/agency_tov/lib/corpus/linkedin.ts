import { tovPostSchema, type TovPost, type TovPostMediaKind } from '../../data/validators'
import type { NormalizeResult } from './index'

/**
 * Shape of one item in an Apify `linkedin-profile-posts` dataset export — only the
 * fields we read. Everything else on the item (social flags, reaction ids, urns)
 * is irrelevant to a voice analysis and is dropped on purpose.
 */
export type ApifyLinkedInPostItem = {
  type?: string
  id?: string
  entityId?: string
  linkedinUrl?: string
  content?: string
  author?: { name?: string; publicIdentifier?: string; linkedinUrl?: string } | null
  postedAt?: { date?: string; timestamp?: number } | null
  engagement?: { likes?: number; comments?: number; shares?: number } | null
  query?: { targetUrl?: string } | null
  postImages?: unknown[]
  postVideo?: unknown
  article?: unknown
  document?: unknown
  poll?: unknown
  newsletterUrl?: string
  header?: { text?: string } | null
}

/** Priority order matters: a video post also carries thumbnails in `postImages`. */
function mediaKind(item: ApifyLinkedInPostItem): TovPostMediaKind {
  if (item.newsletterUrl) return 'newsletter'
  if (item.poll) return 'poll'
  if (item.postVideo) return 'video'
  if (item.document) return 'document'
  if (item.article) return 'article'
  if (Array.isArray(item.postImages) && item.postImages.length > 0) return 'image'
  return 'none'
}

function normalizeProfileUrl(raw: string): string {
  return raw.trim().replace(/\/posts\/?(\?.*)?$/, '/').replace(/\/?$/, '/')
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function normalizePostedAt(postedAt: ApifyLinkedInPostItem['postedAt']): string {
  if (typeof postedAt?.timestamp === 'number') {
    const date = new Date(postedAt.timestamp)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  if (postedAt?.date) {
    const raw = postedAt.date.trim()
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return ''
}

/**
 * Turns an Apify `linkedin-profile-posts` dataset into the compact post list the ToV agents read. Reposts
 * (a non-empty `header.text` such as "X reposted this") are dropped: they are not
 * the author's voice. The author key is the scraped `query.targetUrl` — the
 * `author` object is occasionally garbled in the export, the query never is.
 */
export function normalizeLinkedInPosts(items: ApifyLinkedInPostItem[]): NormalizeResult {
  const posts: TovPost[] = []
  const skipped: NormalizeResult['skipped'] = []
  const seen = new Set<string>()
  for (const item of items) {
    const id = item.id ?? item.entityId ?? null
    if (item.type && item.type !== 'post') {
      skipped.push({ reason: 'not_a_post', id })
      continue
    }
    if (item.header?.text && item.header.text.trim().length > 0) {
      skipped.push({ reason: 'repost', id })
      continue
    }
    const text = (item.content ?? '').trim()
    if (!text) {
      skipped.push({ reason: 'empty_text', id })
      continue
    }
    const profileRaw = item.query?.targetUrl ?? item.author?.linkedinUrl ?? null
    if (!profileRaw) {
      skipped.push({ reason: 'no_profile', id })
      continue
    }
    if (id && seen.has(id)) {
      skipped.push({ reason: 'duplicate', id })
      continue
    }
    const parsed = tovPostSchema.safeParse({
      id,
      source: 'linkedin',
      profileUrl: normalizeProfileUrl(profileRaw),
      authorName: item.author?.name?.trim() || item.author?.publicIdentifier || profileRaw,
      url: item.linkedinUrl ?? '',
      postedAt: normalizePostedAt(item.postedAt),
      text,
      likes: count(item.engagement?.likes),
      comments: count(item.engagement?.comments),
      shares: count(item.engagement?.shares),
      media: mediaKind(item),
    })
    if (!parsed.success) {
      skipped.push({ reason: 'invalid', id })
      continue
    }
    if (id) seen.add(id)
    posts.push(parsed.data)
  }
  return { posts, skipped }
}
