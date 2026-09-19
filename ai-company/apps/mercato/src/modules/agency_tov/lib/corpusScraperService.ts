import type { TovPost, TovSource } from '../data/validators'
import { createApifyClient } from './corpus/apify'
import { scrapeTargets } from './corpus/sources'

/**
 * A small DI seam other lanes may resolve *optionally* (ADR-001: no imports
 * across the agency modules): given one public profile URL it returns the
 * normalised posts the ToV corpus would hold, fetched live through Apify with
 * the same adapters the `agency_tov` CLI uses. Unavailable without
 * `APIFY_TOKEN`; a caller that gets `available() === false` proceeds without a
 * corpus rather than failing.
 */

export const AGENCY_TOV_CORPUS_SCRAPER = 'agencyTovCorpusScraper' as const

export type CorpusScraperService = {
  available(): boolean
  /** The source adapter a URL maps to, or null when no adapter exists for that host. */
  sourceOf(url: string): TovSource | null
  scrape(input: { url: string; maxPosts: number; log?: (message: string) => void }): Promise<{ posts: TovPost[]; actorId: string; items: number; error: string | null }>
}

const SOURCE_HOSTS: Array<[RegExp, TovSource]> = [
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)(x|twitter)\.com$/, 'x'],
  [/(^|\.)facebook\.com$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
]

export function createCorpusScraperService(env: NodeJS.ProcessEnv = process.env): CorpusScraperService {
  const token = () => env.APIFY_TOKEN?.trim() || ''
  return {
    available: () => token().length > 0,
    sourceOf(url) {
      try {
        const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
        return SOURCE_HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? null
      } catch {
        return null
      }
    },
    async scrape({ url, maxPosts, log }) {
      const source = this.sourceOf(url)
      if (!source) return { posts: [], actorId: '', items: 0, error: 'no adapter for this host' }
      if (!token()) return { posts: [], actorId: '', items: 0, error: 'APIFY_TOKEN is not configured' }
      const client = createApifyClient({ token: token(), log })
      const { corpus, reports } = await scrapeTargets(client, [{ source, url }], { maxPostsPerSource: maxPosts, env, log })
      const report = reports[0]
      return { posts: corpus.posts.slice(0, maxPosts), actorId: report?.actorId ?? '', items: report?.items ?? 0, error: report?.error ?? null }
    },
  }
}
