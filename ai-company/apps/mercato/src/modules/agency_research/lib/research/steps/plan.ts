import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { QaFinding } from '../../../data/schemas/qa'
import type { BriefData } from '../../../data/schemas/brief'
import type { KonkurencjaData } from '../../../data/schemas/konkurencja'
import type { StrategiaData } from '../../../data/schemas/strategia'
import type { TovData } from '../../../data/schemas/tov'
import type { ZrodlaData } from '../../../data/schemas/zrodla'
import { briefDataSchema } from '../../../data/schemas/brief'
import { konkurencjaDataSchema } from '../../../data/schemas/konkurencja'
import { planDataSchema, type PlanData, type PlanTopic } from '../../../data/schemas/plan'
import { strategiaDataSchema } from '../../../data/schemas/strategia'
import { tovDataSchema } from '../../../data/schemas/tov'
import { zrodlaDataSchema } from '../../../data/schemas/zrodla'
import { planWriterResult, type PlanWriterInput, type PlanWriterSection, type PlanWriterSections, type PlanWriterTopic } from '../../../data/agents/plan'
import { idPrefixes, limits } from '../../../data/templates'
import { RESEARCH_PLAN_WRITER_AGENT_ID } from '../../agents/ids.plan'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { GateError, type GateIssue } from '../gate'
import { mintId, resolveId } from '../ids'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { renderPlan, renderPlanClientView } from '../render/plan'
import { simulationIssue } from '../simulation'
import { wordSetSimilarity } from '../util'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 6.2 — KLI-PLAN. The writer is asked for two day windows of six topics and
 * then for the balance and recommendation over the gated twelve; the document
 * is assembled here. Code mints `TOP01…` by day, resolves every cited id in the
 * pinned inputs, refuses paraphrase duplicates, keeps pillars balanced and
 * copies the catalog numbers (topic count, one finished post) — the model never
 * decides how many posts were bought. `selected_topic` stays `awaiting_client`
 * until 6.5 records a selection.
 */

export type PlanPipelineOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  strategia: StrategiaData
  tov: TovData
  brief: BriefData
  zrodla: ZrodlaData
  konkurencja?: KonkurencjaData | null
  /** Pinned document versions (document id → version label) recorded in `plan_context.versions`. */
  versions: Record<string, string>
  simulation: boolean
  previousPlan?: PlanData | null
  repairFindings?: QaFinding[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
  groundingRetries?: number
}

export type PlanPipelineResult = {
  data: PlanData
  issues: DocumentIssue[]
  clientViewMd: string
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}

const SECTION_DAYS: Record<PlanWriterSection, [number, number]> = {
  topics_1_6: [1, 15],
  topics_7_12: [16, 30],
  balance_recommendation: [1, 30],
}

/** Two topics closer than this in words are one idea said twice. */
export const DUPLICATE_SIMILARITY = 0.6
/** No pillar may carry more than this share of the plan. */
export const PILLAR_SHARE_MAX = 0.5

const issue = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

/** Every id a plan may cite: pillars, claims, seeds, facts, proofs, sources, samples, signals. */
export function knownPlanIds(strategia: StrategiaData, zrodla: ZrodlaData): Set<string> {
  return new Set([
    ...strategia.pillars.map((p) => p.pillar_id),
    ...strategia.proof_architecture.map((c) => c.claim_id),
    strategia.uvp.claim_id,
    ...zrodla.content_bank.map((s) => s.seed_id),
    ...zrodla.facts.map((f) => f.fact_id),
    ...zrodla.proof_cards.map((p) => p.proof_id),
    ...zrodla.sources.map((s) => s.source_id),
    ...zrodla.language_samples.map((s) => s.sample_id),
    ...zrodla.audience_signals.map((s) => s.signal_id),
  ])
}

function keepKnown(ids: string[], known: Set<string>, path: string, issues: GateIssue[]): string[] {
  const kept: string[] = []
  for (const cited of ids) {
    const resolved = resolveId(cited, known)
    if (resolved) kept.push(resolved)
    else issues.push(issue('UNKNOWN_ID', path, `${cited} is not a stored id; dropped`))
  }
  return [...new Set(kept)]
}

const topicText = (topic: Pick<PlanWriterTopic, 'audience_question' | 'topic' | 'main_message'>) => `${topic.audience_question} ${topic.topic} ${topic.main_message}`

/** A topics section: the requested count, days inside the window, ids resolved, evidence present, no paraphrase of an earlier topic. */
export function gateTopicsSection(
  section: PlanWriterSection,
  sections: PlanWriterSections,
  args: { known: Set<string>; pillarIds: Set<string>; count: number; existing: Pick<PlanTopic, 'audience_question' | 'topic' | 'main_message'>[] },
): { value: PlanWriterSections; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const topics = sections.topics
  if (!topics) throw new GateError(`plan_writer ${section}`, [issue('MISSING_SECTION', section, 'section key `topics` missing', 'dropped')])
  const [from, to] = SECTION_DAYS[section]
  const kept: PlanWriterTopic[] = []
  const seenDays = new Set<number>()
  for (const [index, topic] of topics.entries()) {
    const path = `${section}.topics[${index}]`
    if (!args.pillarIds.has(topic.pillar_id)) {
      const resolved = resolveId(topic.pillar_id, args.pillarIds)
      if (!resolved) {
        issues.push(issue('UNKNOWN_PILLAR', `${path}.pillar_id`, `${topic.pillar_id} is not a strategy pillar; topic dropped`, 'dropped'))
        continue
      }
      topic.pillar_id = resolved
    }
    const gated: PlanWriterTopic = {
      ...topic,
      claim_ids: keepKnown(topic.claim_ids, args.known, `${path}.claim_ids`, issues),
      seed_ids: keepKnown(topic.seed_ids, args.known, `${path}.seed_ids`, issues),
      fact_ids: keepKnown(topic.fact_ids, args.known, `${path}.fact_ids`, issues),
      proof_ids: keepKnown(topic.proof_ids, args.known, `${path}.proof_ids`, issues),
      source_ids: keepKnown(topic.source_ids, args.known, `${path}.source_ids`, issues),
    }
    if (gated.seed_ids.length + gated.fact_ids.length === 0) {
      issues.push(issue('NO_EVIDENCE', path, `${topic.local_ref} cites no stored seed or fact; topic dropped`, 'dropped'))
      continue
    }
    if (topic.day < from || topic.day > to) {
      issues.push(issue('DAY_OUT_OF_WINDOW', `${path}.day`, `day ${topic.day} outside ${from}–${to}; moved into the window`))
      gated.day = Math.min(to, Math.max(from, topic.day))
    }
    while (seenDays.has(gated.day) && gated.day < to) gated.day += 1
    if (seenDays.has(gated.day)) {
      issues.push(issue('DAY_TAKEN', `${path}.day`, `no free day left in ${from}–${to}; topic dropped`, 'dropped'))
      continue
    }
    seenDays.add(gated.day)
    const earlier = [...args.existing, ...kept].find((other) => wordSetSimilarity(topicText(other), topicText(gated)) >= DUPLICATE_SIMILARITY)
    if (earlier) {
      issues.push(issue('DUPLICATE_TOPIC', path, `${topic.local_ref} paraphrases "${earlier.topic}"; dropped`, 'dropped'))
      continue
    }
    kept.push(gated)
  }
  if (kept.length < args.count) {
    throw new GateError(`plan_writer ${section}`, [...issues, issue('TOPIC_COUNT', section, `${kept.length} usable topics returned, ${args.count} required`, 'dropped')])
  }
  return { value: { topics: kept.slice(0, args.count) }, issues, kept: kept.length, dropped: topics.length - kept.length }
}

/** The balance call: the recommendation must point at one of the twelve gated topics. */
export function gateBalanceSection(sections: PlanWriterSections, topicIds: Set<string>): { value: PlanWriterSections; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  if (!sections.balance || !sections.recommendation) {
    throw new GateError('plan_writer balance_recommendation', [issue('MISSING_SECTION', 'balance_recommendation', 'section keys `balance` and `recommendation` required', 'dropped')])
  }
  const recommended = resolveId(sections.recommendation.topic_id, topicIds)
  if (!recommended) {
    throw new GateError('plan_writer balance_recommendation', [issue('UNKNOWN_TOPIC', 'recommendation.topic_id', `${sections.recommendation.topic_id} is not a plan topic`, 'dropped')])
  }
  const evidence = sections.recommendation.evidence_available.filter((id) => /^[A-Z]+-?\d+$/i.test(id))
  if (evidence.length < sections.recommendation.evidence_available.length) issues.push(issue('EVIDENCE_LIST_TRIMMED', 'recommendation.evidence_available', 'non-id entries removed'))
  return {
    value: { balance: sections.balance, recommendation: { ...sections.recommendation, topic_id: recommended, evidence_available: evidence } },
    issues,
    kept: 2,
    dropped: 0,
  }
}

const T = {
  pl: {
    relativeDays: '1–30; dni to harmonogram treści, nie terminy pracy AI.',
    scopeReady: 'gotowy do napisania z dowodów w banku; akceptacja i publikacja pozostają odrębnymi decyzjami',
    scopeSimulated: 'gotowy do napisania w symulacji; brak rzeczywistej akceptacji planu',
    reuse: (ids: string[]) => `Dzieli materiał z ${ids.join(', ')}; odrębne ujęcie, nie osobne badanie.`,
  },
  en: {
    relativeDays: '1–30; days are the content schedule, not AI deadlines.',
    scopeReady: 'ready to draft from the evidence bank; approval and publication remain separate decisions',
    scopeSimulated: 'ready to draft in simulation; no real plan approval exists',
    reuse: (ids: string[]) => `Shares material with ${ids.join(', ')}; a distinct angle, not a separate study.`,
  },
} as const

/** Pure assembly: `TOP..` ids by day, catalog numbers, pillar arithmetic and the reuse notes belong to code. */
export function assemblePlan(args: {
  outputLanguage: 'pl' | 'en'
  order: OrderFacts
  topics: PlanWriterTopic[]
  balance: PlanWriterSections['balance']
  recommendation: PlanWriterSections['recommendation']
  strategia: StrategiaData
  brief: BriefData
  versions: Record<string, string>
  simulation: boolean
  idByTopic: Map<PlanWriterTopic, string>
}): { data: PlanData; issues: DocumentIssue[] } {
  const { outputLanguage, order, strategia, brief } = args
  const t = T[outputLanguage]
  const issues: DocumentIssue[] = []
  const ordered = [...args.topics].sort((a, b) => a.day - b.day)
  const topics: PlanTopic[] = ordered.map((topic, index) => {
    const { local_ref: _localRef, ...rest } = topic
    const topicId = args.idByTopic.get(topic) ?? mintId(idPrefixes.topic, index)
    const sharing = ordered
      .filter((other) => other !== topic && (other.seed_ids.some((id) => topic.seed_ids.includes(id)) || other.proof_ids.some((id) => topic.proof_ids.includes(id))))
      .map((other) => args.idByTopic.get(other) ?? '')
      .filter((id) => id.length > 0)
    return {
      ...rest,
      topic_id: topicId,
      format: 'text',
      readiness_scope: topic.readiness === 'ready' ? (args.simulation ? t.scopeSimulated : t.scopeReady) : topic.readiness_scope,
      evidence_reuse_note: topic.evidence_reuse_note ?? (sharing.length ? t.reuse(sharing) : null),
    }
  })
  const pillarCounts: Record<string, number> = {}
  for (const pillar of strategia.pillars) pillarCounts[pillar.pillar_id] = 0
  for (const topic of topics) pillarCounts[topic.pillar_id] = (pillarCounts[topic.pillar_id] ?? 0) + 1
  const balance = args.balance!
  if (JSON.stringify(balance.pillar_counts) !== JSON.stringify(pillarCounts)) {
    issues.push({ code: 'PILLAR_COUNTS_RECOMPUTED', severity: 'repaired', detail: 'pillar counts recomputed from the topics; the writer\'s arithmetic differed', path: 'balance.pillar_counts' })
  }
  const recommendation = args.recommendation!
  const recommended = topics.find((topic) => topic.topic_id === recommendation.topic_id)
  const data: PlanData = {
    plan_context: {
      channel: brief.channel_and_cta.channel,
      relative_days: t.relativeDays,
      audience: brief.priority_audience.value ?? strategia.strategic_choice.audience,
      topic_count: order.topics,
      format: 'text',
      finished_posts_in_scope: limits.content.finishedPosts,
      versions: args.versions,
      simulation_flag: args.simulation,
    },
    topics,
    balance: { ...balance, pillar_counts: pillarCounts },
    recommendation: { ...recommendation, readiness: recommended?.readiness ?? 'blocked' },
    selected_topic: { topic_id: null, status: 'awaiting_client', decision_id: null, decision_version: null, decision_text: null, real_approval: false },
  }
  return { data: planDataSchema.parse(data), issues }
}

const finding = (code: QaFinding['code'], path: string, gap: string, owner: QaFinding['owner'] = 'agent', severity: QaFinding['severity'] = 'blocking', fixStep: string | null = '6.2'): QaFinding => ({
  code,
  path,
  severity,
  gap,
  owner,
  fix_step: fixStep,
  fix_hint: null,
})

/**
 * Q-P arithmetic — the validator half of 6.3: the catalog count, distinct days
 * in 1–30, one channel, every pillar used and none dominant, no paraphrase pair,
 * every id stored, readiness backed by evidence, a recommendation that is a ready
 * topic, and no numeric promise without a measured / external proof card.
 */
export function planValidatorFindings(args: { plan: PlanData; strategia: StrategiaData; zrodla: ZrodlaData; topicCount: number }): QaFinding[] {
  const { plan, strategia, zrodla, topicCount } = args
  const findings: QaFinding[] = []
  const known = knownPlanIds(strategia, zrodla)
  if (plan.topics.length !== topicCount) findings.push(finding('limit_exceeded', 'KLI-PLAN.topics', `${plan.topics.length} topics; the pinned offer has ${topicCount}`))
  const days = plan.topics.map((topic) => topic.day)
  if (new Set(days).size !== days.length) findings.push(finding('contradiction', 'KLI-PLAN.topics', 'two topics share a day'))
  if (days.some((day) => day < 1 || day > 30)) findings.push(finding('limit_exceeded', 'KLI-PLAN.topics', 'a day lies outside 1–30'))
  const pillarIds = new Set(strategia.pillars.map((pillar) => pillar.pillar_id))
  const counts = new Map<string, number>()
  for (const topic of plan.topics) {
    const path = `KLI-PLAN.topics[${topic.topic_id}]`
    if (!pillarIds.has(topic.pillar_id)) findings.push(finding('unresolved_reference', `${path}.pillar_id`, `${topic.pillar_id} is not a strategy pillar`))
    counts.set(topic.pillar_id, (counts.get(topic.pillar_id) ?? 0) + 1)
    for (const key of ['claim_ids', 'seed_ids', 'fact_ids', 'proof_ids', 'source_ids'] as const) {
      for (const id of topic[key]) if (!known.has(id)) findings.push(finding('unresolved_reference', `${path}.${key}`, `${id} is not a stored id`))
    }
    if (topic.seed_ids.length + topic.fact_ids.length === 0) findings.push(finding('unsourced_claim', path, 'topic cites no seed or fact'))
    if (topic.readiness === 'ready' && topic.fact_ids.length === 0 && topic.seed_ids.length === 0) findings.push(finding('unsourced_claim', `${path}.readiness`, 'ready without evidence'))
    if (topic.angle.steps.length === 0 && topic.angle.example === null) findings.push(finding('other', `${path}.angle`, 'angle has neither steps nor an example — not concrete enough to write from', 'agent', 'major'))
    const numeric = /\b\d+\s?(%|proc\.|percent|razy|x\b|godzin|dni|tygodni|weeks|days|hours)/i.test(`${topic.main_message} ${topic.evidence_excerpt} ${topic.post_goal}`)
    const measured = topic.proof_ids.some((id) => {
      const card = zrodla.proof_cards.find((proof) => proof.proof_id === id)
      return card?.proof_type === 'measured_case' || card?.proof_type === 'external_confirmation'
    })
    if (numeric && !measured) findings.push(finding('invented_effectiveness', `${path}.main_message`, 'a numeric effect without a measured or externally confirmed proof card'))
    if (topic.cta_type !== 'none' && /\.pdf|webinar|darmow|free audit|bezpłatn/i.test(topic.cta)) findings.push(finding('other', `${path}.cta`, 'the CTA promises a material or service the brief does not offer'))
  }
  for (const pillar of strategia.pillars) {
    if (!counts.has(pillar.pillar_id)) findings.push(finding('other', 'KLI-PLAN.balance.pillar_counts', `pillar ${pillar.pillar_id} has no topic`, 'agent', 'major'))
  }
  for (const [pillarId, count] of counts) {
    if (plan.topics.length && count / plan.topics.length > PILLAR_SHARE_MAX) findings.push(finding('other', 'KLI-PLAN.balance.pillar_counts', `pillar ${pillarId} carries ${count} of ${plan.topics.length} topics`, 'agent', 'major'))
  }
  for (let i = 0; i < plan.topics.length; i += 1) {
    for (let j = i + 1; j < plan.topics.length; j += 1) {
      if (wordSetSimilarity(topicText(plan.topics[i]), topicText(plan.topics[j])) >= DUPLICATE_SIMILARITY) {
        findings.push(finding('contradiction', `KLI-PLAN.topics[${plan.topics[j].topic_id}]`, `paraphrases ${plan.topics[i].topic_id}`))
      }
    }
  }
  const recommended = plan.topics.find((topic) => topic.topic_id === plan.recommendation.topic_id)
  if (!recommended) findings.push(finding('unresolved_reference', 'KLI-PLAN.recommendation.topic_id', `${plan.recommendation.topic_id} is not a plan topic`))
  else if (recommended.readiness !== 'ready') findings.push(finding('other', 'KLI-PLAN.recommendation.topic_id', `recommended topic ${recommended.topic_id} is ${recommended.readiness}; the post cannot be written from it without new research`, 'research', 'blocking', null))
  if (plan.plan_context.finished_posts_in_scope !== limits.content.finishedPosts) findings.push(finding('contradiction', 'KLI-PLAN.plan_context.finished_posts_in_scope', 'the plan must not order more than the purchased finished post'))
  return findings
}

function writerInput(opts: PlanPipelineOptions, section: PlanWriterSection, existing: PlanTopic[]): PlanWriterInput {
  const { order, strategia, tov, brief, zrodla, konkurencja } = opts
  const perSection = Math.ceil(order.topics / 2)
  return {
    order: { brand: order.brand, market: order.market, language: order.language, websiteUrl: order.websiteUrl, purchaseGoal: order.purchaseGoal, sku: order.sku },
    outputLanguage: opts.outputLanguage,
    section,
    days: SECTION_DAYS[section],
    topic_count: section === 'balance_recommendation' ? 0 : section === 'topics_1_6' ? perSection : order.topics - perSection,
    channel: brief.channel_and_cta.channel,
    audience: brief.priority_audience.value ?? strategia.strategic_choice.audience,
    positioning: strategia.strategic_choice.positioning,
    pillars: strategia.pillars.map((p) => ({ pillar_id: p.pillar_id, area: p.area, strategic_goal: p.strategic_goal, audience_question: p.audience_question, allowed_content: p.allowed_content, exclusions: p.exclusions, claim_ids: p.claim_ids, seed_ids: p.seed_ids })),
    claims: strategia.proof_architecture.map((c) => ({ claim_id: c.claim_id, allowed_claim: c.allowed_claim, status: c.status, forbidden_claim: c.forbidden_claim, limitations: c.limitations })),
    creative_boundaries: { not_promoted: strategia.creative_boundaries.not_promoted, prohibited_promises: strategia.creative_boundaries.prohibited_promises, permitted_creativity: strategia.creative_boundaries.permitted_creativity },
    channel_role: { role: strategia.channel_role.role, content_scope: strategia.channel_role.content_scope, limits: strategia.channel_role.limits },
    cta: { goal: brief.channel_and_cta.cta_goal, text: brief.channel_and_cta.cta_text, destination: brief.channel_and_cta.destination },
    voice_traits: tov.voice_principles.map((p) => p.trait),
    seeds: zrodla.content_bank.map((s) => ({ seed_id: s.seed_id, audience_question: s.audience_question, angle: s.angle, source_claim: s.source_claim.text, proposed_utility: s.proposed_utility.text, fact_ids: s.fact_ids, proof_ids: s.proof_ids, prohibited_claims: s.prohibited_claims, readiness: s.readiness })),
    facts: zrodla.facts.map((f) => ({ fact_id: f.fact_id, claim: f.claim, kind: f.kind, source_ids: f.source_ids, limitation: f.limitation })),
    proof_cards: zrodla.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method, observed_result: p.observed_result, limitations: p.limitations })),
    sources: zrodla.sources.filter((s) => s.access !== 'unavailable').map((s) => ({ source_id: s.source_id, publisher: s.publisher, url: s.url_or_file })),
    implications: (konkurencja?.implications ?? []).map((i) => ({ finding: i.finding, limitation: i.limitation })),
    existing_topics: existing.map((topic) => ({ topic_id: topic.topic_id, day: topic.day, pillar_id: topic.pillar_id, audience_question: topic.audience_question, topic: topic.topic, main_message: topic.main_message, seed_ids: topic.seed_ids, claim_ids: topic.claim_ids, fact_ids: topic.fact_ids, proof_ids: topic.proof_ids, readiness: topic.readiness })),
    repair_findings: opts.repairFindings ?? [],
  }
}

export async function runPlanPipeline(opts: PlanPipelineOptions): Promise<PlanPipelineResult> {
  const onEvent = opts.onEvent ?? (() => {})
  const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
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
  const known = knownPlanIds(opts.strategia, opts.zrodla)
  const pillarIds = new Set(opts.strategia.pillars.map((pillar) => pillar.pillar_id))
  const issues: DocumentIssue[] = []
  const perSection = Math.ceil(opts.order.topics / 2)
  const raw: PlanWriterTopic[] = []
  // Ids are minted only once both windows are gated, so the balance call and the document agree.
  const provisional = (topics: PlanWriterTopic[]): PlanTopic[] => {
    const ordered = [...topics].sort((a, b) => a.day - b.day)
    return ordered.map((topic, index) => ({ ...topic, topic_id: mintId(idPrefixes.topic, index), evidence_reuse_note: topic.evidence_reuse_note ?? null }))
  }
  for (const section of ['topics_1_6', 'topics_7_12'] as const) {
    const count = section === 'topics_1_6' ? perSection : opts.order.topics - perSection
    const { value, issues: sectionIssues } = await step<PlanWriterSections>({
      step: '6.2',
      agentId: RESEARCH_PLAN_WRITER_AGENT_ID,
      label: section,
      input: writerInput(opts, section, provisional(raw)),
      parse: (data) => planWriterResult.parse(data).data,
      gate: (data) => gateTopicsSection(section, data, { known, pillarIds, count, existing: raw }),
    })
    issues.push(...sectionIssues)
    raw.push(...(value.topics ?? []))
  }
  const withIds = provisional(raw)
  const idByTopic = new Map<PlanWriterTopic, string>([...raw].sort((a, b) => a.day - b.day).map((topic, index) => [topic, mintId(idPrefixes.topic, index)]))
  const topicIds = new Set(withIds.map((topic) => topic.topic_id))
  const { value: tail, issues: tailIssues } = await step<PlanWriterSections>({
    step: '6.2',
    agentId: RESEARCH_PLAN_WRITER_AGENT_ID,
    label: 'balance_recommendation',
    input: writerInput(opts, 'balance_recommendation', withIds),
    parse: (data) => planWriterResult.parse(data).data,
    gate: (data) => gateBalanceSection(data, topicIds),
  })
  issues.push(...tailIssues)
  const assembled = assemblePlan({
    outputLanguage: opts.outputLanguage,
    order: opts.order,
    topics: raw,
    balance: tail.balance,
    recommendation: tail.recommendation,
    strategia: opts.strategia,
    brief: opts.brief,
    versions: opts.versions,
    simulation: opts.simulation,
    idByTopic,
  })
  issues.push(...assembled.issues)
  const view = renderPlanClientView({ outputLanguage: opts.outputLanguage, brand: opts.order.brand, data: assembled.data })
  if (view.issue) issues.push(view.issue)
  return { data: assembled.data, issues, clientViewMd: view.markdown, stats }
}

const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })

/** The plan's inputs per the WZR-PLAN handoff: strategy, ToV, brief, the frozen register, the comparison, and the previous plan on a revision. */
export async function runPlanStep(ctx: StepContext): Promise<StepOutcome> {
  const strategia = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-STRATEGIA')
  const tov = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-TOV')
  const brief = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-BRIEF')
  const zrodla = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
  if (!strategia || !tov || !brief || !zrodla) throw new Error('[internal] 6.2 needs current KLI-STRATEGIA, KLI-TOV, KLI-BRIEF and WEW-ZRODLA versions — run the process through 5.4 first')
  const konkurencja = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-KONKURENCJA')
  const previous = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-PLAN')
  const inputVersions: InputVersion[] = [ctx.orderVersion, pin(strategia), pin(tov), pin(brief), pin(zrodla), ...(konkurencja ? [pin(konkurencja)] : []), ...(previous ? [pin(previous)] : [])]
  const simulation = simulationIssue(inputVersions)
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '6.2', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const result = await runPlanPipeline({
      order: ctx.order,
      outputLanguage: ctx.order.outputLanguage,
      strategia: strategiaDataSchema.parse(strategia.data),
      tov: tovDataSchema.parse(tov.data),
      brief: briefDataSchema.parse(brief.data),
      zrodla: zrodlaDataSchema.parse(zrodla.data),
      konkurencja: konkurencja ? konkurencjaDataSchema.parse(konkurencja.data) : null,
      versions: Object.fromEntries(inputVersions.map((v) => [v.document_id.split('@')[0], v.version])),
      simulation: simulation !== null,
      previousPlan: previous ? planDataSchema.parse(previous.data) : null,
      repairFindings: ctx.repairFindings,
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      onEvent: ctx.onEvent,
    })
    const issues = simulation ? [...result.issues, simulation] : result.issues
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-PLAN',
      status: 'draft',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderPlan({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: result.data, issues }),
      clientViewMd: result.clientViewMd,
      taskRunId: run.id,
      simulation: simulation !== null,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { stats: result.stats }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
