import { tovPostSchema, type TovPost, type TovSource } from '../../data/validators'
import type { NormalizeResult } from './index'

/**
 * Best-effort mapping for scrapers whose output we have not pinned field by field
 * (X, Facebook, Instagram, website crawls, anything under `other`). Each field lists
 * candidate dot-paths in priority order; the first present, non-empty one wins.
 * Unknown shapes degrade to skipped items, never to a crash — a source that yields
 * nothing is a normal outcome the pipeline reports, not an error.
 */
export type GenericFieldMap = {
  id: string[]
  text: string[]
  url: string[]
  postedAt: string[]
  authorName: string[]
  profileUrl: string[]
  likes: string[]
  comments: string[]
  shares: string[]
  videoFlag?: string[]
  imageFlag?: string[]
}

export type GenericNormalizeOptions = {
  source: TovSource
  fields: GenericFieldMap
  /** Fallback profile key when the item carries none: the scrape target it came from. */
  fallbackProfileUrl: string
  fallbackAuthorName?: string
  minTextLength?: number
}

function pick(item: unknown, paths: string[]): unknown {
  for (const path of paths) {
    let cursor: unknown = item
    for (const key of path.split('.')) {
      if (cursor == null || typeof cursor !== 'object') {
        cursor = undefined
        break
      }
      cursor = (cursor as Record<string, unknown>)[key]
    }
    if (cursor != null && cursor !== '' && !(Array.isArray(cursor) && cursor.length === 0)) return cursor
  }
  return undefined
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  return null
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return 0
}

function asDate(value: unknown): string | null {
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
  }
  return null
}

export function normalizeGenericPosts(items: unknown[], opts: GenericNormalizeOptions): NormalizeResult {
  const posts: TovPost[] = []
  const skipped: NormalizeResult['skipped'] = []
  const seen = new Set<string>()
  const minText = opts.minTextLength ?? 1
  items.forEach((item, index) => {
    const id = asString(pick(item, opts.fields.id)) ?? `${opts.source}-${index}`
    const text = asString(pick(item, opts.fields.text))
    if (!text || text.length < minText) {
      skipped.push({ reason: 'empty_text', id })
      return
    }
    if (seen.has(id)) {
      skipped.push({ reason: 'duplicate', id })
      return
    }
    const parsed = tovPostSchema.safeParse({
      id,
      source: opts.source,
      profileUrl: asString(pick(item, opts.fields.profileUrl)) ?? opts.fallbackProfileUrl,
      authorName: asString(pick(item, opts.fields.authorName)) ?? opts.fallbackAuthorName ?? opts.fallbackProfileUrl,
      url: asString(pick(item, opts.fields.url)) ?? opts.fallbackProfileUrl,
      postedAt: asDate(pick(item, opts.fields.postedAt)) ?? '1970-01-01T00:00:00.000Z',
      text,
      likes: asCount(pick(item, opts.fields.likes)),
      comments: asCount(pick(item, opts.fields.comments)),
      shares: asCount(pick(item, opts.fields.shares)),
      media: pick(item, opts.fields.videoFlag ?? []) ? 'video' : pick(item, opts.fields.imageFlag ?? []) ? 'image' : 'none',
    })
    if (!parsed.success) {
      skipped.push({ reason: 'invalid', id })
      return
    }
    seen.add(id)
    posts.push(parsed.data)
  })
  return { posts, skipped }
}
