import { assertPublicUrl } from '@open-mercato/web-research'
import type { FetchPage, FetchedPage } from './fetch'

/**
 * Production page fetcher: Firecrawl's scrape endpoint (server-side rendering, so
 * JavaScript sites arrive as markdown) behind the platform's SSRF guard. Imported
 * only by the CLI and the service — the pipeline sees a `FetchPage` function, and
 * tests give it files instead.
 */

export type FirecrawlOptions = {
  apiKey: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export function createFirecrawlFetcher(opts: FirecrawlOptions): FetchPage {
  const baseUrl = (opts.baseUrl ?? 'https://api.firecrawl.dev').replace(/\/$/, '')
  const timeoutMs = opts.timeoutMs ?? 45_000
  const fetchImpl = opts.fetchImpl ?? fetch
  if (!opts.apiKey) throw new Error('[internal] FIRECRAWL_API_KEY is required for live page fetching')
  return async (url): Promise<FetchedPage> => {
    const unavailable = (error: string): FetchedPage => ({ url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error })
    try {
      await assertPublicUrl(url, 'research source')
    } catch (error) {
      return unavailable(`blocked: ${error instanceof Error ? error.message : String(error)}`)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${baseUrl}/v1/scrape`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
        signal: controller.signal,
      })
      if (!response.ok) return unavailable(`firecrawl ${response.status}`)
      const body = (await response.json()) as {
        success?: boolean
        data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string; statusCode?: number } }
        error?: string
      }
      const markdown = body.data?.markdown?.trim() ?? ''
      if (!body.success || markdown.length === 0) return unavailable(body.error ?? 'no readable content')
      const statusCode = body.data?.metadata?.statusCode ?? 200
      if (statusCode >= 400) return unavailable(`http ${statusCode}`)
      return {
        url,
        finalUrl: body.data?.metadata?.sourceURL ?? url,
        status: 'ok',
        title: body.data?.metadata?.title ?? null,
        markdown,
        error: null,
      }
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error))
    } finally {
      clearTimeout(timer)
    }
  }
}

export type SearchHit = { url: string; title: string | null; snippet: string | null }
export type SearchWeb = (query: string, opts?: { limit?: number }) => Promise<SearchHit[]>

/** Firecrawl's search endpoint for competitor discovery (3.4); results are candidates the code then vets and fetches. */
export function createFirecrawlSearch(opts: FirecrawlOptions): SearchWeb {
  const baseUrl = (opts.baseUrl ?? 'https://api.firecrawl.dev').replace(/\/$/, '')
  const timeoutMs = opts.timeoutMs ?? 30_000
  const fetchImpl = opts.fetchImpl ?? fetch
  if (!opts.apiKey) throw new Error('[internal] FIRECRAWL_API_KEY is required for live search')
  return async (query, options = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${baseUrl}/v1/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({ query, limit: options.limit ?? 5 }),
        signal: controller.signal,
      })
      if (!response.ok) return []
      const body = (await response.json()) as { success?: boolean; data?: { url?: string; title?: string; description?: string }[] }
      return (body.data ?? []).filter((hit) => typeof hit.url === 'string').map((hit) => ({ url: hit.url as string, title: hit.title ?? null, snippet: hit.description ?? null }))
    } catch {
      return []
    } finally {
      clearTimeout(timer)
    }
  }
}
