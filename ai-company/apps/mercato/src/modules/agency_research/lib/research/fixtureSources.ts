import fs from 'node:fs'
import path from 'node:path'
import type { FetchPage } from './fetch'
import type { SearchHit, SearchWeb } from './firecrawl'

/** A file-backed fetcher for demos without network: `<dir>/manifest.json` maps url → {file, access, title}. */
export function fileFetcher(dir: string): FetchPage {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Record<string, { file?: string; access: string; title?: string; error?: string }>
  return async (url) => {
    const entry = manifest[url] ?? manifest[url.replace(/\/$/, '')]
    if (!entry || entry.access === 'unavailable' || !entry.file) return { url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: entry?.error ?? 'not in fixture manifest' }
    return { url, finalUrl: url, status: 'ok', title: entry.title ?? null, markdown: fs.readFileSync(path.join(dir, entry.file), 'utf8'), error: null }
  }
}

/** Fixture search: `<file>` maps a query (or `*`) to hits. */
export function fileSearch(file: string): SearchWeb {
  const table = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, SearchHit[]>
  return async (query) => table[query] ?? table['*'] ?? []
}

export function configuredFixtureSources(): { fetchPage: FetchPage; searchWeb: SearchWeb } | null {
  const dir = process.env.AGENCY_TEST_RESEARCH_FIXTURE_DIR?.trim()
  if (!dir) return null
  if (process.env.NODE_ENV === 'production' || process.env.AGENCY_TEST_NATIVE_TRIAGE !== '1' || !path.isAbsolute(dir)) {
    throw new Error('[internal] research fixture sources require explicit native test mode, a non-production runtime and an absolute fixture directory')
  }
  const searchFile = path.join(dir, 'search.json')
  return { fetchPage: fileFetcher(dir), searchWeb: fs.existsSync(searchFile) ? fileSearch(searchFile) : async () => [] }
}
