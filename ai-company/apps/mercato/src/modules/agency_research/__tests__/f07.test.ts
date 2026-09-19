import fs from 'node:fs'
import path from 'node:path'
import { audytDataSchema } from '../data/schemas/audyt'
import { konkurencjaDataSchema } from '../data/schemas/konkurencja'
import { orderDataSchema, orderFactsOf } from '../data/schemas/zamowienie'
import { zrodlaDataSchema } from '../data/schemas/zrodla'
import { countClientWords } from '../lib/research/util'
import { collectSources, type FetchPage, type SocialPost } from '../lib/research/fetch'
import type { SearchHit, SearchWeb } from '../lib/research/firecrawl'
import { createLedger } from '../lib/research/ledger'
import { runAuditPipeline } from '../lib/research/steps/audit'
import { competitorQueries, runCompetitorsPipeline, vetSearchHits } from '../lib/research/steps/competitors'
import { runSourcesStep } from '../lib/research/steps/sources'
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
const fixtureSearch: SearchWeb = async () => (JSON.parse(fs.readFileSync(path.join(fixture, 'search.json'), 'utf8')) as Record<string, SearchHit[]>)['*']

const order = orderFactsOf(orderDataSchema.parse(JSON.parse(fs.readFileSync(path.join(fixture, 'order.json'), 'utf8'))))
const socialPosts = (JSON.parse(fs.readFileSync(path.join(fixture, 'social.json'), 'utf8')) as { posts: SocialPost[] }).posts

async function register() {
  const sources = await collectSources(order, { fetchPage: fixtureFetcher(), socialPosts, now: () => new Date('2026-09-19T10:00:00Z') })
  const result = await runSourcesStep({ order, sources, runAgent: createFixtureRunner(path.join(fixture, 'canned')), ledger: createLedger({ prices: {} }), models })
  return result
}

describe('3.3 audit pipeline', () => {
  it('builds WEW-AUDYT from the register, drops unsourced rows, caps gaps and keeps the future voice a client decision', async () => {
    const { data: zrodla, businessProfile } = await register()
    const calls: { agentId: string; input: unknown }[] = []
    const result = await runAuditPipeline({ order, zrodla, businessProfile, runAgent: createFixtureRunner(path.join(fixture, 'canned'), { calls }), ledger: createLedger({ prices: {} }), models })
    expect(audytDataSchema.safeParse(result.data).success).toBe(true)
    expect(calls.map((c) => c.agentId)).toEqual(['agency_research.audit_mapper', 'agency_research.audit_voice_and_gaps'])
    // The invented offer row (F99) is gone; the rest keep their citations.
    expect(result.data.offer_map.map((o) => o.service)).toEqual(['Badania i diagnoza', 'Projektowanie i wdrożenie rozwiązań cyfrowych', 'Szkolenia AI i obsługa promocji'])
    // "evidence" without customer voice is a hypothesis; the scenario id is minted.
    expect(result.data.buyer_map[0]).toMatchObject({ scenario_id: 'B01', status: 'hypothesis', direct_customer_voice: false, fact_ids: ['F03', 'F04', 'A01'] })
    // A proof id that does not exist is dropped from the message map; a conversion judgement without data is removed.
    expect(result.data.message_map[1].proof_ids).toEqual([])
    expect(result.data.journey[0]).toMatchObject({ friction: null, friction_status: 'not_established_in_available_evidence' })
    expect(result.data.voice_audit.channel_difference.sample_ids).toEqual(['L01', 'L04'])
    expect(result.data.gaps.map((g) => g.gap_id)).toEqual(['G01', 'G02', 'G03', 'G04', 'G05'])
    expect(result.data.gaps.map((g) => g.priority)).toEqual(['must', 'must', 'should', 'should', 'could'])
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['UNSOURCED_ITEM', 'NO_AUTO_PROMOTION', 'ROI_WITHOUT_EVIDENCE', 'LIMIT_TRUNCATED']))
    expect(result.issues.some((i) => i.code === 'UNRESOLVED_CITATION')).toBe(false)
    expect(countClientWords(result.clientView)).toBeLessThanOrEqual(450)
    expect(result.clientView).toContain('## Trzy problemy')
  })
})

describe('3.4–3.5 competitors pipeline', () => {
  it('vets search hits and builds queries from the profile', () => {
    const hits = vetSearchHits(
      [
        { url: 'https://www.linkedin.com/company/x/', title: null, snippet: null },
        { url: 'https://makeitflow.pl/index.php', title: null, snippet: null },
        { url: 'https://a.example/', title: null, snippet: null },
        { url: 'https://a.example/b', title: null, snippet: null },
        { url: 'https://b.example/', title: null, snippet: null },
      ],
      'https://makeitflow.pl/',
    )
    expect(hits.map((h) => h.url)).toEqual(['https://a.example/', 'https://b.example/'])
    expect(competitorQueries(order, { category: 'studio badawcze', offer_summary: '', audience_hint: '', market_hint: '', fact_ids: [] })).toEqual(['studio badawcze', 'studio badawcze Polska', 'FLOW Centrum Badawcze alternatives', 'FLOW Centrum Badawcze competitors', 'FLOW Centrum Badawcze vs'])
  })

  it('reads competitor pages through the extractor, appends C-facts to the register and compares without inventing exclusivity', async () => {
    const { data: zrodla, businessProfile } = await register()
    const audit = await runAuditPipeline({ order, zrodla, businessProfile, runAgent: createFixtureRunner(path.join(fixture, 'canned')), ledger: createLedger({ prices: {} }), models })
    const calls: { agentId: string; input: unknown }[] = []
    const log: string[] = []
    const result = await runCompetitorsPipeline({
      order,
      zrodla,
      audyt: audit.data,
      businessProfile,
      fetchPage: fixtureFetcher(),
      searchWeb: fixtureSearch,
      runAgent: createFixtureRunner(path.join(fixture, 'canned'), { calls }),
      ledger: createLedger({ prices: {} }),
      models,
      now: () => new Date('2026-09-19T11:00:00Z'),
      log: (m) => log.push(m),
    })
    expect(konkurencjaDataSchema.safeParse(result.data).success).toBe(true)
    expect(zrodlaDataSchema.safeParse(result.zrodlaV2).success).toBe(true)
    // Selection: the url not from search is dropped; three real hosts remain (one of them unreadable).
    expect(result.data.selection.map((s) => s.company)).toEqual(['Northlight Studio', 'Kubik Digital', 'Pracownia Ekspres'])
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['URL_NOT_FROM_SEARCH', 'COMPETITOR_UNREAD']))
    // Pages: S-07 home + S-08 oferta + S-09 kontakt (unavailable) for Northlight, S-10 Kubik, S-11 Ekspres (unavailable).
    expect(result.appended.sources.map((s) => [s.source_id, s.publisher, s.access])).toEqual([
      ['S-07', 'Northlight Studio', 'full'],
      ['S-08', 'Northlight Studio', 'full'],
      ['S-09', 'Northlight Studio', 'unavailable'],
      ['S-10', 'Kubik Digital', 'full'],
      ['S-11', 'Pracownia Ekspres', 'unavailable'],
    ])
    expect(calls.filter((c) => c.agentId === 'agency_research.page_extractor').map((c) => (c.input as { entity: string; page: { source_id: string } }).entity)).toEqual(['Northlight Studio', 'Northlight Studio', 'Kubik Digital'])
    const competitorFacts = result.zrodlaV2.facts.filter((f) => f.fact_id.startsWith('C'))
    expect(competitorFacts.map((f) => f.fact_id)).toEqual(['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09'])
    expect(competitorFacts.every((f) => f.locator.char_offset !== null)).toBe(true)
    expect(result.zrodlaV2.facts.length).toBe(zrodla.facts.length + 9)
    expect(result.zrodlaV2.sources.length).toBe(zrodla.sources.length + 5)
    // Cards: a citation outside the company's own facts is dropped and the dimension becomes unknown; an unread company is unknown throughout.
    const kubik = result.data.cards.find((c) => c.company === 'Kubik Digital')
    expect(kubik?.proof).toEqual({ text: 'unknown', fact_ids: [], status: null })
    expect(kubik?.service.fact_ids).toEqual(['C07'])
    const ekspres = result.data.cards.find((c) => c.company === 'Pracownia Ekspres')
    expect(ekspres?.market_segment.text).toBe('unknown')
    expect(result.data.channels.every((ch) => ch.business_effectiveness === 'unknown')).toBe(true)
    // Comparison: a parity claim needs two known companies; strength never exceeds its proof; the "jedyni" candidate is flagged.
    expect(result.data.parity_claims).toHaveLength(1)
    expect(result.data.difference_candidates.map((d) => [d.candidate_id, d.allowed_claim_strength])).toEqual([
      ['D01', 'documented_capability'],
      ['D02', 'described_approach'],
      ['D03', 'described_approach'],
    ])
    expect(result.issues.some((i) => i.code === 'UNIQUENESS_FROM_ABSENCE' && i.severity === 'blocking')).toBe(true)
    expect(result.issues.some((i) => i.code === 'RETURN_REQUEST')).toBe(true)
    expect(result.data.implications).toHaveLength(3)
    expect(countClientWords(result.clientView)).toBeLessThanOrEqual(350)
    expect(result.clientView).toContain('| Northlight Studio |')
    expect(result.v1.parity_claims).toEqual([])
    expect(result.stats).toMatchObject({ competitors: 3, pages: 3 })
  })
})
