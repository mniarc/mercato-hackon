import { idPrefixes } from '../../data/templates'
import { sha256, wordSetSimilarity } from './util'

/**
 * Identifiers are minted by code, never by a model. Rafał's alphabet: S-01 sources,
 * F01/C01 facts (client / competitor), P01 proof cards, L01 samples, A01 signals,
 * T01 seeds, X01 conflicts. Zero-padded to two digits; a run with more than 99
 * items of a kind simply grows to three.
 */

export function mintId(prefix: string, index: number, separator = ''): string {
  const number = String(index + 1).padStart(2, '0')
  return `${prefix}${separator}${number}`
}

export const sourceId = (index: number) => mintId(idPrefixes.source, index, '-')
export const factId = (index: number, competitor = false) => mintId(competitor ? idPrefixes.competitorFact : idPrefixes.fact, index)
export const proofId = (index: number) => mintId(idPrefixes.proof, index)
export const sampleId = (index: number) => mintId(idPrefixes.sample, index)
export const signalId = (index: number) => mintId(idPrefixes.signal, index)
export const seedId = (index: number) => mintId(idPrefixes.seed, index)
export const conflictId = (index: number) => mintId(idPrefixes.conflict, index)

/**
 * Canonical form of a URL: scheme, `www.`, trailing slash, fragment and tracking
 * parameters are presentation. `https://www.x.com/a/?utm_source=y#top` and
 * `http://x.com/a` are one source.
 */
export function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw.trim())
    const params = [...url.searchParams.entries()].filter(([key]) => !/^(utm_|fbclid|gclid|ref$|trk$)/i.test(key))
    params.sort(([a], [b]) => a.localeCompare(b))
    const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : ''
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const path = url.pathname.replace(/\/+$/, '') || '/'
    return `${host}${path}${query}`
  } catch {
    return raw.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')
  }
}

/** A cited id that is a case/padding variant of exactly one known id is that id (F3 → F03); anything else is unknown. */
export function resolveId(cited: string, known: Iterable<string>): string | null {
  const ids = [...known]
  if (ids.includes(cited)) return cited
  const normalise = (id: string) => id.toUpperCase().replace(/[-_\s]/g, '').replace(/^([A-Z]+)0+(\d)/, '$1$2')
  const target = normalise(cited)
  const candidates = ids.filter((id) => normalise(id) === target)
  return candidates.length === 1 ? candidates[0] : null
}

export type MaterialGroup = { canonicalOf: Map<string, string>; materialOf: Map<string, string | null> }

/**
 * Groups stored pages into canonical sources (same normalised URL or identical
 * text) and independent materials (texts that are not near-copies: two URLs with
 * the same FAQ are one material). Pages without text get no material.
 */
export function groupMaterials(pages: { source_id: string; url: string; text: string | null }[]): MaterialGroup {
  const canonicalOf = new Map<string, string>()
  const materialOf = new Map<string, string | null>()
  const byCanonicalUrl = new Map<string, string>()
  const byHash = new Map<string, string>()
  const materials: { id: string; text: string }[] = []
  for (const page of pages) {
    const key = canonicalUrl(page.url)
    const hash = page.text ? sha256(page.text) : null
    const canonical = byCanonicalUrl.get(key) ?? (hash ? byHash.get(hash) : undefined) ?? page.source_id
    canonicalOf.set(page.source_id, canonical)
    if (!byCanonicalUrl.has(key)) byCanonicalUrl.set(key, canonical)
    if (hash && !byHash.has(hash)) byHash.set(hash, canonical)
    if (!page.text) {
      materialOf.set(page.source_id, null)
      continue
    }
    const near = materials.find((material) => wordSetSimilarity(material.text, page.text as string) >= 0.9)
    if (near) {
      materialOf.set(page.source_id, near.id)
      continue
    }
    const id = `MAT-${String(materials.length + 1).padStart(2, '0')}`
    materials.push({ id, text: page.text })
    materialOf.set(page.source_id, id)
  }
  return { canonicalOf, materialOf }
}
