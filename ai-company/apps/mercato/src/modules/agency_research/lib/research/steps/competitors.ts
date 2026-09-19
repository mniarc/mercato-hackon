import { competitorCardResult, competitorChannelsResult, competitorSelectorResult, competitorSynthesizerResult } from '../../../data/agents/competitors'
import type { AudytData } from '../../../data/schemas/audyt'
import type { DocumentIssue } from '../../../data/schemas/envelope'
import { konkurencjaDataSchema, type KonkurencjaData } from '../../../data/schemas/konkurencja'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import { zrodlaDataSchema, type BusinessProfile, type Fact, type LanguageSample, type Source, type ZrodlaData } from '../../../data/schemas/zrodla'
import { pageExtractorResult, type PageExtraction } from '../../../data/validators'
import { limits } from '../../../data/templates'
import { RESEARCH_COMPETITOR_CARD_AGENT_ID, RESEARCH_COMPETITOR_CHANNELS_AGENT_ID, RESEARCH_COMPETITOR_SELECTOR_AGENT_ID, RESEARCH_COMPETITOR_SYNTHESIZER_AGENT_ID } from '../../agents/ids.competitors'
import { RESEARCH_PAGE_EXTRACTOR_AGENT_ID } from '../../agents/ids.sources'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, saveSources, startTaskRun } from '../../store'
import { checkClientView } from '../clientView'
import { chunkMarkdown, discoverLinks, stripBoilerplate, type CollectedSource, type FetchPage, type FetchedPage } from '../fetch'
import type { SearchHit, SearchWeb } from '../firecrawl'
import { gatePageExtraction, unresolvedCitations, type GateIssue } from '../gate'
import { canonicalUrl, groupMaterials, resolveId, sourceId } from '../ids'
import { BudgetPausedError } from '../ledger'
import { createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type Ledger, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner, type StepFn } from '../pipeline'
import { renderKonkurencja, renderKonkurencjaClientView } from '../render/konkurencja'
import { renderZrodla } from '../render/zrodla'
import { mapWithConcurrency, quoteOffset } from '../util'
import { registerIds } from './audit'
import type { StepContext, StepOutcome } from './context'

/**
 * Steps 3.4 and 3.5 — WEW-KONKURENCJA. Discovery is code (search queries built
 * from the business profile, hits vetted against aggregator hosts), the selector
 * chooses ≤ 3 among real hits, pages are read by the same extractor as the client's
 * (entity = the competitor, facts `C01…`, sources appended to WEW-ZRODLA v2), one
 * card per company, then the comparison on common criteria. Effectiveness is
 * `unknown` unless measured; absence at a competitor never proves exclusivity.
 */

export type CompetitorsPipelineOptions = {
  order: OrderFacts
  zrodla: ZrodlaData
  audyt: Pick<AudytData, 'offer_map' | 'buyer_map' | 'message_map'>
  businessProfile: BusinessProfile
  fetchPage: FetchPage
  searchWeb: SearchWeb
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  concurrency?: number
  onEvent?: (event: PipelineEvent) => void
  repairFindings?: unknown[]
  /** A stored selection to read again instead of searching: keeps a plain rerun on the same companies (and its caches). */
  reuseSelection?: Candidates['candidates']
  groundingRetries?: number
  now?: () => Date
  log?: (message: string) => void
}

export type CompetitorsPipelineResult = {
  /** WEW-KONKURENCJA after 3.4 (selection, cards, channels) — version 1. */
  v1: KonkurencjaData
  /** WEW-KONKURENCJA after 3.5 — version 2. */
  data: KonkurencjaData
  /** WEW-ZRODLA v2 = v1 + competitor sources, facts (C-ids) and samples. */
  zrodlaV2: ZrodlaData
  appended: { sources: CollectedSource[]; facts: number; samples: number }
  issues: DocumentIssue[]
  clientView: string
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number; competitors: number; pages: number }
}

const AGGREGATOR_HOSTS = /(^|\.)(linkedin|facebook|instagram|twitter|x|youtube|wikipedia|g2|capterra|clutch|crunchbase|reddit|medium|glassdoor|indeed|pracuj|goldenline|trustpilot|producthunt|github|gov|amazon|apple|google)\.(com|co|pl|org|io|net)$/i

const issue = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

/** Search queries are code: category and market from the profile, plus the classic "alternatives" formulations. */
export function competitorQueries(order: OrderFacts, profile: BusinessProfile): string[] {
  const category = profile.category.replace(/\s+/g, ' ').trim().slice(0, 90)
  return [...new Set([`${category}`, `${category} ${order.market}`, `${order.brand} alternatives`, `${order.brand} competitors`, `${order.brand} vs`])]
}

/** Keeps hits from company hosts: not the client, not aggregators, one hit per host. */
export function vetSearchHits(hits: SearchHit[], clientUrl: string): SearchHit[] {
  const clientHost = hostOf(clientUrl)
  const seen = new Set<string>()
  const kept: SearchHit[] = []
  for (const hit of hits) {
    const host = hostOf(hit.url)
    if (!host || host === clientHost || AGGREGATOR_HOSTS.test(host) || seen.has(host)) continue
    seen.add(host)
    kept.push(hit)
  }
  return kept
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

type Candidates = ReturnType<typeof competitorSelectorResult.parse>['data']

/** ≤ 3 candidates, every url a real hit, one per host. */
export function gateCandidates(data: Candidates, hits: SearchHit[], max: number): { value: Candidates; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const hitUrls = new Map(hits.map((hit) => [canonicalUrl(hit.url), hit.url]))
  const hosts = new Set<string>()
  const candidates = data.candidates.flatMap((candidate, index) => {
    const url = hitUrls.get(canonicalUrl(candidate.url))
    if (!url) {
      issues.push(issue('URL_NOT_FROM_SEARCH', `selection[${index}]`, `${candidate.company}: ${candidate.url} is not a search result`, 'dropped'))
      return []
    }
    const host = hostOf(url)
    if (hosts.has(host)) {
      issues.push(issue('DUPLICATE_COMPETITOR', `selection[${index}]`, `${candidate.company} repeats host ${host}`, 'dropped'))
      return []
    }
    hosts.add(host)
    return [{ ...candidate, url }]
  })
  if (candidates.length > max) issues.push(issue('LIMIT_TRUNCATED', 'selection', `${candidates.length} candidates; STD-LIMITY allows ${max}`))
  const value = { candidates: candidates.slice(0, max), excluded: data.excluded }
  return { value, issues, kept: value.candidates.length, dropped: data.candidates.length - value.candidates.length }
}

type Synthesis = ReturnType<typeof competitorSynthesizerResult.parse>['data']

/** Alternates the selector ranks beyond the cap, read only when a chosen company turns out unreadable. */
const COMPETITOR_ALTERNATES = 2

/** Parity needs two companies that exist; a differentiator never claims more than its proof; implications 3–5. */
export function gateSynthesis(data: Synthesis, known: Set<string>, companies: string[], proofTypes: Map<string, string>): { value: Synthesis; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const resolve = (ids: string[], path: string) => {
    const kept = ids.map((id) => resolveId(id, known)).filter((id): id is string => id !== null)
    if (kept.length < ids.length) issues.push(issue('UNKNOWN_ID', path, `dropped ${ids.length - kept.length} unknown citation(s)`))
    return [...new Set(kept)]
  }
  const names = new Set(companies.map((c) => c.toLowerCase()))
  const parity_claims = data.parity_claims.flatMap((claim, index) => {
    const listed = claim.companies.filter((c) => names.has(c.toLowerCase()))
    if (listed.length < 2) {
      issues.push(issue('PARITY_WITHOUT_COMPANIES', `parity_claims[${index}]`, `"${claim.claim}" names fewer than two known companies`, 'dropped'))
      return []
    }
    return [{ ...claim, companies: listed, evidence_ids: resolve(claim.evidence_ids, `parity_claims[${index}]`) }]
  })
  const alternative_routes = data.alternative_routes.map((route, index) => ({ ...route, evidence_ids: resolve(route.evidence_ids, `alternative_routes[${index}]`) }))
  const strengthOrder = ['hypothesis', 'described_approach', 'documented_capability', 'demonstrated_result'] as const
  const difference_candidates = data.difference_candidates.slice(0, 3).map((candidate, index) => {
    const proof_ids = resolve(candidate.proof_ids, `difference_candidates[${index}].proof_ids`)
    const fact_ids = resolve(candidate.fact_ids, `difference_candidates[${index}].fact_ids`)
    const measured = proof_ids.some((id) => proofTypes.get(id) === 'measured_case')
    let strength = candidate.allowed_claim_strength
    if (strength === 'demonstrated_result' && !measured) {
      strength = 'documented_capability'
      issues.push(issue('NO_AUTO_PROMOTION', `difference_candidates[${index}]`, 'demonstrated_result without a measured case; lowered to documented_capability'))
    }
    if (proof_ids.length === 0 && strengthOrder.indexOf(strength) > 1) {
      strength = 'described_approach'
      issues.push(issue('NO_AUTO_PROMOTION', `difference_candidates[${index}]`, 'no proof card behind the candidate; lowered to described_approach'))
    }
    if (/\b(only|jedyn\w*|unique|unikaln\w*|wyłączn\w*|exclusive)\b/i.test(candidate.comparison) && !candidate.unknown.trim()) {
      issues.push(issue('UNIQUENESS_FROM_ABSENCE', `difference_candidates[${index}]`, 'uniqueness asserted without naming what is unknown', 'blocking'))
    }
    return { candidate_id: `D${String(index + 1).padStart(2, '0')}`, ...candidate, proof_ids, fact_ids, allowed_claim_strength: strength }
  })
  if (data.difference_candidates.length > 3) issues.push(issue('LIMIT_TRUNCATED', 'difference_candidates', `${data.difference_candidates.length} candidates; kept 3`))
  const implications = data.implications.slice(0, 5).map((imp, index) => ({ ...imp, evidence_ids: resolve(imp.evidence_ids, `implications[${index}]`) }))
  if (implications.length < 3) issues.push(issue('LIST_SHORT', 'implications', `${implications.length} implications; the template asks for 3–5`, 'limitation'))
  const value = { parity_claims, alternative_routes, difference_candidates, implications, return_requests: data.return_requests }
  return { value, issues, kept: parity_claims.length + difference_candidates.length + implications.length, dropped: data.parity_claims.length - parity_claims.length }
}

async function fetchCompetitorPages(url: string, fetchPage: FetchPage, log: (m: string) => void): Promise<FetchedPage[]> {
  const pages: FetchedPage[] = []
  let home: FetchedPage = { url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: 'not attempted' }
  for (let attempt = 0; attempt < limits.research.fetchAttemptsPerUrl; attempt += 1) {
    try {
      home = await fetchPage(url)
    } catch (error) {
      home = { url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: error instanceof Error ? error.message : String(error) }
    }
    if (home.status === 'ok' && home.markdown) break
  }
  pages.push(home)
  log(`${home.status} ${url}`)
  if (!home.markdown) return pages
  const seen = new Set([canonicalUrl(url)])
  for (const link of discoverLinks(home.markdown, home.finalUrl || url)) {
    if (pages.length >= limits.research.competitorPagesEachMax) break
    const key = canonicalUrl(link)
    if (seen.has(key)) continue
    seen.add(key)
    let page: FetchedPage
    try {
      page = await fetchPage(link)
    } catch (error) {
      page = { url: link, finalUrl: link, status: 'unavailable', title: null, markdown: null, error: error instanceof Error ? error.message : String(error) }
    }
    pages.push(page)
    log(`${page.status} ${link}`)
  }
  return pages
}

export async function runCompetitorsPipeline(opts: CompetitorsPipelineOptions): Promise<CompetitorsPipelineResult> {
  const onEvent = opts.onEvent ?? (() => {})
  const log = opts.log ?? (() => {})
  const now = opts.now ?? (() => new Date())
  const lang = opts.order.outputLanguage
  const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0, competitors: 0, pages: 0 }
  const issues: DocumentIssue[] = []
  const step = createStepRunner({
    runAgent: opts.runAgent,
    ledger: opts.ledger,
    models: opts.models,
    cache: opts.cache,
    groundingRetries: opts.groundingRetries ?? limits.generation.groundingRetries,
    onEvent,
    timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
    stats,
  })
  const orderCtx = { brand: opts.order.brand, market: opts.order.market, language: opts.order.language, websiteUrl: opts.order.websiteUrl, purchaseGoal: opts.order.purchaseGoal }

  // 3.4a — discovery in code, selection by the agent among real hits. Search results move between runs;
  // a plain rerun keeps the stored selection so the same pages, cards and every downstream cache hold.
  const hits: SearchHit[] = []
  if (!opts.reuseSelection?.length) {
    for (const query of competitorQueries(opts.order, opts.businessProfile)) {
      const found = await opts.searchWeb(query, { limit: 5 })
      log(`search "${query}": ${found.length} hits`)
      hits.push(...found)
    }
  }
  const vetted = vetSearchHits(hits, opts.order.websiteUrl)
  if (!opts.reuseSelection?.length && vetted.length === 0) issues.push({ code: 'NO_COMPETITOR_HITS', severity: 'limitation', detail: 'search returned no company hosts to compare with; competitor sections are empty', path: 'selection' })
  const selection = opts.reuseSelection?.length
    ? { value: { candidates: opts.reuseSelection, excluded: [] }, issues: [] as GateIssue[], cached: true }
    : vetted.length
    ? await step<Candidates>({
        step: '3.4',
        agentId: RESEARCH_COMPETITOR_SELECTOR_AGENT_ID,
        label: 'selection',
        input: {
          order: orderCtx,
          outputLanguage: lang,
          business_profile: opts.businessProfile,
          offer_map: opts.audyt.offer_map.map((o) => ({ service: o.service, described_audience: o.described_audience, problem: o.problem })),
          buyer_map: opts.audyt.buyer_map.map((b) => ({ status: b.status, job: b.job, purchase_moment: b.purchase_moment })),
          search_hits: vetted,
          maxCompetitors: limits.research.competitorEntitiesMax + COMPETITOR_ALTERNATES,
        },
        parse: (raw) => competitorSelectorResult.parse(raw).data,
        gate: (data) => gateCandidates(data, vetted, limits.research.competitorEntitiesMax + COMPETITOR_ALTERNATES),
      })
    : { value: { candidates: [], excluded: [] }, issues: [] as GateIssue[], cached: false }
  issues.push(...selection.issues)

  // 3.4b — pages of each competitor through the same extractor; appended to the register.
  const retrievedAt = now().toISOString()
  const appendedSources: CollectedSource[] = []
  const newFacts: Fact[] = []
  const newSamples: LanguageSample[] = []
  const factsByCompany = new Map<string, Fact[]>()
  const samplesByCompany = new Map<string, LanguageSample[]>()
  let sourceIndex = opts.zrodla.sources.length
  let factIndex = opts.zrodla.facts.filter((f) => f.fact_id.startsWith('C')).length
  let sampleIndex = opts.zrodla.language_samples.length
  // Read candidates in the selector's order until STD-LIMITY companies have yielded a grounded fact;
  // a company whose pages cannot be read is excluded and the next alternate takes its place.
  const accepted: Candidates['candidates'] = []
  for (const candidate of selection.value.candidates) {
    if (accepted.length >= limits.research.competitorEntitiesMax) break
    const pages = await fetchCompetitorPages(candidate.url, opts.fetchPage, (m) => log(`${candidate.company}: ${m}`))
    const collected: CollectedSource[] = pages.map((page) => {
      const text = page.markdown ? stripBoilerplate(page.markdown) : null
      const source: CollectedSource = {
        source_id: sourceId(sourceIndex++),
        url: page.finalUrl || page.url,
        publisher: candidate.company,
        kind: text ? 'strona konkurenta' : 'access_attempt',
        channel: 'WWW',
        origin: 'agent',
        access: text ? 'full' : 'unavailable',
        title: page.title,
        text,
        bytes: text?.length ?? 0,
        retrieved_at: retrievedAt,
        published_at: null,
        read_scope: text ? `${text.length} chars read after boilerplate removal` : 'not readable',
        limitation: text ? null : (page.error ?? 'page not readable'),
      }
      return source
    })
    appendedSources.push(...collected)
    const groups = groupMaterials(collected.map((s) => ({ source_id: s.source_id, url: s.url, text: s.text })))
    const readable = collected.filter((s) => s.text && (groups.canonicalOf.get(s.source_id) ?? s.source_id) === s.source_id)
    const chunks = readable.flatMap((source) => chunkMarkdown(source.text as string).map((text, index, all) => ({ source, text, index, total: all.length })))
    stats.pages += readable.length
    const extractions = await mapWithConcurrency(chunks, opts.concurrency ?? 4, async (chunk) => {
      const { value, issues: pageIssues } = await step<PageExtraction>({
        step: '3.4',
        agentId: RESEARCH_PAGE_EXTRACTOR_AGENT_ID,
        label: `${candidate.company} ${chunk.source.source_id}#${chunk.index + 1}/${chunk.total}`,
        input: {
          order: orderCtx,
          entity: candidate.company,
          page: { source_id: chunk.source.source_id, url: chunk.source.url, publisher: candidate.company, channel: 'WWW', origin: 'agent', chunk: { index: chunk.index, total: chunk.total }, content_md: chunk.text },
          outputLanguage: lang,
        },
        parse: (raw) => pageExtractorResult.parse(raw).data,
        gate: (extraction) => gatePageExtraction(extraction, chunk.text, chunk.source.source_id),
      })
      issues.push(...pageIssues)
      return { chunk, value }
    })
    const companyFacts: Fact[] = []
    const companySamples: LanguageSample[] = []
    for (const { chunk, value } of extractions) {
      for (const fact of value.facts) {
        companyFacts.push({
          fact_id: `C${String(++factIndex).padStart(2, '0')}`,
          entity: candidate.company,
          claim: fact.claim,
          source_ids: [chunk.source.source_id],
          locator: { source_id: chunk.source.source_id, quote: fact.quote, char_offset: quoteOffset(fact.quote, chunk.source.text ?? chunk.text) },
          paraphrase: fact.claim,
          kind: fact.kind,
          use_scope: fact.use_scope,
          limitation: fact.limitation,
        })
      }
      for (const sample of value.language_samples) {
        companySamples.push({
          sample_id: `L${String(++sampleIndex).padStart(2, '0')}`,
          independent_material_id: groups.materialOf.get(chunk.source.source_id) ?? chunk.source.source_id,
          canonical_source_id: groups.canonicalOf.get(chunk.source.source_id) ?? chunk.source.source_id,
          source_id: chunk.source.source_id,
          excerpt_or_paraphrase: sample.excerpt,
          channel: 'WWW',
          suggested_audience: sample.suggested_audience,
          situation: sample.situation,
          linguistic_features: sample.linguistic_features,
          observed_function: sample.observed_function,
          sample_limit: `Fragment z materiału konkurenta (${candidate.company}); nie opisuje głosu klienta.`,
        })
      }
    }
    if (companyFacts.length === 0) {
      issues.push({ code: 'COMPETITOR_UNREAD', severity: 'limitation', detail: `${candidate.company}: no readable page yielded a grounded fact; replaced by the next candidate`, path: `selection.${candidate.company}` })
      continue
    }
    factsByCompany.set(candidate.company, companyFacts)
    samplesByCompany.set(candidate.company, companySamples)
    newFacts.push(...companyFacts)
    newSamples.push(...companySamples)
    accepted.push(candidate)
  }
  stats.competitors = accepted.length

  const zrodlaV2: ZrodlaData = zrodlaDataSchema.parse({
    ...opts.zrodla,
    sources: [
      ...opts.zrodla.sources,
      ...appendedSources.map(
        (s): Source => ({
          source_id: s.source_id,
          canonical_source_id: s.source_id,
          independent_material_id: s.text ? s.source_id : null,
          url_or_file: s.url,
          publisher: s.publisher,
          kind: s.kind,
          title: s.title,
          retrieved_at: s.retrieved_at,
          published_at: null,
          access: s.access,
          read_scope: s.read_scope,
          limitation: s.limitation,
          source_visibility: s.access === 'unavailable' ? 'unknown' : 'public',
          duplicate_of: null,
          origin: 'agent',
        }),
      ),
    ],
    facts: [...opts.zrodla.facts, ...newFacts],
    language_samples: [...opts.zrodla.language_samples, ...newSamples],
  })
  const known = registerIds(zrodlaV2)

  // 3.4c — one card per company.
  const cards: KonkurencjaData['cards'] = []
  const channels: KonkurencjaData['channels'] = []
  for (const candidate of accepted) {
    const facts = factsByCompany.get(candidate.company) ?? []
    const samples = samplesByCompany.get(candidate.company) ?? []
    const companyIds = new Set([...facts.map((f) => f.fact_id), ...samples.map((s) => s.sample_id), ...appendedSources.filter((s) => s.publisher === candidate.company).map((s) => s.source_id)])
    const companyInput = {
      order: orderCtx,
      outputLanguage: lang,
      company: candidate.company,
      selection: { competition_type: candidate.competition_type, shared_problem_scope: candidate.shared_problem_scope, reason: candidate.reason },
      sources: appendedSources.filter((s) => s.publisher === candidate.company).map((s) => ({ source_id: s.source_id, url: s.url, kind: s.kind, access: s.access })),
      facts: facts.map((f) => ({ fact_id: f.fact_id, kind: f.kind, claim: f.claim, limitation: f.limitation, source_ids: f.source_ids })),
      language_samples: samples.map((s) => ({ sample_id: s.sample_id, excerpt: s.excerpt_or_paraphrase, linguistic_features: s.linguistic_features })),
    }
    const fixIds = (gateIssues: GateIssue[]) => (ids: string[], path: string) => {
      const kept = ids.filter((id) => companyIds.has(id))
      if (kept.length < ids.length) gateIssues.push(issue('UNKNOWN_ID', path, `${candidate.company}: dropped citations outside this competitor's facts`))
      return kept
    }
    // The same packet feeds two agents: the comparable card, then the channel observation.
    const card = await step<ReturnType<typeof competitorCardResult.parse>['data']>({
      step: '3.4',
      agentId: RESEARCH_COMPETITOR_CARD_AGENT_ID,
      label: `card ${candidate.company}`,
      input: companyInput,
      parse: (raw) => competitorCardResult.parse(raw).data,
      gate: (data) => {
        const gateIssues: GateIssue[] = []
        const fix = fixIds(gateIssues)
        const dims = ['market_segment', 'problem', 'service', 'message', 'mechanism', 'proof', 'cta', 'language'] as const
        const fixed = { ...data.card }
        for (const dim of dims) {
          const fact_ids = fix(fixed[dim].fact_ids, `cards.${candidate.company}.${dim}`)
          // A dimension with no fact behind it is unknown, not a description from memory.
          fixed[dim] = fact_ids.length ? { ...fixed[dim], fact_ids } : { text: 'unknown', fact_ids: [], status: null }
        }
        fixed.channels = { ...fixed.channels, fact_ids: fix(fixed.channels.fact_ids, `cards.${candidate.company}.channels`) }
        return { value: { card: fixed }, issues: gateIssues, kept: 1, dropped: 0 }
      },
    })
    issues.push(...card.issues)
    const observation = await step<ReturnType<typeof competitorChannelsResult.parse>['data']>({
      step: '3.4',
      agentId: RESEARCH_COMPETITOR_CHANNELS_AGENT_ID,
      label: `channels ${candidate.company}`,
      input: companyInput,
      parse: (raw) => competitorChannelsResult.parse(raw).data,
      gate: (data) => {
        const gateIssues: GateIssue[] = []
        const channel_observation = { ...data.channel_observation, fact_ids: fixIds(gateIssues)(data.channel_observation.fact_ids, `channels.${candidate.company}`) }
        return { value: { channel_observation }, issues: gateIssues, kept: 1, dropped: 0 }
      },
    })
    issues.push(...observation.issues)
    cards.push({ company: candidate.company, ...card.value.card })
    channels.push({
      company: candidate.company,
      visible_activity: observation.value.channel_observation.visible_activity,
      sample: observation.value.channel_observation.sample,
      retrieved_at: retrievedAt,
      published_dates: null,
      visible_metrics: observation.value.channel_observation.visible_metrics,
      business_effectiveness: 'unknown',
      unknowns: observation.value.channel_observation.unknowns,
      fact_ids: observation.value.channel_observation.fact_ids,
    })
  }
  const v1: KonkurencjaData = konkurencjaDataSchema.parse({
    selection: accepted.map((c) => ({ ...c, fact_ids: (factsByCompany.get(c.company) ?? []).slice(0, 3).map((f) => f.fact_id) })),
    cards,
    parity_claims: [],
    alternative_routes: [],
    difference_candidates: [],
    channels,
    implications: [],
  })

  // 3.5 — the comparison on common criteria.
  const comparison = await synthesizeComparison({ step, order: opts.order, zrodla: zrodlaV2, audyt: opts.audyt, v1, known, repairFindings: opts.repairFindings ?? [] })
  const data = comparison.data
  issues.push(...comparison.issues)
  return { v1, data, zrodlaV2, appended: { sources: appendedSources, facts: newFacts.length, samples: newSamples.length }, issues, clientView: comparison.clientView, stats }
}

export type ComparisonArgs = {
  step: StepFn
  order: OrderFacts
  /** The register WITH the competitor material (WEW-ZRODLA v2). */
  zrodla: ZrodlaData
  audyt: Pick<AudytData, 'offer_map' | 'buyer_map' | 'message_map'>
  /** WEW-KONKURENCJA v1: selection, cards, channels. */
  v1: KonkurencjaData
  known: Set<string>
  repairFindings: unknown[]
}

/** 3.5 alone: the comparison over existing cards. A repair of 3.5 re-runs only this, never the search and the pages. */
export async function synthesizeComparison(args: ComparisonArgs): Promise<{ data: KonkurencjaData; issues: DocumentIssue[]; clientView: string }> {
  const { step, order, zrodla, audyt, v1, known } = args
  const lang = order.outputLanguage
  const issues: DocumentIssue[] = []
  const orderCtx = { brand: order.brand, market: order.market, language: order.language, websiteUrl: order.websiteUrl, purchaseGoal: order.purchaseGoal }
  const proofTypes = new Map(zrodla.proof_cards.map((p) => [p.proof_id, p.proof_type]))
  const synthesis = await step<Synthesis>({
    step: '3.5',
    agentId: RESEARCH_COMPETITOR_SYNTHESIZER_AGENT_ID,
    label: 'comparison',
    input: {
      order: orderCtx,
      outputLanguage: lang,
      client: {
        offer_map: audyt.offer_map.map((o) => ({ service: o.service, problem: o.problem, mechanism: o.mechanism, fact_ids: o.fact_ids })),
        buyer_map: audyt.buyer_map.map((b) => ({ scenario_id: b.scenario_id, status: b.status, job: b.job, objections: b.objections })),
        message_map: audyt.message_map.map((m) => ({ message: m.message, benefit: m.benefit, mechanism: m.mechanism, proof_ids: m.proof_ids, fact_ids: m.fact_ids })),
        proof_cards: zrodla.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method, observed_result: p.observed_result })),
      },
      selection: v1.selection.map((s) => ({ company: s.company, competition_type: s.competition_type, shared_problem_scope: s.shared_problem_scope })),
      cards: v1.cards,
      repair_findings: args.repairFindings,
    },
    parse: (raw) => competitorSynthesizerResult.parse(raw).data,
    gate: (data) => gateSynthesis(data, known, [order.brand, ...v1.selection.map((s) => s.company)], proofTypes),
  })
  issues.push(...synthesis.issues)
  const data: KonkurencjaData = konkurencjaDataSchema.parse({ ...v1, ...synthesis.value, implications: synthesis.value.implications })
  issues.push(...unresolvedCitations({ ...data, cards: [] }, new Set([...known, ...v1.selection.map((s) => s.company)])))
  for (const request of synthesis.value.return_requests) {
    issues.push({ code: 'RETURN_REQUEST', severity: 'research', detail: `→ ${request.target_step}: ${request.question} (${request.source_to_check})`, path: 'return_requests' })
  }
  const view = checkClientView('WZR-KONKURENCJA', renderKonkurencjaClientView({ brand: order.brand, data, language: lang }))
  if (view.issue) issues.push(view.issue)
  return { data, issues, clientView: view.markdown }
}

/**
 * 3.5 as its own step over the stored documents: the current WEW-KONKURENCJA
 * (its selection, cards and channels stay) and WEW-ZRODLA (with the competitor
 * material) feed one comparison call; the result is a new WEW-KONKURENCJA
 * version. This is what a QA repair addressed to 3.5 re-runs — not the search,
 * not the pages, not the cards.
 */
export async function runComparisonStep(ctx: StepContext): Promise<StepOutcome> {
  const zrodla = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
  const audyt = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-AUDYT')
  const previous = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-KONKURENCJA')
  if (!zrodla || !audyt || !previous) throw new Error('[internal] 3.5 needs stored WEW-ZRODLA, WEW-AUDYT and WEW-KONKURENCJA versions — run 3.4 first')
  const inputVersions = [ctx.orderVersion, { document_id: zrodla.document_id, version: zrodla.version, status: zrodla.status }, { document_id: audyt.document_id, version: audyt.version, status: audyt.status }, { document_id: previous.document_id, version: previous.version, status: previous.status }]
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '3.5', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
    const step = createStepRunner({
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      groundingRetries: limits.generation.groundingRetries,
      onEvent: ctx.onEvent,
      timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
      stats,
    })
    const register = zrodlaDataSchema.parse(zrodla.data)
    const v1 = konkurencjaDataSchema.parse(previous.data)
    const result = await synthesizeComparison({ step, order: ctx.order, zrodla: register, audyt: audyt.data as AudytData, v1, known: registerIds(register), repairFindings: ctx.repairFindings })
    const label = Number(previous.version.split('.')[0]) + 1
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-KONKURENCJA',
      status: 'ready_for_review',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues: result.issues,
      renderedMd: renderKonkurencja({ brand: ctx.order.brand, data: result.data, issues: result.issues, versionLabel: String(label) }),
      clientViewMd: result.clientView,
      taskRunId: run.id,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { stats, comparisonOnly: true }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

/** DB wrapper for 3.4 + 3.5: two task runs, WEW-KONKURENCJA v1 and v2, WEW-ZRODLA v2 with the competitor material. */
export async function runCompetitorsStep(ctx: StepContext): Promise<StepOutcome> {
  if (!ctx.searchWeb) throw new Error('[internal] 3.4 needs a web search function (FIRECRAWL_API_KEY) or a fixture search')
  const zrodla = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
  const audyt = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-AUDYT')
  if (!zrodla || !audyt) throw new Error('[internal] 3.4 needs stored WEW-ZRODLA and WEW-AUDYT versions')
  const sourcesRun = await ctx.em.getConnection().execute(`select summary from agency_research_task_runs where tenant_id = ? and organization_id = ? and order_ref = ? and step_id = '3.2' and status = 'done' order by created_at desc limit 1`, [ctx.scope.tenantId, ctx.scope.organizationId, ctx.orderRef])
  const summary = (Array.isArray(sourcesRun) ? sourcesRun[0]?.summary : null) as { businessProfile?: BusinessProfile } | null
  if (!summary?.businessProfile) throw new Error('[internal] 3.4 needs the O-3.2 business profile')
  const inputVersions = [ctx.orderVersion, { document_id: zrodla.document_id, version: zrodla.version, status: zrodla.status }, { document_id: audyt.document_id, version: audyt.version, status: audyt.status }]
  const run34 = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '3.4', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run34.id)
  let run35: Awaited<ReturnType<typeof startTaskRun>> | null = null
  const previousComparison = ctx.repairFindings.length ? null : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-KONKURENCJA')
  const storedSelection = previousComparison ? konkurencjaDataSchema.safeParse(previousComparison.data) : null
  const reuseSelection = storedSelection?.success && storedSelection.data.selection.length
    ? storedSelection.data.selection.map((row) => ({ company: row.company, url: row.url, competition_type: row.competition_type, shared_problem_scope: row.shared_problem_scope, market_scale_difference: row.market_scale_difference, reason: row.reason }))
    : undefined
  if (reuseSelection) ctx.log(`3.4 reuses the stored selection (${reuseSelection.map((c) => c.company).join(', ')}) — no new search`)
  try {
    const result = await runCompetitorsPipeline({
      order: ctx.order,
      zrodla: zrodla.data as ZrodlaData,
      audyt: audyt.data as AudytData,
      businessProfile: summary.businessProfile,
      fetchPage: ctx.fetchPage,
      searchWeb: ctx.searchWeb,
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      concurrency: ctx.concurrency,
      onEvent: ctx.onEvent,
      repairFindings: ctx.repairFindings,
      reuseSelection,
      log: ctx.log,
    })
    // 3.4 outputs: the supplemented register and the comparison cards.
    await saveSources(ctx.em, ctx.scope, ctx.orderRef, run34.id, result.appended.sources)
    const zrodlaV2 = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-ZRODLA',
      status: 'ready_for_review',
      inputVersions: [ctx.orderVersion, { document_id: zrodla.document_id, version: zrodla.version, status: zrodla.status }],
      data: result.zrodlaV2 as unknown as Record<string, unknown>,
      issues: result.issues.filter((i) => i.code === 'COMPETITOR_UNREAD' || i.code === 'QUOTE_NOT_VERBATIM'),
      renderedMd: renderZrodla({ brand: ctx.order.brand, data: result.zrodlaV2, businessProfile: summary.businessProfile, issues: [], versionLabel: String(Number(zrodla.version.split('.')[0]) + 1) }),
      taskRunId: run34.id,
    })
    ctx.documentVersionIds.push(zrodlaV2.version.id)
    const previous = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-KONKURENCJA')
    const v1Label = previous ? Number(previous.version.split('.')[0]) + 1 : 1
    const v1 = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-KONKURENCJA',
      status: 'draft',
      inputVersions: [...inputVersions, { document_id: zrodlaV2.envelope.document_id, version: zrodlaV2.envelope.version, status: zrodlaV2.envelope.status }],
      data: result.v1 as unknown as Record<string, unknown>,
      issues: result.issues.filter((i) => i.path?.startsWith('selection') || i.path?.startsWith('cards') || i.code === 'NO_COMPETITOR_HITS'),
      renderedMd: renderKonkurencja({ brand: ctx.order.brand, data: result.v1, issues: [], versionLabel: String(v1Label) }),
      taskRunId: run34.id,
    })
    ctx.documentVersionIds.push(v1.version.id)
    await finishTaskRun(ctx.em, run34, { status: 'done', outputVersionId: v1.version.id, summary: { competitors: result.stats.competitors, pages: result.stats.pages, appendedFacts: result.appended.facts }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })

    // 3.5 output: the comparison, as version 2.
    run35 = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '3.5', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions: [...inputVersions, { document_id: v1.envelope.document_id, version: v1.envelope.version, status: v1.envelope.status }] })
    ctx.taskRunIds.push(run35.id)
    const v2 = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-KONKURENCJA',
      status: 'ready_for_review',
      inputVersions: [...inputVersions, { document_id: v1.envelope.document_id, version: v1.envelope.version, status: v1.envelope.status }],
      data: result.data as unknown as Record<string, unknown>,
      issues: result.issues,
      renderedMd: renderKonkurencja({ brand: ctx.order.brand, data: result.data, issues: result.issues, versionLabel: String(v1Label + 1) }),
      clientViewMd: result.clientView,
      taskRunId: run35.id,
    })
    ctx.documentVersionIds.push(v2.version.id)
    await finishTaskRun(ctx.em, run35, { status: 'done', outputVersionId: v2.version.id, summary: { stats: result.stats, returnRequests: result.data.implications.length }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run35.id, versionId: v2.version.id, status: 'done' }
  } catch (error) {
    const paused = error instanceof BudgetPausedError
    const failing = run35 ?? run34
    await finishTaskRun(ctx.em, failing, { status: paused ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
