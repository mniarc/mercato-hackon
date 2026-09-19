import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { QaFinding } from '../../../data/schemas/qa'
import type { AudytData } from '../../../data/schemas/audyt'
import type { UstaleniaData } from '../../../data/schemas/ustalenia'
import type { ZrodlaData } from '../../../data/schemas/zrodla'
import { briefDataSchema, type BriefData } from '../../../data/schemas/brief'
import { audytDataSchema } from '../../../data/schemas/audyt'
import { ustaleniaDataSchema } from '../../../data/schemas/ustalenia'
import { zrodlaDataSchema } from '../../../data/schemas/zrodla'
import { briefWriterResult, type BriefWriterInput, type BriefWriterSections } from '../../../data/agents/brief'
import { limits } from '../../../data/templates'
import { RESEARCH_BRIEF_WRITER_AGENT_ID } from '../../agents/ids.brief'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { GateError, type GateIssue } from '../gate'
import { resolveId } from '../ids'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { renderBrief, renderBriefClientView } from '../render/brief'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 4.1 — KLI-BRIEF. The writer is asked three times, once per section group,
 * and the document is assembled here: decision states come from the findings
 * map (never from the model), permissions are copied from the proof cards ("no
 * auto promotion"), `client_selection` is forced null, open assumptions are
 * every field still awaiting the client. Everything cited must resolve in the
 * pinned inputs.
 */

export type BriefPipelineOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  ustalenia: UstaleniaData
  zrodla: ZrodlaData
  audyt: AudytData
  previousBrief?: BriefData | null
  repairFindings?: QaFinding[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
  groundingRetries?: number
}

export type BriefPipelineResult = {
  data: BriefData
  issues: DocumentIssue[]
  clientViewMd: string
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}

const SECTION_KEYS = {
  offer_audience_direction: ['priority_offer', 'priority_audience', 'business_direction'],
  promise_voice: ['promise_constraints', 'voice_preferences'],
  channel_success_assets: ['channel_and_cta', 'success_and_limits', 'assets_and_permissions', 'buyer_reality'],
} as const

type SectionName = keyof typeof SECTION_KEYS

const issue = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

/** Every id a brief may cite: facts, proofs, samples, signals, seeds, sources, questions, field keys. */
export function knownBriefIds(zrodla: ZrodlaData, ustalenia: UstaleniaData): Set<string> {
  return new Set([
    ...zrodla.facts.map((f) => f.fact_id),
    ...zrodla.proof_cards.map((p) => p.proof_id),
    ...zrodla.language_samples.map((s) => s.sample_id),
    ...zrodla.audience_signals.map((s) => s.signal_id),
    ...zrodla.content_bank.map((s) => s.seed_id),
    ...zrodla.sources.map((s) => s.source_id),
    ...ustalenia.questions.map((q) => q.question_id),
    ...ustalenia.evidence_requests.map((r) => r.request_id),
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

/** The section keys the requested call must return; anything else the model added is ignored. */
export function gateSection(section: SectionName, sections: BriefWriterSections, known: Set<string>): { value: BriefWriterSections; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const missing = SECTION_KEYS[section].filter((key) => sections[key] === undefined)
  if (missing.length) throw new GateError(`brief_writer ${section}`, [issue('MISSING_SECTION', section, `section keys missing: ${missing.join(', ')}`, 'dropped')])
  const value: BriefWriterSections = {}
  for (const key of SECTION_KEYS[section]) (value as Record<string, unknown>)[key] = sections[key]
  const walk = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) return node.map((item, index) => walk(item, `${path}[${index}]`))
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = /(^|_)ids$/.test(k) && Array.isArray(v) ? keepKnown(v.filter((x): x is string => typeof x === 'string'), known, `${path}.${k}`, issues) : walk(v, `${path}.${k}`)
      }
      return out
    }
    return node
  }
  const gated = walk(value, section) as BriefWriterSections
  return { value: gated, issues, kept: SECTION_KEYS[section].length, dropped: issues.length }
}

type DecidedKey = 'priority_offer' | 'priority_audience' | 'business_direction' | 'channel_and_cta' | 'voice_preferences'

/** Decision states come from the findings map, never from the model. */
function decisionFor(ustalenia: UstaleniaData, key: DecidedKey): { decision_state: 'awaiting_client' | 'client_selected'; decision_ref: string | null } {
  const row = ustalenia.field_map.find((r) => r.field_key === key)
  if (row?.decision_state === 'client_selected') return { decision_state: 'client_selected', decision_ref: `WEW-USTALENIA.field_map.${key}` }
  return { decision_state: 'awaiting_client', decision_ref: null }
}

const T = {
  pl: {
    prohibited: 'Nie obiecywać efektów, wyników procentowych, terminów ani wyłączności bez faktu w rejestrze.',
    assumptionOwner: 'klient',
    assumptionUse: 'Propozycja do przeglądu; nie traktować jako decyzji klienta.',
    assumptionDeadline: 'Przed zamrożeniem briefu (Q-FREEZE).',
    awaiting: (field: string) => `Pole „${field}” czeka na decyzję klienta; wartość w briefie jest propozycją opartą na researchu.`,
    hypothesis: (field: string, value: string) => `Pole „${field}”: hipoteza z researchu — ${value}`,
  },
  en: {
    prohibited: 'Do not promise effects, percentage results, timelines or exclusivity without a fact in the register.',
    assumptionOwner: 'client',
    assumptionUse: 'A proposal for review; never a client decision.',
    assumptionDeadline: 'Before the brief is frozen (Q-FREEZE).',
    awaiting: (field: string) => `Field "${field}" awaits the client's decision; the value in the brief is a research-based proposal.`,
    hypothesis: (field: string, value: string) => `Field "${field}": research hypothesis — ${value}`,
  },
} as const

/** Pure assembly of the three gated sections into KLI-BRIEF data; the rules that belong to code live here. */
export function assembleBrief(args: {
  outputLanguage: 'pl' | 'en'
  sections: BriefWriterSections
  ustalenia: UstaleniaData
  zrodla: ZrodlaData
  known: Set<string>
}): { data: BriefData; issues: DocumentIssue[] } {
  const { sections, ustalenia, zrodla, outputLanguage } = args
  const t = T[outputLanguage]
  const issues: DocumentIssue[] = []
  const s = sections as Required<BriefWriterSections>
  const proofById = new Map(zrodla.proof_cards.map((p) => [p.proof_id, p]))
  const sourceById = new Map(zrodla.sources.map((src) => [src.source_id, src]))

  const offer = decisionFor(ustalenia, 'priority_offer')
  const audience = decisionFor(ustalenia, 'priority_audience')
  const direction = decisionFor(ustalenia, 'business_direction')
  const channel = decisionFor(ustalenia, 'channel_and_cta')
  const voice = decisionFor(ustalenia, 'voice_preferences')

  const allowedProofIds = s.promise_constraints.allowed_proof_ids.filter((id) => proofById.has(id))
  if (allowedProofIds.length < s.promise_constraints.allowed_proof_ids.length) {
    issues.push({ code: 'UNKNOWN_ID', severity: 'repaired', detail: 'allowed_proof_ids narrowed to stored proof cards', path: 'promise_constraints.allowed_proof_ids' })
  }
  const prohibited = s.promise_constraints.prohibited_claims.length ? s.promise_constraints.prohibited_claims : [t.prohibited]
  if (!s.promise_constraints.prohibited_claims.length) issues.push({ code: 'PROHIBITED_CLAIMS_DEFAULTED', severity: 'repaired', detail: 'the writer returned no prohibited claims; the register-wide default was added', path: 'promise_constraints.prohibited_claims' })

  let numericalTarget = s.success_and_limits.numerical_target
  if (numericalTarget && !s.success_and_limits.baseline) {
    numericalTarget = null
    issues.push({ code: 'TARGET_WITHOUT_BASELINE', severity: 'repaired', detail: 'a numeric target without a baseline fact was removed', path: 'success_and_limits.numerical_target' })
  }

  const examples = s.voice_preferences.proposed_examples.slice(0, 2).map((example, index) => ({
    ...example,
    variant_id: example.variant_id || `VOICE-${index === 0 ? 'A' : 'B'}`,
    provenance: 'creative_proposal' as const,
  }))
  if (s.voice_preferences.proposed_examples.length !== 2) {
    issues.push({ code: 'VOICE_EXAMPLES_COUNT', severity: 'limitation', detail: `${s.voice_preferences.proposed_examples.length} voice examples returned; two equal variants are expected`, path: 'voice_preferences.proposed_examples' })
  }

  const owner = s.channel_and_cta.owner?.trim() ? s.channel_and_cta.owner : null
  const draftReadiness = s.channel_and_cta.cta_goal && s.channel_and_cta.channel ? (owner ? 'ready' : 'conditional') : 'blocked'
  if (!owner) issues.push({ code: 'CTA_OWNER_MISSING', severity: 'blocking_publication', detail: 'no owner for the contact path behind the CTA; publication stays blocked until the client names one', path: 'channel_and_cta.owner' })

  const data: BriefData = {
    priority_offer: {
      value: s.priority_offer.value,
      decision_state: offer.decision_state,
      decision_ref: offer.decision_ref,
      fact_ids: s.priority_offer.fact_ids,
      result_for_audience: s.priority_offer.result_for_audience,
      excluded_from_scope: s.priority_offer.excluded_from_scope,
    },
    priority_audience: {
      value: s.priority_audience.value,
      decision_state: audience.decision_state,
      decision_ref: audience.decision_ref,
      fact_ids: s.priority_audience.fact_ids,
      priority_choice: {
        segment: s.priority_audience.segment,
        target_role: s.priority_audience.target_role,
        decision_ref: audience.decision_ref,
        decision_version: null,
        decision_state: audience.decision_state,
      },
      buyer_claims: s.priority_audience.buyer_claims.map((claim) => ({
        ...claim,
        // A claim about the buyer is knowledge, not a decision: evidence only when a buyer said it.
        knowledge_status: claim.evidence_ids.length === 0 && claim.knowledge_status === 'evidence' ? 'hypothesis' : claim.knowledge_status,
        provenance: claim.knowledge_status === 'client_declaration' ? 'client_answer' : claim.evidence_ids.length ? 'observed' : 'inferred',
      })),
      secondary_groups: s.priority_audience.secondary_groups,
    },
    business_direction: {
      value: s.business_direction.value,
      decision_state: direction.decision_state,
      decision_ref: direction.decision_ref,
      fact_ids: s.business_direction.fact_ids,
      from_to: s.business_direction.from_to,
      horizon: s.business_direction.horizon,
      baseline: s.business_direction.baseline,
      communication_role: s.business_direction.communication_role,
      not_promised: s.business_direction.not_promised,
    },
    buyer_reality: s.buyer_reality,
    promise_constraints: {
      capabilities: s.promise_constraints.capabilities,
      result_limits: s.promise_constraints.result_limits,
      prohibited_claims: prohibited,
      allowed_proof_ids: allowedProofIds,
      // Rights travel with the card, never with the brief: copied, not decided.
      rights_by_proof: allowedProofIds.map((id) => {
        const card = proofById.get(id)!
        return {
          proof_id: id,
          source_visibility: card.source_visibility,
          allowed_use: card.allowed_use,
          use_basis_ref: card.use_basis_ref,
          client_name_permission: card.client_name_permission,
          quote_permission: card.quote_permission,
        }
      }),
      fact_ids: s.promise_constraints.fact_ids,
    },
    voice_preferences: {
      desired_traits: s.voice_preferences.desired_traits,
      unwanted_traits: s.voice_preferences.unwanted_traits,
      style_preferences: s.voice_preferences.style_preferences,
      proposed_examples: examples,
      client_selection: null,
      decision_version: null,
      decision_state: voice.decision_state,
      sample_ids: s.voice_preferences.sample_ids,
    },
    channel_and_cta: {
      channel: s.channel_and_cta.channel,
      audience_context: s.channel_and_cta.audience_context,
      cta_goal: s.channel_and_cta.cta_goal,
      cta_text: s.channel_and_cta.cta_text,
      destination: s.channel_and_cta.destination,
      destination_visibility: s.channel_and_cta.destination_visibility,
      destination_functionality: s.channel_and_cta.destination_functionality,
      owner,
      required_owner_before_publish: true,
      draft_readiness: draftReadiness,
      publication_readiness: owner ? 'conditional' : 'blocked',
      limits: s.channel_and_cta.limits,
      fact_ids: s.channel_and_cta.fact_ids,
      decision_state: channel.decision_state,
    },
    success_and_limits: {
      directional_goal: s.success_and_limits.directional_goal,
      measurement_proposals: s.success_and_limits.measurement_proposals,
      baseline: s.success_and_limits.baseline,
      numerical_target: numericalTarget,
      scope_limit: s.success_and_limits.scope_limit,
    },
    assets_and_permissions: s.assets_and_permissions.map((asset, index) => {
      const proof = proofById.get(asset.source_ref)
      const source = sourceById.get(asset.source_ref)
      return {
        asset_id: `ASSET-${String(index + 1).padStart(2, '0')}`,
        source_ref: asset.source_ref,
        source_visibility: proof?.source_visibility ?? source?.source_visibility ?? 'unknown',
        allowed_use: proof?.allowed_use ?? 'internal_only',
        use_basis_ref: proof?.use_basis_ref ?? null,
        client_name_permission: proof?.client_name_permission ?? 'unknown',
        quote_permission: proof?.quote_permission ?? 'unknown',
        supported_claim_ids: asset.supported_claim_ids,
      }
    }),
    open_assumptions: [],
  }

  // Open assumptions are arithmetic: every MUST field still awaiting the client plus every hypothesis the map carries.
  const assumptions: BriefData['open_assumptions'] = []
  const awaiting: { key: string; text: string }[] = [
    { key: 'priority_offer', text: data.priority_offer.value },
    { key: 'priority_audience', text: data.priority_audience.value },
    { key: 'business_direction', text: data.business_direction.value },
    { key: 'voice_preferences', text: data.voice_preferences.desired_traits.join(', ') || '—' },
    { key: 'channel_and_cta', text: data.channel_and_cta.cta_goal },
  ]
  const states: Record<string, string> = {
    priority_offer: data.priority_offer.decision_state,
    priority_audience: data.priority_audience.decision_state,
    business_direction: data.business_direction.decision_state,
    voice_preferences: data.voice_preferences.decision_state,
    channel_and_cta: data.channel_and_cta.decision_state,
  }
  for (const field of awaiting) {
    if (states[field.key] !== 'awaiting_client') continue
    assumptions.push({
      assumption_id: `A-${String(assumptions.length + 1).padStart(2, '0')}`,
      text: `${t.awaiting(field.key)} ${field.text}`.trim(),
      type: 'awaiting_client_decision',
      impact: field.key,
      decision_owner: t.assumptionOwner,
      allowed_use: t.assumptionUse,
      logical_deadline: t.assumptionDeadline,
      state: 'open',
    })
  }
  for (const row of ustalenia.field_map) {
    if (row.status !== 'hypothesis' || !row.proposed_value) continue
    if (assumptions.some((a) => a.impact === row.field_key)) continue
    assumptions.push({
      assumption_id: `A-${String(assumptions.length + 1).padStart(2, '0')}`,
      text: t.hypothesis(row.field_key, row.proposed_value),
      type: 'hypothesis',
      impact: row.field_key,
      decision_owner: t.assumptionOwner,
      allowed_use: t.assumptionUse,
      logical_deadline: t.assumptionDeadline,
      state: 'open',
    })
  }
  data.open_assumptions = assumptions
  return { data: briefDataSchema.parse(data), issues }
}

function writerInput(opts: BriefPipelineOptions, section: SectionName): BriefWriterInput {
  const { order, ustalenia, zrodla, audyt } = opts
  const voiceSummary = [
    audyt.voice_audit.sample_size,
    `formality: ${audyt.voice_audit.formality.finding}`,
    `directness: ${audyt.voice_audit.directness.finding}`,
    `technical level: ${audyt.voice_audit.technical_level.finding}`,
    `emotion: ${audyt.voice_audit.emotion.finding}`,
    `claim certainty: ${audyt.voice_audit.claim_certainty.finding}`,
    `future voice: ${audyt.voice_audit.future_voice_status}`,
  ].join(' · ')
  return {
    order: { brand: order.brand, market: order.market, language: order.language, websiteUrl: order.websiteUrl, purchaseGoal: order.purchaseGoal, sku: order.sku },
    outputLanguage: opts.outputLanguage,
    section,
    field_map: ustalenia.field_map.map((r) => ({ field_key: r.field_key, proposed_value: r.proposed_value, evidence_ids: r.evidence_ids, provenance: r.provenance, readiness: r.readiness, decision_state: r.decision_state, priority: r.priority, status: r.status, reason: r.reason })),
    questions: ustalenia.questions.map((q) => ({ question_id: q.question_id, question: q.question, brief_field: q.brief_field, priority: q.priority, state: q.state })),
    facts: zrodla.facts.map((f) => ({ fact_id: f.fact_id, entity: f.entity, claim: f.claim, kind: f.kind, limitation: f.limitation })),
    proof_cards: zrodla.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method, observed_result: p.observed_result, limitations: p.limitations })),
    language_samples: zrodla.language_samples.map((l) => ({ sample_id: l.sample_id, channel: l.channel, excerpt: l.excerpt_or_paraphrase, linguistic_features: l.linguistic_features })),
    offer_map: audyt.offer_map.map((o) => ({ service: o.service, described_audience: o.described_audience, problem: o.problem, mechanism: o.mechanism, limits: o.limits, fact_ids: o.fact_ids })),
    buyer_map: audyt.buyer_map.map((b) => ({ scenario_id: b.scenario_id, status: b.status, initiator: b.initiator, job: b.job, objections: b.objections, fact_ids: b.fact_ids })),
    voice_audit_summary: voiceSummary,
    journey: audyt.journey.map((j) => ({ stage: j.stage, material: j.material, cta: j.cta, destination_status: j.destination_status, fact_ids: j.fact_ids })),
    sources: zrodla.sources.filter((src) => src.access !== 'unavailable').map((src) => ({ source_id: src.source_id, url: src.url_or_file, kind: src.kind, source_visibility: src.source_visibility })),
    repair_findings: opts.repairFindings ?? [],
  }
}

export async function runBriefPipeline(opts: BriefPipelineOptions): Promise<BriefPipelineResult> {
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
  const known = knownBriefIds(opts.zrodla, opts.ustalenia)
  const issues: DocumentIssue[] = []
  const sections: BriefWriterSections = {}
  for (const section of Object.keys(SECTION_KEYS) as SectionName[]) {
    const { value, issues: sectionIssues } = await step<BriefWriterSections>({
      step: '4.1',
      agentId: RESEARCH_BRIEF_WRITER_AGENT_ID,
      label: section,
      input: writerInput(opts, section),
      parse: (raw) => briefWriterResult.parse(raw).data,
      gate: (data) => gateSection(section, data, known),
    })
    issues.push(...sectionIssues)
    Object.assign(sections, value)
  }
  const assembled = assembleBrief({ outputLanguage: opts.outputLanguage, sections, ustalenia: opts.ustalenia, zrodla: opts.zrodla, known })
  issues.push(...assembled.issues)
  const view = renderBriefClientView({ outputLanguage: opts.outputLanguage, brand: opts.order.brand, data: assembled.data, ustalenia: opts.ustalenia })
  if (view.issue) issues.push(view.issue)
  return { data: assembled.data, issues, clientViewMd: view.markdown, stats }
}

/** The brief's inputs per the WZR-BRIEF handoff: the findings map, the register, the audit, and the previous brief on a revision. */
export async function runBriefStep(ctx: StepContext): Promise<StepOutcome> {
  const ustalenia = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-USTALENIA')
  const zrodla = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
  const audyt = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-AUDYT')
  if (!ustalenia || !zrodla || !audyt) throw new Error('[internal] 4.1 needs current WEW-USTALENIA, WEW-ZRODLA and WEW-AUDYT versions — run the process through 3.8 first')
  const previous = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-BRIEF')
  const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })
  const inputVersions: InputVersion[] = [ctx.orderVersion, pin(ustalenia), pin(zrodla), pin(audyt), ...(previous ? [pin(previous)] : [])]
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '4.1', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const result = await runBriefPipeline({
      order: ctx.order,
      outputLanguage: ctx.order.outputLanguage,
      ustalenia: ustaleniaDataSchema.parse(ustalenia.data),
      zrodla: zrodlaDataSchema.parse(zrodla.data),
      audyt: audytDataSchema.parse(audyt.data),
      previousBrief: previous ? briefDataSchema.parse(previous.data) : null,
      repairFindings: ctx.repairFindings,
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      onEvent: ctx.onEvent,
    })
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-BRIEF',
      status: 'draft',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues: result.issues,
      renderedMd: renderBrief({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: result.data, issues: result.issues }),
      clientViewMd: result.clientViewMd,
      taskRunId: run.id,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { stats: result.stats }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
