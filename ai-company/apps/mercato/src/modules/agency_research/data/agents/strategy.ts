import { z } from 'zod'
import { qaFindingSchema } from '../schemas/qa'
import {
  buyerTensionSchema,
  channelRoleSchema,
  creativeBoundariesSchema,
  measurementHypothesisSchema,
  optionConsideredSchema,
  strategicChoiceSchema,
  supportLevels,
} from '../schemas/strategia'
import { contextRuleSchema, evidenceLanguageSchema, styleAxisSchema, voicePrincipleSchema, wordingSchema } from '../schemas/tov'

/**
 * Agent input/result schemas of the strategy phase: 5.2 strategy writer (three
 * section calls), 5.3 ToV writer (two section calls), 5.4 pair QA. Sections,
 * not documents; claims and pillars come back with `local_ref`, code mints
 * `CL01…` / `PL01…`; support levels are downgraded by code to what the cited
 * proof cards allow ("no auto promotion").
 */

const ids = z.array(z.string().min(1))
const outputLanguage = z.enum(['pl', 'en'])

export const strategyOrderContextSchema = z.object({
  brand: z.string().min(1),
  market: z.string().min(1),
  language: z.string().min(1),
  websiteUrl: z.string().min(1),
  purchaseGoal: z.string().nullable(),
  sku: z.string().min(1),
})

/** KLI-BRIEF compacted for the writers: values, decision states and cited ids, never the whole envelope. */
export const strategyBriefInputSchema = z.object({
  priority_offer: z.object({ value: z.string(), decision_state: z.string(), result_for_audience: z.string(), excluded_from_scope: z.array(z.string()), fact_ids: ids }),
  priority_audience: z.object({
    value: z.string(),
    decision_state: z.string(),
    segment: z.string(),
    target_role: z.array(z.string()),
    buyer_claims: z.array(z.object({ component: z.string(), value: z.string().nullable(), knowledge_status: z.string(), evidence_ids: ids })),
    fact_ids: ids,
  }),
  business_direction: z.object({ value: z.string(), decision_state: z.string(), from_to: z.string(), communication_role: z.string(), not_promised: z.array(z.string()), fact_ids: ids }),
  buyer_reality: z.array(z.object({ situation: z.string(), status: z.string(), relevant_fact_ids: ids })),
  promise_constraints: z.object({ capabilities: z.string(), result_limits: z.string(), prohibited_claims: z.array(z.string()), allowed_proof_ids: ids }),
  voice_preferences: z.object({
    desired_traits: z.array(z.string()),
    unwanted_traits: z.array(z.string()),
    style_preferences: z.object({ jargon: z.string().nullable(), humor: z.string().nullable(), formalness: z.string().nullable() }),
    proposed_examples: z.array(z.object({ variant_id: z.string(), label: z.string(), text: z.string(), fact_ids: ids })),
    sample_ids: ids,
  }),
  channel_and_cta: z.object({
    channel: z.string(),
    audience_context: z.string(),
    cta_goal: z.string(),
    destination: z.string().nullable(),
    destination_visibility: z.string(),
    owner: z.string().nullable(),
    limits: z.array(z.string()),
    fact_ids: ids,
  }),
  success_and_limits: z.object({ directional_goal: z.string(), baseline: z.string().nullable(), numerical_target: z.string().nullable(), scope_limit: z.string() }),
  open_assumptions: z.array(z.object({ assumption_id: z.string(), text: z.string(), type: z.string(), impact: z.string() })),
})
export type StrategyBriefInput = z.infer<typeof strategyBriefInputSchema>

export const strategyEvidenceInputSchema = z.object({
  facts: z.array(z.object({ fact_id: z.string(), entity: z.string(), claim: z.string(), kind: z.string(), limitation: z.string().nullable() })),
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), artifact_or_method: z.string().nullable(), observed_result: z.string().nullable(), fact_ids: ids, limitations: z.array(z.string()) })),
  content_bank: z.array(z.object({ seed_id: z.string(), audience_question: z.string(), angle: z.string(), fact_ids: ids, proof_ids: ids, readiness: z.string() })),
})

export const strategyAuditInputSchema = z.object({
  offer_map: z.array(z.object({ service: z.string(), described_audience: z.string(), problem: z.string(), mechanism: z.string(), limits: z.string(), fact_ids: ids })),
  buyer_map: z.array(z.object({ scenario_id: z.string(), status: z.string(), initiator: z.string(), job: z.string(), objections: z.array(z.string()), direct_customer_voice: z.boolean(), fact_ids: ids })),
  message_map: z.array(z.object({ message: z.string(), category: z.string(), benefit: z.string(), proof_ids: ids, risk: z.string(), fact_ids: ids })),
  gaps: z.array(z.object({ gap_id: z.string(), observation: z.string(), priority: z.string(), destination: z.string(), evidence_ids: ids })),
  reusable_assets: z.array(z.object({ asset: z.string(), value_for_audience: z.string(), proof_ids: ids, seed_ids: ids })),
})

export const strategyCompetitorsInputSchema = z.object({
  parity_claims: z.array(z.object({ claim: z.string(), companies: z.array(z.string()), evidence_ids: ids, why_insufficient: z.string() })),
  difference_candidates: z.array(z.object({ candidate_id: z.string(), feature: z.string(), audience_value: z.string(), proof_ids: ids, comparison: z.string(), unknown: z.string(), allowed_claim_strength: z.string(), fact_ids: ids })),
  alternative_routes: z.array(z.object({ route: z.string(), status: z.string(), when_sensible: z.string(), tradeoff: z.string(), evidence_ids: ids })),
  implications: z.array(z.object({ finding: z.string(), limitation: z.string(), strategy_field: z.string(), client_answer_needed: z.string().nullable(), evidence_ids: ids })),
})

export const strategySections = ['choice_tension_uvp', 'proof_messages', 'pillars_channel_boundaries'] as const
export type StrategySection = (typeof strategySections)[number]

/** What every strategy writer call reads; `draft` carries the sections already written in this run. */
export const strategyWriterInputSchema = z.object({
  order: strategyOrderContextSchema,
  outputLanguage,
  section: z.enum(strategySections),
  brief: strategyBriefInputSchema,
  audit: strategyAuditInputSchema,
  competitors: strategyCompetitorsInputSchema.nullable(),
  evidence: strategyEvidenceInputSchema,
  draft: z.record(z.string(), z.unknown()),
  previous_strategy: z.record(z.string(), z.unknown()).nullable(),
  repair_findings: z.array(qaFindingSchema),
})
export type StrategyWriterInput = z.infer<typeof strategyWriterInputSchema>

/** The UVP as the writer returns it: `local_ref` instead of `claim_id`. */
export const uvpDraftSchema = z.object({
  local_ref: z.string().min(1),
  working_sentence: z.string().min(1),
  explanation: z.array(z.string().min(1)),
  mechanism: z.string().min(1),
  alternative: z.string().min(1),
  reason_to_believe: z.string().min(1),
  evidence_ids: ids,
  support_level: z.enum(supportLevels),
  use_conditions: z.array(z.string().min(1)),
  alternative_status: z.string().min(1),
})

// (a) strategic_choice, buyer_tension, uvp, options_considered
export const strategyChoiceSectionSchema = z.object({
  strategic_choice: strategicChoiceSchema,
  buyer_tension: buyerTensionSchema,
  uvp: uvpDraftSchema,
  options_considered: z.array(optionConsideredSchema),
})

export const proofClaimDraftSchema = z.object({
  local_ref: z.string().min(1),
  allowed_claim: z.string().min(1),
  mechanism: z.string().min(1),
  proof_ids: ids,
  fact_ids: ids,
  source_ids: ids,
  status: z.enum(supportLevels),
  limitations: z.array(z.string().min(1)),
  forbidden_claim: z.string().min(1),
  confirmation_owner: z.string().min(1),
})

// (b) proof_architecture, message_hierarchy — claims cited by `claim_refs` (local refs)
export const strategyProofSectionSchema = z.object({
  proof_architecture: z.array(proofClaimDraftSchema),
  message_hierarchy: z.object({
    main_promise: z.object({ text: z.string().min(1), status: z.enum(supportLevels), claim_refs: ids }),
    supporting_messages: z.array(z.object({ order: z.number().int().min(1), text: z.string().min(1), claim_refs: ids, fact_ids: ids })),
    explanation_order: z.array(z.string().min(1)),
  }),
})

export const pillarDraftSchema = z.object({
  local_ref: z.string().min(1),
  area: z.string().min(1),
  strategic_goal: z.string().min(1),
  audience_question: z.string().min(1),
  allowed_content: z.array(z.string().min(1)),
  exclusions: z.array(z.string().min(1)),
  claim_refs: ids,
  seed_ids: ids,
})

// (c) pillars, channel_role, measurement_hypothesis, creative_boundaries
export const strategyPillarsSectionSchema = z.object({
  pillars: z.array(pillarDraftSchema),
  channel_role: channelRoleSchema,
  measurement_hypothesis: measurementHypothesisSchema,
  creative_boundaries: creativeBoundariesSchema,
})

/** One flat result shape for the three calls; the pipeline requires the keys of the requested section. */
export const strategyWriterSectionsSchema = z.object({
  ...strategyChoiceSectionSchema.partial().shape,
  ...strategyProofSectionSchema.partial().shape,
  ...strategyPillarsSectionSchema.partial().shape,
})
export type StrategyWriterSections = z.infer<typeof strategyWriterSectionsSchema>
export const strategyWriterResult = z.object({ kind: z.literal('research'), data: strategyWriterSectionsSchema })

// ---------------------------------------------------------------------------
// 5.3 — ToV writer
// ---------------------------------------------------------------------------

export const tovSections = ['principles_axes_wording', 'evidence_examples_checks'] as const
export type TovSection = (typeof tovSections)[number]

export const tovWriterInputSchema = z.object({
  order: strategyOrderContextSchema,
  outputLanguage,
  section: z.enum(tovSections),
  strategy: z.object({
    strategic_choice: z.object({ positioning: z.string(), audience: z.string(), situation: z.string(), deprioritized: z.array(z.string()) }),
    uvp: z.object({ claim_id: z.string(), working_sentence: z.string(), mechanism: z.string(), reason_to_believe: z.string(), support_level: z.string() }),
    message_hierarchy: z.object({ main_promise: z.string(), supporting_messages: z.array(z.string()) }),
    proof_architecture: z.array(z.object({ claim_id: z.string(), allowed_claim: z.string(), forbidden_claim: z.string(), status: z.string() })),
    creative_boundaries: z.object({ prohibited_promises: z.array(z.string()), permitted_creativity: z.string(), not_promoted: z.array(z.string()) }),
    channel_role: z.object({ channel: z.string(), role: z.string(), knowledge_level: z.string() }),
  }),
  brief: strategyBriefInputSchema.pick({ voice_preferences: true, priority_audience: true, promise_constraints: true, open_assumptions: true }),
  voice_audit: z.object({
    sample_size: z.string(),
    formality: z.string(),
    directness: z.string(),
    technical_level: z.string(),
    emotion: z.string(),
    claim_certainty: z.string(),
    recurring_phrases: z.string(),
    future_voice_status: z.string(),
  }),
  language_samples: z.array(z.object({ sample_id: z.string(), channel: z.string(), excerpt: z.string(), linguistic_features: z.array(z.string()) })),
  facts: strategyEvidenceInputSchema.shape.facts,
  proof_cards: strategyEvidenceInputSchema.shape.proof_cards,
  draft: z.record(z.string(), z.unknown()),
  previous_tov: z.record(z.string(), z.unknown()).nullable(),
  repair_findings: z.array(qaFindingSchema),
})
export type TovWriterInput = z.infer<typeof tovWriterInputSchema>

export const beforeAfterDraftSchema = z.object({
  before: z.string().min(1),
  after: z.string().min(1),
  changed_principle: z.string().min(1),
  fact_ids: ids,
})

// (a) voice_principles, style_axes, wording
export const tovPrinciplesSectionSchema = z.object({
  voice_principles: z.array(voicePrincipleSchema),
  style_axes: z.array(styleAxisSchema),
  wording: wordingSchema,
})

// (b) evidence_language, before_after, context_rules, copy_checks
export const tovExamplesSectionSchema = z.object({
  evidence_language: z.array(evidenceLanguageSchema),
  /** `status` is set by code: grounded when fact_ids resolve, else creative_example. */
  before_after: z.array(beforeAfterDraftSchema),
  context_rules: z.array(contextRuleSchema),
  copy_checks: z.array(z.string().min(1)),
})

export const tovWriterSectionsSchema = z.object({
  ...tovPrinciplesSectionSchema.partial().shape,
  ...tovExamplesSectionSchema.partial().shape,
})
export type TovWriterSections = z.infer<typeof tovWriterSectionsSchema>
export const tovWriterResult = z.object({ kind: z.literal('research'), data: tovWriterSectionsSchema })

// ---------------------------------------------------------------------------
// 5.4 — Q-S pair QA
// ---------------------------------------------------------------------------

export const strategyQaVerdicts = ['ready_for_approval', 'needs_agent_fix'] as const
export type StrategyQaVerdict = (typeof strategyQaVerdicts)[number]

export const strategyQaInputSchema = z.object({
  order: strategyOrderContextSchema,
  outputLanguage,
  strategy: z.unknown(),
  tov: z.unknown(),
  brief: strategyBriefInputSchema,
  proof_cards: strategyEvidenceInputSchema.shape.proof_cards,
  validator_findings: z.array(qaFindingSchema),
  criteria: z.array(z.string().min(1)),
})
export const strategyQaAgentResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    verdict: z.enum(strategyQaVerdicts),
    findings: z.array(qaFindingSchema),
    summary: z.string().min(1),
  }),
})
export type StrategyQaAgentData = z.infer<typeof strategyQaAgentResult>['data']
