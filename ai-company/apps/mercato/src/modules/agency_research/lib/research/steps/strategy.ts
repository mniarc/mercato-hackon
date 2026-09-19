import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { QaFinding } from '../../../data/schemas/qa'
import { audytDataSchema, type AudytData } from '../../../data/schemas/audyt'
import { briefDataSchema, type BriefData } from '../../../data/schemas/brief'
import { konkurencjaDataSchema, type KonkurencjaData } from '../../../data/schemas/konkurencja'
import { strategiaDataSchema, supportLevels, type StrategiaData } from '../../../data/schemas/strategia'
import { ustaleniaDataSchema, type UstaleniaData } from '../../../data/schemas/ustalenia'
import { zrodlaDataSchema, type ProofCard, type ZrodlaData } from '../../../data/schemas/zrodla'
import {
  strategyWriterResult,
  type StrategyBriefInput,
  type StrategySection,
  type StrategyWriterInput,
  type StrategyWriterSections,
} from '../../../data/agents/strategy'
import { idPrefixes, limits } from '../../../data/templates'
import { RESEARCH_STRATEGY_WRITER_AGENT_ID } from '../../agents/ids.strategy'
import { finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { readStrategyFoundation, readStrategyPairVersion, recordStrategyPairVersion } from './strategyInputs'
import { GateError, type GateIssue } from '../gate'
import { mintId, resolveId } from '../ids'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { renderStrategia, renderStrategiaClientView } from '../render/strategia'
import { simulationIssue } from '../simulation'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 5.2 — KLI-STRATEGIA. The writer is asked three times, once per section
 * group, and the document is assembled here: claim ids (`CL01…`) and pillar ids
 * (`PL01…`) are minted in code and every local reference rewritten; support
 * levels are capped by what the cited proof cards allow ("no auto promotion");
 * uniqueness without a demonstrated proof is a blocking issue; a numeric target
 * without a baseline is dropped. Everything cited must resolve in the inputs.
 */

export type StrategyPipelineOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  brief: BriefData
  zrodla: ZrodlaData
  audyt: AudytData
  konkurencja: KonkurencjaData | null
  ustalenia?: UstaleniaData | null
  previousStrategy?: StrategiaData | null
  repairFindings?: QaFinding[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
  groundingRetries?: number
}

export type StrategyPipelineResult = {
  data: StrategiaData
  issues: DocumentIssue[]
  clientViewMd: string
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}

const SECTION_KEYS = {
  choice_tension_uvp: ['strategic_choice', 'buyer_tension', 'uvp', 'options_considered'],
  proof_messages: ['proof_architecture', 'message_hierarchy'],
  pillars_channel_boundaries: ['pillars', 'channel_role', 'measurement_hypothesis', 'creative_boundaries'],
} as const

const UVP_LOCAL_REF = 'UVP'

const issue = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

const supportRank: Record<(typeof supportLevels)[number], number> = { declared_method: 0, documented_capability: 1, demonstrated_result: 2 }

/** The support level one proof card can carry: a declaration is a method, an artifact a capability, a measured or confirmed case a result. */
export function supportLevelOfProof(proof: Pick<ProofCard, 'proof_type'>): (typeof supportLevels)[number] {
  switch (proof.proof_type) {
    case 'measured_case':
    case 'external_confirmation':
      return 'demonstrated_result'
    case 'observed_artifact':
      return 'documented_capability'
    default:
      return 'declared_method'
  }
}

/** The highest support level the cited proofs allow; no proofs → a declared method at most. */
export function maxSupportLevel(proofIds: string[], proofById: Map<string, ProofCard>): (typeof supportLevels)[number] {
  let best: (typeof supportLevels)[number] = 'declared_method'
  for (const id of proofIds) {
    const proof = proofById.get(id)
    if (!proof) continue
    const level = supportLevelOfProof(proof)
    if (supportRank[level] > supportRank[best]) best = level
  }
  return best
}

const UNIQUENESS = /\b(jedyn\w*|unikaln\w*|unikatow\w*|only\b|unique\w*|niepowtarzaln\w*)/i
const EVERYONE_ELSE = /^(wszys\w*|everyone|everybody|all\s+others?|inni|others?|konkurencj\w*|the\s+competition|rynek|the\s+market)\b/i

/** "Everyone else" in three words or fewer is not an alternative; a named route or supplier type is. */
export function isVagueAlternative(alternative: string): boolean {
  const text = alternative.trim()
  return EVERYONE_ELSE.test(text) && text.split(/\s+/).length <= 3
}

/** Every id a strategy may cite: facts, proofs, samples, signals, seeds, sources, competitor candidates, gaps, assumptions, questions. */
export function knownStrategyIds(zrodla: ZrodlaData, brief: BriefData, audyt: AudytData, konkurencja: KonkurencjaData | null, ustalenia?: UstaleniaData | null): Set<string> {
  return new Set([
    ...zrodla.facts.map((f) => f.fact_id),
    ...zrodla.proof_cards.map((p) => p.proof_id),
    ...zrodla.language_samples.map((s) => s.sample_id),
    ...zrodla.audience_signals.map((s) => s.signal_id),
    ...zrodla.content_bank.map((s) => s.seed_id),
    ...zrodla.sources.map((s) => s.source_id),
    ...zrodla.conflicts.map((c) => c.conflict_id),
    ...audyt.gaps.map((g) => g.gap_id),
    ...audyt.buyer_map.map((b) => b.scenario_id),
    ...(konkurencja?.difference_candidates.map((d) => d.candidate_id) ?? []),
    ...brief.open_assumptions.map((a) => a.assumption_id),
    ...brief.assets_and_permissions.map((a) => a.asset_id),
    ...(ustalenia?.questions.map((q) => q.question_id) ?? []),
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

/** The section keys the requested call must return; `*_ids` are resolved, `*_refs` (local claim refs) are kept for the assembly. */
export function gateStrategySection(section: StrategySection, sections: StrategyWriterSections, known: Set<string>): { value: StrategyWriterSections; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const missing = SECTION_KEYS[section].filter((key) => sections[key] === undefined)
  if (missing.length) throw new GateError(`strategy_writer ${section}`, [issue('MISSING_SECTION', section, `section keys missing: ${missing.join(', ')}`, 'dropped')])
  const value: StrategyWriterSections = {}
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
  const gated = walk(value, section) as StrategyWriterSections
  if (section === 'choice_tension_uvp' && gated.uvp && isVagueAlternative(gated.uvp.alternative)) {
    throw new GateError('strategy_writer choice_tension_uvp', [issue('ALTERNATIVE_NOT_CONCRETE', 'uvp.alternative', `"${gated.uvp.alternative}" is not a concrete alternative; name the specific route or supplier type the buyer would otherwise take`, 'dropped')])
  }
  if (section === 'pillars_channel_boundaries' && gated.pillars) {
    const [min] = limits.content.pillars
    if (gated.pillars.length < min) throw new GateError('strategy_writer pillars_channel_boundaries', [issue('PILLARS_COUNT', 'pillars', `${gated.pillars.length} pillars returned; ${limits.content.pillars.join('–')} expected`, 'dropped')])
  }
  return { value: gated, issues, kept: SECTION_KEYS[section].length, dropped: issues.length }
}

const T = {
  pl: {
    forbiddenUvp: 'Nie twierdzić, że mechanizm jest wyłączny ani że gwarantuje wynik.',
    uvpOwner: 'agency',
  },
  en: {
    forbiddenUvp: 'Do not claim the mechanism is exclusive or that it guarantees a result.',
    uvpOwner: 'agency',
  },
} as const

/** Pure assembly of the three gated sections into KLI-STRATEGIA data; the rules that belong to code live here. */
export function assembleStrategy(args: { outputLanguage: 'pl' | 'en'; sections: StrategyWriterSections; zrodla: ZrodlaData; brief: BriefData }): { data: StrategiaData; issues: DocumentIssue[] } {
  const { sections, zrodla, brief, outputLanguage } = args
  const t = T[outputLanguage]
  const issues: DocumentIssue[] = []
  const s = sections as Required<StrategyWriterSections>
  const proofById = new Map(zrodla.proof_cards.map((p) => [p.proof_id, p]))
  const proofIdsOf = (ids: string[]) => ids.filter((id) => proofById.has(id))

  // Claim ids: the UVP is CL01, then the proof rows in output order; every local ref is rewritten.
  const claimIdByRef = new Map<string, string>()
  claimIdByRef.set(UVP_LOCAL_REF, mintId(idPrefixes.claim, 0))
  claimIdByRef.set(s.uvp.local_ref, claimIdByRef.get(UVP_LOCAL_REF)!)
  const proofRows = s.proof_architecture.filter((row) => row.local_ref !== UVP_LOCAL_REF && row.local_ref !== s.uvp.local_ref)
  const uvpRowDraft = s.proof_architecture.find((row) => row.local_ref === UVP_LOCAL_REF || row.local_ref === s.uvp.local_ref)
  proofRows.forEach((row, index) => claimIdByRef.set(row.local_ref, mintId(idPrefixes.claim, index + 1)))
  const claimIds = (refs: string[], path: string): string[] => {
    const out: string[] = []
    for (const ref of refs) {
      const id = claimIdByRef.get(ref) ?? [...claimIdByRef.entries()].find(([k]) => k.toUpperCase() === ref.toUpperCase())?.[1]
      if (id) out.push(id)
      else issues.push({ code: 'UNKNOWN_CLAIM_REF', severity: 'repaired', detail: `${ref} is not a claim of this strategy; dropped`, path })
    }
    return [...new Set(out)]
  }

  // Support levels: what the cited proofs allow, never what the writer asserted.
  const capLevel = (asserted: (typeof supportLevels)[number], proofIds: string[], path: string): (typeof supportLevels)[number] => {
    const allowed = maxSupportLevel(proofIds, proofById)
    if (supportRank[asserted] > supportRank[allowed]) {
      issues.push({ code: 'NO_AUTO_PROMOTION', severity: 'repaired', detail: `${asserted} downgraded to ${allowed}: the cited proofs (${proofIds.join(', ') || 'none'}) support no more`, path })
      return allowed
    }
    return asserted
  }

  const uvpProofIds = proofIdsOf(s.uvp.evidence_ids)
  const uvpLevel = capLevel(s.uvp.support_level, uvpProofIds, 'uvp.support_level')
  const uvpClaimId = claimIdByRef.get(UVP_LOCAL_REF)!
  const uvp: StrategiaData['uvp'] = {
    claim_id: uvpClaimId,
    working_sentence: s.uvp.working_sentence,
    explanation: s.uvp.explanation,
    mechanism: s.uvp.mechanism,
    alternative: s.uvp.alternative,
    reason_to_believe: s.uvp.reason_to_believe,
    evidence_ids: s.uvp.evidence_ids,
    support_level: uvpLevel,
    use_conditions: s.uvp.use_conditions,
    alternative_status: s.uvp.alternative_status,
  }
  // "Unique" needs a demonstrated proof; without one the wording is a blocking issue for Q-S, never a silent rewrite.
  const uniquenessText = [uvp.working_sentence, uvp.reason_to_believe, s.strategic_choice.rationale].join(' ')
  if (UNIQUENESS.test(uniquenessText) && uvpLevel !== 'demonstrated_result') {
    issues.push({ code: 'UNIQUENESS_UNSUPPORTED', severity: 'blocking', detail: 'uniqueness is claimed without a demonstrated, externally confirmed proof; absence of a claim at a competitor is not exclusivity', path: 'uvp' })
  }

  const proof_architecture: StrategiaData['proof_architecture'] = []
  if (uvpRowDraft) {
    proof_architecture.push({
      claim_id: uvpClaimId,
      allowed_claim: uvpRowDraft.allowed_claim,
      mechanism: uvpRowDraft.mechanism,
      proof_ids: uvpRowDraft.proof_ids,
      fact_ids: uvpRowDraft.fact_ids,
      source_ids: uvpRowDraft.source_ids,
      status: capLevel(uvpRowDraft.status, uvpRowDraft.proof_ids, `proof_architecture[${uvpClaimId}].status`),
      limitations: uvpRowDraft.limitations,
      forbidden_claim: uvpRowDraft.forbidden_claim,
      confirmation_owner: uvpRowDraft.confirmation_owner,
    })
  } else {
    issues.push({ code: 'UVP_PROOF_ROW_ADDED', severity: 'repaired', detail: 'the writer returned no proof row for the UVP; one was derived from the UVP fields', path: 'proof_architecture' })
    proof_architecture.push({
      claim_id: uvpClaimId,
      allowed_claim: uvp.working_sentence,
      mechanism: uvp.mechanism,
      proof_ids: uvpProofIds,
      fact_ids: uvp.evidence_ids.filter((id) => !proofById.has(id)),
      source_ids: [],
      status: uvpLevel,
      limitations: uvp.use_conditions,
      forbidden_claim: t.forbiddenUvp,
      confirmation_owner: t.uvpOwner,
    })
  }
  for (const row of proofRows) {
    const claimId = claimIdByRef.get(row.local_ref)!
    proof_architecture.push({
      claim_id: claimId,
      allowed_claim: row.allowed_claim,
      mechanism: row.mechanism,
      proof_ids: row.proof_ids,
      fact_ids: row.fact_ids,
      source_ids: row.source_ids,
      status: capLevel(row.status, row.proof_ids, `proof_architecture[${claimId}].status`),
      limitations: row.limitations,
      forbidden_claim: row.forbidden_claim,
      confirmation_owner: row.confirmation_owner,
    })
  }
  const levelOfClaim = new Map(proof_architecture.map((row) => [row.claim_id, row.status]))

  const mainClaimIds = claimIds(s.message_hierarchy.main_promise.claim_refs, 'message_hierarchy.main_promise.claim_ids')
  const mainAllowed = mainClaimIds.reduce<(typeof supportLevels)[number]>((best, id) => {
    const level = levelOfClaim.get(id) ?? 'declared_method'
    return supportRank[level] > supportRank[best] ? level : best
  }, 'declared_method')
  let mainStatus = s.message_hierarchy.main_promise.status
  if (supportRank[mainStatus] > supportRank[mainAllowed]) {
    issues.push({ code: 'NO_AUTO_PROMOTION', severity: 'repaired', detail: `main promise ${mainStatus} downgraded to ${mainAllowed}: its claims support no more`, path: 'message_hierarchy.main_promise.status' })
    mainStatus = mainAllowed
  }
  const message_hierarchy: StrategiaData['message_hierarchy'] = {
    main_promise: { text: s.message_hierarchy.main_promise.text, status: mainStatus, claim_ids: mainClaimIds },
    supporting_messages: s.message_hierarchy.supporting_messages.map((m, index) => ({
      order: m.order,
      text: m.text,
      claim_ids: claimIds(m.claim_refs, `message_hierarchy.supporting_messages[${index}].claim_ids`),
      fact_ids: m.fact_ids,
    })),
    explanation_order: s.message_hierarchy.explanation_order,
  }

  const [minPillars, maxPillars] = limits.content.pillars
  const pillarDrafts = s.pillars.slice(0, maxPillars)
  if (s.pillars.length > maxPillars) issues.push({ code: 'PILLARS_TRIMMED', severity: 'repaired', detail: `${s.pillars.length} pillars returned; the first ${maxPillars} kept`, path: 'pillars' })
  if (pillarDrafts.length < minPillars) issues.push({ code: 'PILLARS_COUNT', severity: 'blocking', detail: `${pillarDrafts.length} pillars; ${minPillars}–${maxPillars} expected`, path: 'pillars' })
  const pillars: StrategiaData['pillars'] = pillarDrafts.map((p, index) => ({
    pillar_id: mintId(idPrefixes.pillar, index),
    area: p.area,
    strategic_goal: p.strategic_goal,
    audience_question: p.audience_question,
    allowed_content: p.allowed_content,
    exclusions: p.exclusions,
    claim_ids: claimIds(p.claim_refs, `pillars[${index}].claim_ids`),
    seed_ids: p.seed_ids,
  }))
  for (const [index, pillar] of pillars.entries()) {
    if (!pillar.seed_ids.length && !pillar.claim_ids.length) issues.push({ code: 'PILLAR_WITHOUT_MATERIAL', severity: 'blocking', detail: `${pillar.pillar_id} cites no seeds and no claims — nothing to develop it from`, path: `pillars[${index}]` })
  }

  // A buyer objection is a customer voice only when a customer said it; a buyer-map hypothesis stays illustrative.
  let objectionStatus = s.buyer_tension.objection_status
  const customerVoiceIds = new Set([
    ...zrodla.audience_signals.filter((a) => /customer|direct|klient/i.test(a.evidence_status) && !/not_customer|supplier/i.test(a.evidence_status)).map((a) => a.signal_id),
    ...zrodla.facts.filter((f) => f.kind === 'observed' && /klient|customer|opinia|review/i.test(f.claim)).map((f) => f.fact_id),
  ])
  if (objectionStatus === 'customer_voice' && !s.buyer_tension.evidence_ids.some((id) => customerVoiceIds.has(id))) {
    issues.push({ code: 'OBJECTION_NOT_CUSTOMER_VOICE', severity: 'repaired', detail: 'the objection cites no customer-voice evidence; recorded as an illustrative hypothesis', path: 'buyer_tension.objection_status' })
    objectionStatus = 'illustrative_hypothesis'
  }

  let numericalTarget = s.measurement_hypothesis.numerical_target
  if (numericalTarget && !s.measurement_hypothesis.baseline) {
    issues.push({ code: 'TARGET_WITHOUT_BASELINE', severity: 'repaired', detail: 'a numeric target without a baseline was removed', path: 'measurement_hypothesis.numerical_target' })
    numericalTarget = null
  }

  const prohibited = [...new Set([...s.creative_boundaries.prohibited_promises, ...brief.promise_constraints.prohibited_claims])]
  if (prohibited.length > s.creative_boundaries.prohibited_promises.length) {
    issues.push({ code: 'PROHIBITED_PROMISES_MERGED', severity: 'repaired', detail: "the brief's prohibited claims were added to the creative boundaries", path: 'creative_boundaries.prohibited_promises' })
  }

  const data: StrategiaData = {
    strategic_choice: s.strategic_choice,
    buyer_tension: { ...s.buyer_tension, objection_status: objectionStatus },
    uvp,
    options_considered: s.options_considered.slice(0, 2),
    proof_architecture,
    message_hierarchy,
    pillars,
    channel_role: s.channel_role,
    measurement_hypothesis: { ...s.measurement_hypothesis, numerical_target: numericalTarget },
    creative_boundaries: { ...s.creative_boundaries, prohibited_promises: prohibited },
  }
  return { data: strategiaDataSchema.parse(data), issues }
}

/** KLI-BRIEF compacted for the writer and the QA agent. */
export function briefInputOf(brief: BriefData): StrategyBriefInput {
  return {
    priority_offer: { value: brief.priority_offer.value, decision_state: brief.priority_offer.decision_state, result_for_audience: brief.priority_offer.result_for_audience, excluded_from_scope: brief.priority_offer.excluded_from_scope, fact_ids: brief.priority_offer.fact_ids },
    priority_audience: {
      value: brief.priority_audience.value,
      decision_state: brief.priority_audience.decision_state,
      segment: brief.priority_audience.priority_choice.segment,
      target_role: brief.priority_audience.priority_choice.target_role,
      buyer_claims: brief.priority_audience.buyer_claims.map((c) => ({ component: c.component, value: c.value, knowledge_status: c.knowledge_status, evidence_ids: c.evidence_ids })),
      fact_ids: brief.priority_audience.fact_ids,
    },
    business_direction: { value: brief.business_direction.value, decision_state: brief.business_direction.decision_state, from_to: brief.business_direction.from_to, communication_role: brief.business_direction.communication_role, not_promised: brief.business_direction.not_promised, fact_ids: brief.business_direction.fact_ids },
    buyer_reality: brief.buyer_reality.map((b) => ({ situation: b.situation, status: b.status, relevant_fact_ids: b.relevant_fact_ids })),
    promise_constraints: { capabilities: brief.promise_constraints.capabilities, result_limits: brief.promise_constraints.result_limits, prohibited_claims: brief.promise_constraints.prohibited_claims, allowed_proof_ids: brief.promise_constraints.allowed_proof_ids },
    voice_preferences: {
      desired_traits: brief.voice_preferences.desired_traits,
      unwanted_traits: brief.voice_preferences.unwanted_traits,
      style_preferences: brief.voice_preferences.style_preferences,
      proposed_examples: brief.voice_preferences.proposed_examples.map((e) => ({ variant_id: e.variant_id, label: e.label, text: e.text, fact_ids: e.fact_ids })),
      sample_ids: brief.voice_preferences.sample_ids,
    },
    channel_and_cta: {
      channel: brief.channel_and_cta.channel,
      audience_context: brief.channel_and_cta.audience_context,
      cta_goal: brief.channel_and_cta.cta_goal,
      destination: brief.channel_and_cta.destination,
      destination_visibility: brief.channel_and_cta.destination_visibility,
      owner: brief.channel_and_cta.owner,
      limits: brief.channel_and_cta.limits,
      fact_ids: brief.channel_and_cta.fact_ids,
    },
    success_and_limits: { directional_goal: brief.success_and_limits.directional_goal, baseline: brief.success_and_limits.baseline, numerical_target: brief.success_and_limits.numerical_target, scope_limit: brief.success_and_limits.scope_limit },
    open_assumptions: brief.open_assumptions.map((a) => ({ assumption_id: a.assumption_id, text: a.text, type: a.type, impact: a.impact })),
  }
}

export function evidenceInputOf(zrodla: ZrodlaData): StrategyWriterInput['evidence'] {
  return {
    facts: zrodla.facts.map((f) => ({ fact_id: f.fact_id, entity: f.entity, claim: f.claim, kind: f.kind, limitation: f.limitation })),
    proof_cards: zrodla.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method, observed_result: p.observed_result, fact_ids: p.fact_ids, limitations: p.limitations })),
    content_bank: zrodla.content_bank.map((s) => ({ seed_id: s.seed_id, audience_question: s.audience_question, angle: s.angle, fact_ids: s.fact_ids, proof_ids: s.proof_ids, readiness: s.readiness })),
  }
}

function writerInput(opts: StrategyPipelineOptions, section: StrategySection, draft: StrategyWriterSections): StrategyWriterInput {
  const { order, brief, zrodla, audyt, konkurencja } = opts
  return {
    order: { brand: order.brand, market: order.market, language: order.language, websiteUrl: order.websiteUrl, purchaseGoal: order.purchaseGoal, sku: order.sku },
    outputLanguage: opts.outputLanguage,
    section,
    brief: briefInputOf(brief),
    audit: {
      offer_map: audyt.offer_map.map((o) => ({ service: o.service, described_audience: o.described_audience, problem: o.problem, mechanism: o.mechanism, limits: o.limits, fact_ids: o.fact_ids })),
      buyer_map: audyt.buyer_map.map((b) => ({ scenario_id: b.scenario_id, status: b.status, initiator: b.initiator, job: b.job, objections: b.objections, direct_customer_voice: b.direct_customer_voice, fact_ids: b.fact_ids })),
      message_map: audyt.message_map.map((m) => ({ message: m.message, category: m.category, benefit: m.benefit, proof_ids: m.proof_ids, risk: m.risk, fact_ids: m.fact_ids })),
      gaps: audyt.gaps.map((g) => ({ gap_id: g.gap_id, observation: g.observation, priority: g.priority, destination: g.destination, evidence_ids: g.evidence_ids })),
      reusable_assets: audyt.reusable_assets.map((a) => ({ asset: a.asset, value_for_audience: a.value_for_audience, proof_ids: a.proof_ids, seed_ids: a.seed_ids })),
    },
    competitors: konkurencja
      ? {
          parity_claims: konkurencja.parity_claims.map((c) => ({ claim: c.claim, companies: c.companies, evidence_ids: c.evidence_ids, why_insufficient: c.why_insufficient })),
          difference_candidates: konkurencja.difference_candidates.map((d) => ({ candidate_id: d.candidate_id, feature: d.feature, audience_value: d.audience_value, proof_ids: d.proof_ids, comparison: d.comparison, unknown: d.unknown, allowed_claim_strength: d.allowed_claim_strength, fact_ids: d.fact_ids })),
          alternative_routes: konkurencja.alternative_routes.map((r) => ({ route: r.route, status: r.status, when_sensible: r.when_sensible, tradeoff: r.tradeoff, evidence_ids: r.evidence_ids })),
          implications: konkurencja.implications.map((i) => ({ finding: i.finding, limitation: i.limitation, strategy_field: i.strategy_field, client_answer_needed: i.client_answer_needed, evidence_ids: i.evidence_ids })),
        }
      : null,
    evidence: evidenceInputOf(zrodla),
    draft: draft as Record<string, unknown>,
    previous_strategy: (opts.previousStrategy as unknown as Record<string, unknown> | undefined) ?? null,
    repair_findings: opts.repairFindings ?? [],
  }
}

export async function runStrategyPipeline(opts: StrategyPipelineOptions): Promise<StrategyPipelineResult> {
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
  const known = knownStrategyIds(opts.zrodla, opts.brief, opts.audyt, opts.konkurencja, opts.ustalenia)
  const issues: DocumentIssue[] = []
  const sections: StrategyWriterSections = {}
  for (const section of Object.keys(SECTION_KEYS) as StrategySection[]) {
    const { value, issues: sectionIssues } = await step<StrategyWriterSections>({
      step: '5.2',
      agentId: RESEARCH_STRATEGY_WRITER_AGENT_ID,
      label: section,
      input: writerInput(opts, section, sections),
      parse: (raw) => strategyWriterResult.parse(raw).data,
      gate: (data) => gateStrategySection(section, data, known),
    })
    issues.push(...sectionIssues)
    Object.assign(sections, value)
  }
  const assembled = assembleStrategy({ outputLanguage: opts.outputLanguage, sections, zrodla: opts.zrodla, brief: opts.brief })
  issues.push(...assembled.issues)
  const view = renderStrategiaClientView({ outputLanguage: opts.outputLanguage, brand: opts.order.brand, data: assembled.data })
  if (view.issue) issues.push(view.issue)
  return { data: assembled.data, issues, clientViewMd: view.markdown, stats }
}

const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })

/** The strategy's inputs per the WZR-STRATEGIA handoff: the brief, the register, the audit, the comparison, and the previous strategy on a revision. */
export async function runStrategyStep(ctx: StepContext): Promise<StepOutcome> {
  const brief = await readStrategyFoundation(ctx, 'brief')
  const zrodla = await readStrategyFoundation(ctx, 'zrodla')
  const audyt = await readStrategyFoundation(ctx, 'audyt')
  if (!brief || !zrodla || !audyt) throw new Error('[internal] 5.2 needs current KLI-BRIEF, WEW-ZRODLA and WEW-AUDYT versions — run the process through 4.2 first')
  const konkurencja = await readStrategyFoundation(ctx, 'konkurencja')
  const ustalenia = await readStrategyFoundation(ctx, 'ustalenia')
  const previous = await readStrategyPairVersion(ctx, 'strategy')
  const inputVersions: InputVersion[] = [ctx.orderVersion, pin(brief), pin(zrodla), pin(audyt), ...(konkurencja ? [pin(konkurencja)] : []), ...(ustalenia ? [pin(ustalenia)] : []), ...(previous ? [pin(previous)] : [])]
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '5.2', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const result = await runStrategyPipeline({
      order: ctx.order,
      outputLanguage: ctx.order.outputLanguage,
      brief: briefDataSchema.parse(brief.data),
      zrodla: zrodlaDataSchema.parse(zrodla.data),
      audyt: audytDataSchema.parse(audyt.data),
      konkurencja: konkurencja ? konkurencjaDataSchema.parse(konkurencja.data) : null,
      ustalenia: ustalenia ? ustaleniaDataSchema.parse(ustalenia.data) : null,
      previousStrategy: previous ? strategiaDataSchema.parse(previous.data) : null,
      repairFindings: ctx.repairFindings,
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      onEvent: ctx.onEvent,
    })
    const simulation = simulationIssue(inputVersions)
    const issues = simulation ? [...result.issues, simulation] : result.issues
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-STRATEGIA',
      status: 'draft',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderStrategia({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: result.data, issues }),
      clientViewMd: result.clientViewMd,
      taskRunId: run.id,
      simulation: simulation !== null,
    })
    ctx.documentVersionIds.push(saved.version.id)
    if (ctx.strategyInputs) recordStrategyPairVersion(ctx, 'strategy', { document_id: saved.envelope.document_id, version: saved.envelope.version, status: saved.envelope.status, versionId: saved.version.id, data: saved.version.data })
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { stats: result.stats }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
