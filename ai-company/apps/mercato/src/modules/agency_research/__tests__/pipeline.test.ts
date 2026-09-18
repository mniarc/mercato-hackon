import fs from 'node:fs'
import path from 'node:path'
import { orderDataSchema, orderFactsOf } from '../data/schemas/zamowienie'
import { zrodlaDataSchema, type CoverageItem } from '../data/schemas/zrodla'
import { collectSources, type FetchPage, type SocialPost } from '../lib/research/fetch'
import { fieldEvidenceOf, buildEnvelope } from '../lib/research/envelope'
import { BudgetPausedError, createLedger } from '../lib/research/ledger'
import { runSourcesStep, type PipelineCache, type PipelineEvent } from '../lib/research/pipeline'
import { renderZrodla } from '../lib/research/render'
import { createFixtureRunner } from '../lib/runners'

const fixture = path.join(__dirname, '..', '__fixtures__', 'flow')
const models = { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }

function fixtureFetcher(): FetchPage {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixture, 'manifest.json'), 'utf8')) as Record<string, { file?: string; access: string; title?: string; error?: string }>
  return async (url) => {
    const entry = manifest[url]
    if (!entry?.file) return { url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: entry?.error ?? 'not in manifest' }
    return { url, finalUrl: url, status: 'ok', title: entry.title ?? null, markdown: fs.readFileSync(path.join(fixture, entry.file), 'utf8'), error: null }
  }
}

const order = orderFactsOf(orderDataSchema.parse(JSON.parse(fs.readFileSync(path.join(fixture, 'order.json'), 'utf8'))))
const socialPosts = (JSON.parse(fs.readFileSync(path.join(fixture, 'social.json'), 'utf8')) as { posts: SocialPost[] }).posts

function memoryCache(): PipelineCache & { size: () => number } {
  const map = new Map<string, unknown>()
  return { get: async (key) => map.get(key) ?? null, set: async (key, value) => void map.set(key, value), size: () => map.size }
}

describe('collectSources (3.2 fetch, STD-LIMITY)', () => {
  it('records every attempt, dedupes a mirrored page and takes the social profile from the stored corpus', async () => {
    const sources = await collectSources(order, { fetchPage: fixtureFetcher(), socialPosts, now: () => new Date('2026-09-19T10:00:00Z') })
    expect(sources.map((s) => [s.source_id, s.access, s.channel])).toEqual([
      ['S-01', 'full', 'WWW'],
      ['S-02', 'full', 'WWW'],
      ['S-03', 'unavailable', 'WWW'],
      ['S-04', 'full', 'LinkedIn'],
      ['S-05', 'full', 'LinkedIn'],
      ['S-06', 'full', 'LinkedIn'],
    ])
    expect(sources[0].text).not.toContain('[Projekt Flowco.AI]')
    expect(sources[2].limitation).toBe('title only, no readable content')
    expect(sources[3].url).toContain('7460000000000000001')
    expect(sources[3].published_at).toBe('2026-05-02T08:00:00.000Z')
  })
})

describe('runSourcesStep (3.2 map → reduce → gate → WEW-ZRODLA)', () => {
  async function run(cache?: PipelineCache) {
    const sources = await collectSources(order, { fetchPage: fixtureFetcher(), socialPosts, now: () => new Date('2026-09-19T10:00:00Z') })
    const calls: { agentId: string; input: unknown }[] = []
    const events: PipelineEvent[] = []
    const ledger = createLedger({ maxPln: 20, prices: {} })
    const result = await runSourcesStep({
      order,
      sources,
      runAgent: createFixtureRunner(path.join(fixture, 'canned'), { calls }),
      ledger,
      models,
      cache,
      onEvent: (event) => events.push(event),
    })
    return { sources, result, calls, events, ledger }
  }

  it('mints ids in page order, keeps only verbatim evidence and reports what it dropped', async () => {
    const { result, calls } = await run()
    expect(zrodlaDataSchema.safeParse(result.data).success).toBe(true)
    // S-02 is a byte-identical mirror of S-01: read once, cited never.
    expect(result.data.sources.find((s) => s.source_id === 'S-02')?.duplicate_of).toBe('S-01')
    expect(calls.filter((c) => c.agentId === 'agency_research.page_extractor').map((c) => (c.input as { page: { source_id: string } }).page.source_id)).toEqual(['S-01', 'S-04', 'S-05', 'S-06'])
    expect(result.data.facts.map((f) => f.fact_id)).toEqual(Array.from({ length: 15 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`))
    expect(result.data.facts.every((f) => f.locator.char_offset !== null)).toBe(true)
    expect(result.data.facts.map((f) => f.source_ids[0])).toEqual([...Array(8).fill('S-01'), ...Array(3).fill('S-04'), ...Array(3).fill('S-05'), 'S-06'])
    const codes = result.issues.map((i) => i.code)
    expect(codes).toContain('QUOTE_NOT_VERBATIM')
    expect(codes).toContain('INJECTION_SUSPECT')
    expect(result.data.facts.some((f) => /tydzień/.test(f.claim))).toBe(false)
    expect(result.data.language_samples).toHaveLength(6)
    expect(result.data.audience_signals[0].fact_ids).toEqual(['F03', 'F04'])
    expect(result.stats).toMatchObject({ pages: 4, chunks: 4, agentCalls: 8, cachedSteps: 0, rejected: 0 })
  })

  it('applies the proof-card variant rules and never lets a downstream section cite an unknown id', async () => {
    const { result } = await run()
    const cards = result.data.proof_cards
    expect(cards.map((c) => c.proof_id)).toEqual(['P01', 'P02', 'P03', 'P04'])
    expect(cards[2]).toMatchObject({ proof_type: 'declaration', observed_result: null })
    expect(cards[3].fact_ids).toEqual(['F08', 'F14'])
    expect(result.businessProfile.fact_ids).not.toContain('F99')
    const known = new Set([...result.data.facts.map((f) => f.fact_id), ...cards.map((c) => c.proof_id), ...result.data.language_samples.map((s) => s.sample_id), ...result.data.audience_signals.map((s) => s.signal_id), ...result.data.content_bank.map((s) => s.seed_id), ...result.data.sources.map((s) => s.source_id)])
    for (const seed of result.data.content_bank) for (const id of [...seed.fact_ids, ...seed.proof_ids]) expect(known.has(id)).toBe(true)
    for (const row of result.data.coverage) if (row.item_type === 'requirement_coverage') for (const id of row.evidence_ids) expect(known.has(id)).toBe(true)
    expect(result.data.conflicts).toHaveLength(1)
    expect(result.data.conflicts[0].facts).toEqual(['F01', 'F10'])
  })

  it('computes plan capacity and coverage in code, marking what the model could not support', async () => {
    const { result } = await run()
    expect(result.data.content_bank).toHaveLength(12)
    expect(result.data.content_bank.find((s) => s.angle === 'Cały cykl albo etap')?.readiness).toBe('blocked')
    const capacity = result.data.coverage.find((c): c is Extract<CoverageItem, { item_type: 'plan_capacity' }> => c.item_type === 'plan_capacity')
    expect(capacity).toMatchObject({ required_topics: 12, distinct_count: 11, ready_count: 7, readiness: 'conditional' })
    expect(capacity?.unsupported_angles).toEqual(['T06'])
    const coverage = result.data.coverage.filter((c): c is Extract<CoverageItem, { item_type: 'requirement_coverage' }> => c.item_type === 'requirement_coverage')
    expect(coverage.map((c) => c.requirement)).toEqual(['segment', 'problem', 'zakup', 'oferta', 'mechanizm', 'dowód', 'alternatywy', 'język', 'CTA'])
    expect(coverage.find((c) => c.requirement === 'dowód')?.readiness).toBe('blocked')
    expect(coverage.find((c) => c.requirement === 'CTA')).toMatchObject({ readiness: 'blocked', owner: 'research' })
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['PLAN_CAPACITY_SHORT', 'NO_RESULT_CASE', 'SOURCE_UNAVAILABLE']))
  })

  it('reuses cached steps so a rerun costs no agent call, and judges the cache again on read', async () => {
    const cache = memoryCache()
    const first = await run(cache)
    expect(cache.size()).toBe(8)
    const second = await run(cache)
    expect(second.result.stats).toMatchObject({ agentCalls: 0, cachedSteps: 8 })
    expect(second.result.data.facts).toEqual(first.result.data.facts)
    expect(second.ledger.snapshot().entries.every((e) => e.cached)).toBe(true)
  })

  it('stops before the first call when the estimate exceeds the cap', async () => {
    const sources = await collectSources(order, { fetchPage: fixtureFetcher(), socialPosts })
    const ledger = createLedger({ maxPln: 0.01, prices: { fixture: { inputPer1M: 1_000_000, outputPer1M: 0 } }, usdPln: 4 })
    const calls: { agentId: string; input: unknown }[] = []
    await expect(runSourcesStep({ order, sources, runAgent: createFixtureRunner(path.join(fixture, 'canned'), { calls }), ledger, models })).rejects.toBeInstanceOf(BudgetPausedError)
    expect(calls).toHaveLength(0)
    expect(ledger.snapshot().pausedAt).not.toBeNull()
  })

  it('re-requests a page whose extraction has nothing verbatim, then fails the run instead of filling in', async () => {
    const sources = await collectSources(order, { fetchPage: fixtureFetcher(), socialPosts })
    let attempts = 0
    const bad = { kind: 'research', data: { facts: [{ local_ref: 'f1', claim: 'x', quote: 'this text is nowhere on the page at all', kind: 'observed', use_scope: [], limitation: null }], language_samples: [], audience_signals: [], page_summary: 'x' } }
    const runAgent = async () => {
      attempts += 1
      return { result: bad, usage: null }
    }
    await expect(runSourcesStep({ order, sources, runAgent, ledger: createLedger({ prices: {} }), models, groundingRetries: 1, concurrency: 1 })).rejects.toThrow(/nothing grounded survived/)
    expect(attempts).toBe(2)
  })

  it('builds the envelope with field evidence from the cited ids and renders the register', async () => {
    const { result } = await run()
    const envelope = buildEnvelope({ templateId: 'WZR-ZRODLA', orderRef: 'order-1', versionNo: 1, status: 'ready_for_review', inputVersions: [{ document_id: 'WEW-DANE-ZAMOWIENIA@order-1', version: '1.0' }], data: result.data as unknown as Record<string, unknown>, issues: result.issues })
    expect(envelope.document_id).toBe('WEW-ZRODLA@order-1')
    expect(envelope.field_evidence.facts).toEqual(expect.arrayContaining(['F01', 'S-01']))
    expect(envelope.field_evidence.proof_cards).toEqual(expect.arrayContaining(['P01', 'F03']))
    expect(fieldEvidenceOf({ x: [{ y_ids: ['A', 'B'], z_id: 'C' }] })).toEqual({ x: ['A', 'B', 'C'] })
    const md = renderZrodla({ brand: order.brand, data: result.data, businessProfile: result.businessProfile, issues: result.issues, versionLabel: '1' })
    expect(md).toContain('## Fakty (15)')
    expect(md).toContain('> Technologia jest narzędziem. Nadal nie jest celem samym w sobie.')
    expect(md).toContain('Pojemność planu (Q-FREEZE):** 7 gotowych z 12')
  })
})
