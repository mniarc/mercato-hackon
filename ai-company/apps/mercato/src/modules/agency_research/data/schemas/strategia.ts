import { z } from 'zod'

/**
 * KLI-STRATEGIA (WZR-STRATEGIA, process 5.2) — one positioning, one priority
 * buyer situation, a UVP with mechanism and reason to believe, proof architecture
 * per claim, 3–4 pillars, the channel's role and the creative boundaries. Every
 * claim carries `claim_id` (`CL01…`, minted in code) and cites facts / proofs.
 * "Nie wyprowadzamy unikalności z braku wzmianki u konkurenta."
 */

const ids = z.array(z.string().min(1))
export const knowledgeStatus = z.enum(['fact', 'hypothesis', 'client_decision', 'unknown'])
export const supportLevels = ['declared_method', 'documented_capability', 'demonstrated_result'] as const

export const strategicChoiceSchema = z.object({
  positioning: z.string().min(1),
  audience: z.string().min(1),
  situation: z.string().min(1),
  category: z.string().min(1),
  /** Reference to the brief decision this rests on (KLI-BRIEF field / decision ref). */
  decision: z.string().min(1),
  deprioritized: z.array(z.string().min(1)),
  rationale: z.string().min(1),
  status: knowledgeStatus,
  evidence_ids: ids,
})

export const buyerTensionSchema = z.object({
  desired_progress: z.string().min(1),
  barrier: z.string().min(1),
  illustrative_objection: z.string().min(1),
  objection_status: z.enum(['customer_voice', 'illustrative_hypothesis']),
  status_quo_risk: z.string().min(1),
  decision_criterion: z.object({ text: z.string().nullable(), status: knowledgeStatus, origin: z.string().min(1), empirical_buyer_evidence: z.string().nullable() }),
  evidence_status: z.string().min(1),
  evidence_ids: ids,
})

export const uvpSchema = z.object({
  claim_id: z.string().min(1),
  working_sentence: z.string().min(1),
  explanation: z.array(z.string().min(1)),
  mechanism: z.string().min(1),
  /** The concrete alternative it is compared against (never "everyone else"). */
  alternative: z.string().min(1),
  reason_to_believe: z.string().min(1),
  evidence_ids: ids,
  support_level: z.enum(supportLevels),
  use_conditions: z.array(z.string().min(1)),
  alternative_status: z.string().min(1),
})

export const optionConsideredSchema = z.object({ direction: z.string().min(1), advantage: z.string().min(1), rejection: z.string().min(1) })

export const proofClaimSchema = z.object({
  claim_id: z.string().min(1),
  allowed_claim: z.string().min(1),
  mechanism: z.string().min(1),
  proof_ids: ids,
  fact_ids: ids,
  source_ids: ids,
  status: z.enum(supportLevels),
  limitations: z.array(z.string().min(1)),
  forbidden_claim: z.string().min(1),
  /** Who confirms before use: `client`, `agency`, `none_needed`. */
  confirmation_owner: z.string().min(1),
})

export const messageHierarchySchema = z.object({
  main_promise: z.object({ text: z.string().min(1), status: z.enum(supportLevels), claim_ids: ids }),
  supporting_messages: z.array(z.object({ order: z.number().int().min(1), text: z.string().min(1), claim_ids: ids, fact_ids: ids })),
  explanation_order: z.array(z.string().min(1)),
})

export const pillarSchema = z.object({
  pillar_id: z.string().min(1),
  area: z.string().min(1),
  strategic_goal: z.string().min(1),
  audience_question: z.string().min(1),
  allowed_content: z.array(z.string().min(1)),
  exclusions: z.array(z.string().min(1)),
  claim_ids: ids,
  seed_ids: ids,
})

export const channelRoleSchema = z.object({
  channel: z.string().min(1),
  role: z.string().min(1),
  knowledge_level: z.string().min(1),
  contact_path: z.string().min(1),
  content_scope: z.string().min(1),
  limits: z.string().min(1),
  contact_owner: z.string().nullable(),
  evidence_ids: ids,
})

export const measurementHypothesisSchema = z.object({
  hypothesis: z.string().min(1),
  observable_signals: z.array(z.string().min(1)),
  measures: z.array(z.object({ name: z.string().min(1), definition: z.string().min(1) })),
  baseline: z.string().nullable(),
  numerical_target: z.string().nullable(),
  future_test: z.string().min(1),
  causality_limit: z.string().min(1),
  evidence_ids: ids,
})

export const creativeBoundariesSchema = z.object({
  not_promoted: z.array(z.string().min(1)),
  prohibited_promises: z.array(z.string().min(1)),
  permitted_creativity: z.string().min(1),
  rights: z.string().min(1),
  open_assumptions: z.array(z.string().min(1)),
  plan_effect: z.string().min(1),
  research_return_required: z.boolean(),
})

export const strategiaDataSchema = z.object({
  strategic_choice: strategicChoiceSchema,
  buyer_tension: buyerTensionSchema,
  uvp: uvpSchema,
  options_considered: z.array(optionConsideredSchema),
  proof_architecture: z.array(proofClaimSchema),
  message_hierarchy: messageHierarchySchema,
  pillars: z.array(pillarSchema),
  channel_role: channelRoleSchema,
  measurement_hypothesis: measurementHypothesisSchema,
  creative_boundaries: creativeBoundariesSchema,
})
export type StrategiaData = z.infer<typeof strategiaDataSchema>
