import { limits } from '../../data/templates'
import type { OrderFacts } from '../../data/schemas/zamowienie'
import { canonicalUrl, sourceId } from './ids'
import type { ResearchMaterialSource } from '../contracts/agencyResearch'

/**
 * Source collection (3.2) is code: the website and one official social profile
 * within STD-LIMITY (≤10 client pages, social target 8, 2 attempts per URL). An
 * unavailable page stays in the register as an access attempt — "nieudane pobranie
 * nie jest przeczytanym źródłem". Agents never fetch; they read what is stored.
 */

export type FetchedPage = {
  url: string
  finalUrl: string
  status: 'ok' | 'unavailable'
  title: string | null
  markdown: string | null
  error: string | null
}

export type FetchPage = (url: string) => Promise<FetchedPage>

export type SocialPost = {
  id: string
  url: string
  text: string
  postedAt: string
  authorName: string
  likes: number
  comments: number
  shares: number
}

export type CollectedSource = {
  source_id: string
  url: string
  publisher: string
  kind: string
  channel: string
  origin: 'purchase_form' | 'agent' | 'client' | 'corpus'
  access: 'full' | 'partial' | 'unavailable'
  title: string | null
  text: string | null
  bytes: number
  retrieved_at: string
  published_at: string | null
  read_scope: string
  limitation: string | null
  source_visibility?: 'public' | 'client_private' | 'unknown'
}

export type CollectOptions = {
  fetchPage: FetchPage
  /** Explicit page list (`--pages`) replaces discovery. */
  pages?: string[]
  socialPosts?: SocialPost[]
  materialSources?: ResearchMaterialSource[]
  now?: () => Date
  log?: (message: string) => void
}

const PATH_RANK = [
  /^\/?$/,
  /about|o-nas|o-firmie|team|zespol/i,
  /offer|oferta|services|uslugi|product|produkt|solutions|rozwiazania|pricing|cennik/i,
  /case|realizacj|portfolio|klienci|customers|projects|projekty/i,
  /partner|integrac|integration|technolog|metod|process|proces|how-we-work|jak-pracujemy/i,
  /contact|kontakt/i,
  /blog|insights|news|aktualnosci|nowosci|changelog|wiedza/i,
]

function rankPath(pathname: string): number {
  const index = PATH_RANK.findIndex((pattern) => pattern.test(pathname))
  return index === -1 ? PATH_RANK.length : index
}

/** Same-host links found in a page's markdown, best-first; binary and anchor links excluded. */
export function discoverLinks(markdown: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const found = new Map<string, string>()
  for (const match of markdown.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) {
    try {
      const url = new URL(match[1], base)
      if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue
      if (/\.(pdf|png|jpe?g|gif|svg|webp|zip|mp4|mp3)$/i.test(url.pathname)) continue
      url.hash = ''
      const key = canonicalUrl(url.toString())
      if (!found.has(key)) found.set(key, url.toString())
    } catch {
      // not a URL
    }
  }
  return [...found.entries()]
    .filter(([key]) => key !== canonicalUrl(baseUrl))
    .sort(([, a], [, b]) => rankPath(new URL(a).pathname) - rankPath(new URL(b).pathname) || a.length - b.length)
    .map(([, url]) => url)
}

/**
 * Navigation, footers and link farms are not evidence: lines that are only links,
 * only one or two words, or cookie boilerplate are dropped before extraction.
 */
export function stripBoilerplate(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const kept: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (kept[kept.length - 1] !== '') kept.push('')
      continue
    }
    // A line that is only links (a menu, a footer, an image) says nothing a fact could cite.
    const withoutLinks = line.replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ').replace(/[|•·*\-\s]+/g, ' ').trim()
    if (!withoutLinks) continue
    if (/cookie|ciasteczk|rodo|polityka prywatno|privacy policy/i.test(line) && line.length < 200) continue
    const wordCount = withoutLinks.replace(/[#*_>`-]/g, ' ').split(/\s+/).filter(Boolean).length
    if (wordCount <= 2 && !/^#/.test(line)) continue
    kept.push(line)
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function fetchWithAttempts(fetchPage: FetchPage, url: string, attempts: number): Promise<FetchedPage> {
  let last: FetchedPage = { url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: 'not attempted' }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      last = await fetchPage(url)
    } catch (error) {
      last = { url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: error instanceof Error ? error.message : String(error) }
    }
    if (last.status === 'ok' && last.markdown && last.markdown.trim().length > 0) return last
  }
  return last
}

/** Months between a date and now, floored; null when the date does not parse. */
export function monthsBetween(date: string, now: Date): number | null {
  const then = new Date(date)
  if (Number.isNaN(then.getTime())) return null
  return Math.max(0, (now.getUTCFullYear() - then.getUTCFullYear()) * 12 + now.getUTCMonth() - then.getUTCMonth())
}

/**
 * Company socials go quiet and go stale. A post older than `socialStaleMonths` is dated evidence;
 * when the channel's newest post is that old, every post carries the note so no agent reads
 * the channel as the current offer — the website is the closest thing to the truth then.
 */
export function markStaleSocial(sources: CollectedSource[], now: Date): void {
  const posts = sources.filter((s) => s.origin === 'corpus' && s.published_at)
  if (!posts.length) return
  const ages = posts.map((s) => monthsBetween(s.published_at!, now))
  const newest = Math.min(...ages.filter((age): age is number => age !== null))
  const channelSilent = Number.isFinite(newest) && newest >= limits.research.socialStaleMonths
  posts.forEach((source, index) => {
    const age = ages[index]
    if (age === null || age < limits.research.socialStaleMonths) return
    source.limitation = channelSilent
      ? `dated post (${age} months); no newer communication in the channel — the website states the current offer`
      : `dated post (${age} months) — the website states the current offer`
  })
}

export async function collectSources(order: OrderFacts, opts: CollectOptions): Promise<CollectedSource[]> {
  const now = opts.now ?? (() => new Date())
  const log = opts.log ?? (() => {})
  const retrievedAt = now().toISOString()
  const collected: CollectedSource[] = []
  const seen = new Set<string>()
  let totalChars = 0
  const publisher = order.brand

  const record = (page: FetchedPage, kind: string, channel: string, origin: CollectedSource['origin'], verbatim = false): CollectedSource => {
    // Preserve corpus quotes; strip boilerplate only from fetched pages.
    const cleaned = page.markdown ? (verbatim ? page.markdown : stripBoilerplate(page.markdown)) : null
    let text = cleaned && cleaned.length > 0 ? cleaned : null
    let access: CollectedSource['access'] = text ? 'full' : 'unavailable'
    let readScope = text ? `${text.length} chars read after boilerplate removal` : 'not readable'
    if (text && totalChars + text.length > limits.research.maxTotalChars) {
      const room = Math.max(0, limits.research.maxTotalChars - totalChars)
      text = room > 500 ? text.slice(0, room) : null
      access = text ? 'partial' : 'unavailable'
      readScope = text ? `${text.length} of ${cleaned?.length ?? 0} chars read (order text cap)` : 'not read: order text cap reached'
    }
    if (text) totalChars += text.length
    const source: CollectedSource = {
      source_id: sourceId(collected.length),
      url: page.finalUrl || page.url,
      publisher,
      kind,
      channel,
      origin,
      access,
      title: page.title,
      text,
      bytes: text?.length ?? 0,
      retrieved_at: retrievedAt,
      published_at: null,
      read_scope: readScope,
      limitation: access === 'unavailable' ? (page.error ?? 'page not readable') : access === 'partial' ? 'truncated by the order text cap' : null,
    }
    collected.push(source)
    log(`${source.source_id} ${access} ${source.url}${text ? ` (${text.length} chars)` : ''}`)
    return source
  }

  // Website: the home page first, then the best same-host links up to the cap.
  const home = await fetchWithAttempts(opts.fetchPage, order.websiteUrl, limits.research.fetchAttemptsPerUrl)
  seen.add(canonicalUrl(order.websiteUrl))
  const homeSource = record(home, 'oficjalna strona', 'WWW', 'purchase_form')
  const candidates = opts.pages?.length
    ? opts.pages.filter((url) => canonicalUrl(url) !== canonicalUrl(order.websiteUrl))
    : home.markdown
      ? discoverLinks(home.markdown, homeSource.url)
      : []
  for (const url of candidates) {
    if (collected.filter((s) => s.channel === 'WWW').length >= limits.research.clientWebPagesMax) break
    const key = canonicalUrl(url)
    if (seen.has(key)) continue
    seen.add(key)
    const page = await fetchWithAttempts(opts.fetchPage, url, limits.research.fetchAttemptsPerUrl)
    record(page, 'oficjalna strona (podstrona)', 'WWW', 'agent')
  }

  // One official social profile: a stored corpus (the ToV export) beats a fetch — public profiles rarely render.
  if (opts.socialPosts?.length) {
    const top = [...opts.socialPosts]
      .sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares) || b.postedAt.localeCompare(a.postedAt))
      .slice(0, limits.research.clientSocialItemsTarget)
    for (const post of top) {
      const source = record(
        { url: post.url, finalUrl: post.url, status: 'ok', title: `${post.authorName} — post`, markdown: post.text, error: null },
        'oficjalny kanał publiczny — wpis',
        order.officialSocialPlatform ?? 'LinkedIn',
        'corpus',
        true,
      )
      source.published_at = post.postedAt
      if (source.access !== 'unavailable') {
        source.read_scope = source.access === 'partial'
          ? `${source.text!.length} of ${post.text.length} chars, post truncated by the order text cap (${post.likes} likes, ${post.comments} comments)`
          : `${post.text.length} chars, whole post from the stored corpus (${post.likes} likes, ${post.comments} comments)`
      }
    }
    markStaleSocial(collected, now())
  } else if (order.officialSocialUrl) {
    const page = await fetchWithAttempts(opts.fetchPage, order.officialSocialUrl, limits.research.fetchAttemptsPerUrl)
    const source = record(page, 'oficjalny kanał publiczny', order.officialSocialPlatform ?? 'social', 'purchase_form')
    if (source.access === 'full') {
      source.access = 'partial'
      source.limitation = 'public view only: no history, statistics or audience data'
    }
  }
  // Uploaded evidence is already extracted by native attachments, not a URL to fetch.
  // Preserve its text verbatim for the existing quote grounding; use the same order cap.
  const seenAttachments = new Set<string>()
  for (const material of opts.materialSources ?? []) {
    if (seenAttachments.has(material.attachmentId)) continue
    seenAttachments.add(material.attachmentId)
    const original = material.text?.trim() || null
    const room = Math.max(0, limits.research.maxTotalChars - totalChars)
    const text = original && original.length <= room ? original : original && room > 500 ? original.slice(0, room) : null
    const access = !text ? 'unavailable' : text.length < original!.length ? 'partial' : 'full'
    if (text) totalChars += text.length
    collected.push({
      source_id: sourceId(collected.length),
      url: `attachment://${material.attachmentId}`,
      publisher,
      kind: 'client supplied material',
      channel: 'file',
      origin: 'client',
      source_visibility: 'client_private',
      access,
      title: material.fileName,
      text,
      bytes: text?.length ?? 0,
      retrieved_at: retrievedAt,
      published_at: null,
      read_scope: `${text ? `${text.length} of ${original!.length} extracted chars read` : 'not read'}; submission ${material.submissionId}; uploaded ${material.submittedAt}`,
      limitation: !original ? 'native attachment text extraction unavailable' : access !== 'full' ? 'limited by the order text cap' : null,
    })
  }
  return collected
}

/** Long pages are split by headings into chunks the extractor can read whole. */
export function chunkMarkdown(markdown: string, maxChars = limits.research.pageChunkChars): string[] {
  if (markdown.length <= maxChars) return [markdown]
  const chunks: string[] = []
  let current = ''
  for (const block of markdown.split(/\n(?=#{1,3}\s)/)) {
    if (current.length + block.length + 1 > maxChars && current.length > 0) {
      chunks.push(current)
      current = ''
    }
    if (block.length > maxChars) {
      for (let index = 0; index < block.length; index += maxChars) chunks.push(block.slice(index, index + maxChars))
      continue
    }
    current = current ? `${current}\n${block}` : block
  }
  if (current) chunks.push(current)
  return chunks
}
