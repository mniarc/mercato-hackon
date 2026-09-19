import type { z } from 'zod'
import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import {
  zrodlaDataSchema,
  type AudienceSignal,
  type BusinessProfile,
  type ContentSeed,
  type Conflict,
  type CoverageItem,
  type Fact,
  type LanguageSample,
  type ProofCard,
  type Source,
  type ZrodlaData,
} from '../../../data/schemas/zrodla'
import {
  contentSeederResult,
  conflictFinderResult,
  coverageAssessorResult,
  pageExtractorResult,
  proofBuilderResult,
  type FactBankInput,
  type OutputLanguage,
  type PageExtraction,
} from '../../../data/validators'
import { coverageNeeds, limits } from '../../../data/templates'
import {
  RESEARCH_CONFLICT_FINDER_AGENT_ID,
  RESEARCH_CONTENT_SEEDER_AGENT_ID,
  RESEARCH_COVERAGE_ASSESSOR_AGENT_ID,
  RESEARCH_PAGE_EXTRACTOR_AGENT_ID,
  RESEARCH_PROOF_BUILDER_AGENT_ID,
  RESEARCH_AGENT_TIERS,
} from '../../agentIds'
import { chunkMarkdown, type CollectedSource } from '../fetch'
import { gateConflicts, gateCoverage, gatePageExtraction, gateProofCards, gateSeeds, planCapacity, type GateIssue } from '../gate'
import { conflictId, factId, groupMaterials, proofId, sampleId, seedId, signalId } from '../ids'
import { mapWithConcurrency, quoteOffset } from '../util'
import { createStepRunner, DEFAULT_CONCURRENCY, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, EXPECTED_OUTPUT_TOKENS, type Ledger, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'

/**
 * Step 3.2 — from stored pages to WEW-ZRODLA. The process lives here, not in a
 * prompt: pages are read one at a time by the extractor (map), the fact bank gets
 * its ids in page order, and four small syntheses (reduce) build proof cards, the
 * content bank, conflicts and coverage over ids — never over page text.
 */

export type Step32Options = {
  order: OrderFacts
  sources: CollectedSource[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  concurrency?: number
  groundingRetries?: number
  onEvent?: (event: PipelineEvent) => void
  extractTimeoutMs?: number
  synthesisTimeoutMs?: number
}

export type Step32Result = {
  data: ZrodlaData
  businessProfile: BusinessProfile
  issues: DocumentIssue[]
  stats: { pages: number; chunks: number; agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}

function factBankInput(order: OrderFacts, lang: OutputLanguage, sources: Source[], facts: Fact[], samples: LanguageSample[], signals: AudienceSignal[]): FactBankInput {
  return {
    order: { brand: order.brand, market: order.market, language: order.language, websiteUrl: order.websiteUrl, purchaseGoal: order.purchaseGoal },
    outputLanguage: lang,
    // No timestamps in agent inputs: the same pages must hit the same cache key on a rerun.
    sources: sources.filter((s) => s.access !== 'unavailable').map((s) => ({ source_id: s.source_id, publisher: s.publisher, kind: s.kind, url: s.url_or_file, access: s.access, retrieved_at: s.retrieved_at.slice(0, 10) })),
    facts: facts.map((f) => ({ fact_id: f.fact_id, entity: f.entity, claim: f.claim, kind: f.kind, source_ids: f.source_ids, limitation: f.limitation })),
    language_samples: samples.map((s) => ({ sample_id: s.sample_id, source_id: s.source_id, channel: s.channel, excerpt: s.excerpt_or_paraphrase })),
    audience_signals: signals.map((s) => ({ signal_id: s.signal_id, role_or_organization: s.role_or_organization, problem: s.problem, evidence_status: s.evidence_status, fact_ids: s.fact_ids })),
  }
}

export async function runSourcesStep(opts: Step32Options): Promise<Step32Result> {
  const onEvent = opts.onEvent ?? (() => {})
  const lang = opts.order.outputLanguage
  const stats = { pages: 0, chunks: 0, agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
  const issues: DocumentIssue[] = []
  const step = createStepRunner({
    runAgent: opts.runAgent,
    ledger: opts.ledger,
    models: opts.models,
    cache: opts.cache,
    groundingRetries: opts.groundingRetries ?? limits.generation.groundingRetries,
    onEvent,
    timeouts: { extract: opts.extractTimeoutMs ?? DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: opts.synthesisTimeoutMs ?? DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
    stats,
  })

  // Sources: every attempt is a row; canonical / material grouping is code.
  const groups = groupMaterials(opts.sources.map((s) => ({ source_id: s.source_id, url: s.url, text: s.text })))
  const sources: Source[] = opts.sources.map((s) => ({
    source_id: s.source_id,
    canonical_source_id: groups.canonicalOf.get(s.source_id) ?? s.source_id,
    independent_material_id: groups.materialOf.get(s.source_id) ?? null,
    url_or_file: s.url,
    publisher: s.publisher,
    kind: s.access === 'unavailable' ? 'access_attempt' : s.kind,
    title: s.title,
    retrieved_at: s.retrieved_at,
    published_at: s.published_at,
    access: s.access,
    read_scope: s.read_scope,
    limitation: s.limitation,
    source_visibility: s.access === 'unavailable' ? 'unknown' : 'public',
    duplicate_of: (groups.canonicalOf.get(s.source_id) ?? s.source_id) === s.source_id ? null : (groups.canonicalOf.get(s.source_id) ?? null),
    origin: s.origin,
  }))
  const textOf = new Map(opts.sources.map((s) => [s.source_id, s.text]))
  const readable = opts.sources.filter((s) => s.text && s.access !== 'unavailable' && (groups.canonicalOf.get(s.source_id) ?? s.source_id) === s.source_id)
  const pages = readable.flatMap((source) => chunkMarkdown(source.text as string).map((text, index, all) => ({ source, text, index, total: all.length })))
  stats.pages = readable.length
  stats.chunks = pages.length
  const estimated = pages.reduce((sum, page) => sum + opts.ledger.estimateCallPln(opts.models.extract, page.text.length + 600, EXPECTED_OUTPUT_TOKENS.extract), 0)
    + 2 * opts.ledger.estimateCallPln(opts.models.synthesis, 20_000, EXPECTED_OUTPUT_TOKENS.synthesis)
    + 2 * opts.ledger.estimateCallPln(opts.models.extract, 12_000, EXPECTED_OUTPUT_TOKENS.extract)
  onEvent({ type: 'plan', step: '3.2', pages: readable.length, chunks: pages.length, estimatedPln: estimated })
  for (const s of opts.sources) {
    if (s.access === 'unavailable') issues.push({ code: 'SOURCE_UNAVAILABLE', severity: 'limitation', detail: `${s.source_id} ${s.url}: ${s.limitation ?? 'not readable'}`, path: `sources.${s.source_id}` })
  }

  // Map: one bounded call per page chunk, in parallel.
  const extractions = await mapWithConcurrency(pages, opts.concurrency ?? DEFAULT_CONCURRENCY, async (page) => {
    const input = {
      order: { brand: opts.order.brand, market: opts.order.market, language: opts.order.language, websiteUrl: opts.order.websiteUrl, purchaseGoal: opts.order.purchaseGoal },
      entity: 'client',
      page: {
        source_id: page.source.source_id,
        url: page.source.url,
        publisher: page.source.publisher,
        channel: page.source.channel,
        origin: page.source.origin,
        chunk: { index: page.index, total: page.total },
        content_md: page.text,
      },
      outputLanguage: lang,
    }
    const { value, issues: pageIssues } = await step<PageExtraction>({
      step: '3.2',
      agentId: RESEARCH_PAGE_EXTRACTOR_AGENT_ID,
      label: `${page.source.source_id}#${page.index + 1}/${page.total}`,
      input,
      parse: (raw) => pageExtractorResult.parse(raw).data,
      gate: (extraction) => gatePageExtraction(extraction, page.text, page.source.source_id),
    })
    issues.push(...pageIssues)
    return { page, value }
  })

  // Ids in page order; local refs become global ids once, before any reduce call.
  const facts: Fact[] = []
  const samples: LanguageSample[] = []
  const signals: AudienceSignal[] = []
  for (const { page, value } of extractions) {
    const refToId = new Map<string, string>()
    for (const fact of value.facts) {
      const id = factId(facts.length)
      refToId.set(fact.local_ref, id)
      facts.push({
        fact_id: id,
        entity: opts.order.brand,
        claim: fact.claim,
        source_ids: [page.source.source_id],
        locator: { source_id: page.source.source_id, quote: fact.quote, char_offset: quoteOffset(fact.quote, textOf.get(page.source.source_id) ?? page.text) },
        paraphrase: fact.claim,
        kind: fact.kind,
        use_scope: fact.use_scope,
        limitation: fact.limitation,
      })
    }
    for (const sample of value.language_samples) {
      samples.push({
        sample_id: sampleId(samples.length),
        independent_material_id: groups.materialOf.get(page.source.source_id) ?? page.source.source_id,
        canonical_source_id: groups.canonicalOf.get(page.source.source_id) ?? page.source.source_id,
        source_id: page.source.source_id,
        excerpt_or_paraphrase: sample.excerpt,
        channel: page.source.channel,
        suggested_audience: sample.suggested_audience,
        situation: sample.situation,
        linguistic_features: sample.linguistic_features,
        observed_function: sample.observed_function,
        sample_limit: 'Krótki fragment; nie reprezentuje całego kanału ani przyszłego ToV.',
      })
    }
    for (const signal of value.audience_signals) {
      signals.push({
        signal_id: signalId(signals.length),
        role_or_organization: signal.role_or_organization,
        trigger: signal.trigger,
        problem: signal.problem,
        risk: signal.risk,
        objection: signal.objection,
        evidence_status: signal.evidence_status,
        fact_ids: signal.fact_refs.map((ref) => refToId.get(ref)).filter((id): id is string => id !== undefined),
      })
    }
  }
  if (facts.length === 0) {
    throw new Error('[internal] 3.2: no grounded fact from any readable source — the register cannot be built; check the fetch report')
  }
  const factIds = new Set(facts.map((f) => f.fact_id))
  const caseFactIds = new Set(facts.filter((f) => f.kind === 'case_evidence').map((f) => f.fact_id))
  const bank = factBankInput(opts.order, lang, sources, facts, samples, signals)

  // Reduce 1: proof cards + business profile.
  const proofs = await step<z.infer<typeof proofBuilderResult>['data']>({
    step: '3.2',
    agentId: RESEARCH_PROOF_BUILDER_AGENT_ID,
    label: 'proof_cards',
    input: bank,
    parse: (raw) => proofBuilderResult.parse(raw).data,
    gate: (data) => {
      const gated = gateProofCards(data.proof_cards, factIds, caseFactIds)
      const profileFactIds = data.business_profile.fact_ids.filter((id) => factIds.has(id))
      return { ...gated, value: { proof_cards: gated.value, business_profile: { ...data.business_profile, fact_ids: profileFactIds } } }
    },
  })
  issues.push(...proofs.issues)
  const proofCards: ProofCard[] = proofs.value.proof_cards.map((card, index) => ({
    proof_id: proofId(index),
    proof_type: card.proof_type,
    problem: card.problem,
    actual_action: card.actual_action,
    artifact_or_method: card.artifact_or_method,
    observed_result: card.observed_result,
    fact_ids: card.fact_ids,
    source_ids: [...new Set(card.fact_ids.flatMap((id) => facts.find((f) => f.fact_id === id)?.source_ids ?? []))],
    limitations: card.limitations,
    source_visibility: 'public',
    allowed_use: 'internal_only',
    use_basis_ref: null,
    client_name_permission: 'unknown',
    quote_permission: 'unknown',
    provenance: card.proof_type === 'declaration' ? 'inferred' : 'observed',
  }))
  const proofIds = new Set(proofCards.map((p) => p.proof_id))

  // Reduce 2: content bank (target = the pinned offer's topic count).
  const seeds = await step<z.infer<typeof contentSeederResult>['data']>({
    step: '3.2',
    agentId: RESEARCH_CONTENT_SEEDER_AGENT_ID,
    label: 'content_bank',
    input: { ...bank, proof_cards: proofCards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method, fact_ids: p.fact_ids })), requiredTopics: opts.order.topics },
    parse: (raw) => contentSeederResult.parse(raw).data,
    gate: (data) => {
      const gated = gateSeeds(data.content_bank, factIds, proofIds)
      return { ...gated, value: { content_bank: gated.value } }
    },
  })
  issues.push(...seeds.issues)
  const contentBank: ContentSeed[] = seeds.value.content_bank.map((seed, index) => ({
    seed_id: seedId(index),
    audience_question: seed.audience_question,
    angle: seed.angle,
    source_claim: {
      text: seed.source_claim,
      fact_ids: seed.source_claim_fact_ids,
      source_ids: [...new Set(seed.source_claim_fact_ids.flatMap((id) => facts.find((f) => f.fact_id === id)?.source_ids ?? []))],
      provenance: 'observed',
    },
    proposed_utility: { text: seed.proposed_utility, provenance: 'creative_proposal' },
    fact_ids: seed.source_claim_fact_ids,
    proof_ids: seed.proof_ids,
    provenance: 'creative_proposal',
    reuse_of_evidence: { note: null, shared_fact_ids: [], shared_proof_ids: [] },
    prohibited_claims: seed.prohibited_claims,
    readiness: seed.readiness,
    readiness_reason: seed.readiness_reason,
  }))
  // Reuse of evidence is arithmetic: which other seeds cite the same facts/proofs.
  for (const seed of contentBank) {
    const shared_fact_ids = seed.fact_ids.filter((id) => contentBank.some((other) => other !== seed && other.fact_ids.includes(id)))
    const shared_proof_ids = seed.proof_ids.filter((id) => contentBank.some((other) => other !== seed && other.proof_ids.includes(id)))
    seed.reuse_of_evidence = {
      note: shared_fact_ids.length || shared_proof_ids.length ? 'Odrębne ujęcie tej samej treści dowodowej; nie niezależny case study.' : null,
      shared_fact_ids,
      shared_proof_ids,
    }
  }

  // Reduce 3: conflicts.
  const conflictsOut = await step<z.infer<typeof conflictFinderResult>['data']>({
    step: '3.2',
    agentId: RESEARCH_CONFLICT_FINDER_AGENT_ID,
    label: 'conflicts',
    input: { order: bank.order, outputLanguage: lang, facts: bank.facts, sources: bank.sources },
    parse: (raw) => conflictFinderResult.parse(raw).data,
    gate: (data) => {
      const gated = gateConflicts(data.conflicts, factIds)
      return { ...gated, value: { conflicts: gated.value } }
    },
  })
  issues.push(...conflictsOut.issues)
  const conflicts: Conflict[] = conflictsOut.value.conflicts.map((conflict, index) => ({
    conflict_id: conflictId(index),
    facts: conflict.fact_ids,
    // Day precision, publication date first: when a conflicting statement was published (else read) matters, the millisecond does not — and it would change every rerun's inputs.
    dates: [...new Set(conflict.fact_ids.flatMap((id) => facts.find((f) => f.fact_id === id)?.source_ids ?? []).map((sid) => (sources.find((s) => s.source_id === sid)?.published_at ?? sources.find((s) => s.source_id === sid)?.retrieved_at ?? '').slice(0, 10)).filter(Boolean))],
    detail: conflict.detail,
    impact: conflict.impact,
    question: conflict.question,
    state: conflict.state,
  }))

  // Reduce 4: requirement coverage; plan capacity is computed here, not asked for.
  const knownIds = new Set([...factIds, ...proofIds, ...samples.map((s) => s.sample_id), ...signals.map((s) => s.signal_id), ...contentBank.map((s) => s.seed_id), ...sources.map((s) => s.source_id)])
  const coverageOut = await step<z.infer<typeof coverageAssessorResult>['data']>({
    step: '3.2',
    agentId: RESEARCH_COVERAGE_ASSESSOR_AGENT_ID,
    label: 'coverage',
    input: {
      ...bank,
      proof_cards: proofCards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, fact_ids: p.fact_ids })),
      content_bank: contentBank.map((s) => ({ seed_id: s.seed_id, audience_question: s.audience_question, readiness: s.readiness })),
      conflicts: conflicts.map((c) => ({ conflict_id: c.conflict_id, state: c.state })),
      requirements: [...coverageNeeds],
    },
    parse: (raw) => coverageAssessorResult.parse(raw).data,
    gate: (data) => {
      const gated = gateCoverage(data.coverage, coverageNeeds, knownIds)
      return { ...gated, value: { coverage: gated.value } }
    },
  })
  issues.push(...coverageOut.issues)
  const coverage: CoverageItem[] = [
    ...coverageOut.value.coverage.map((row) => ({ item_type: 'requirement_coverage' as const, ...row })),
    planCapacity(contentBank, opts.order.topics),
  ]

  const data = zrodlaDataSchema.parse({ sources, facts, proof_cards: proofCards, language_samples: samples, audience_signals: signals, content_bank: contentBank, conflicts, coverage })
  if (samples.length < 5) {
    issues.push({ code: 'LIMITED_LANGUAGE_SAMPLE', severity: 'limitation', detail: `${samples.length} language samples across ${new Set(samples.map((s) => s.independent_material_id)).size} materials; the current voice can be described only partially`, path: 'language_samples' })
  }
  if (caseFactIds.size === 0) {
    issues.push({ code: 'NO_RESULT_CASE', severity: 'claim_blocker', detail: 'no measured case in the public sources: promises about effects are blocked until the client provides one', path: 'proof_cards' })
  }
  const capacity = coverage.find((c): c is Extract<CoverageItem, { item_type: 'plan_capacity' }> => c.item_type === 'plan_capacity')
  if (capacity && capacity.readiness !== 'ready') {
    issues.push({ code: 'PLAN_CAPACITY_SHORT', severity: 'q_freeze_blocker', detail: `${capacity.ready_count} ready of ${capacity.required_topics} required distinct angles`, path: 'coverage.plan_capacity' })
  }
  return { data, businessProfile: proofs.value.business_profile, issues, stats }
}
