import { z } from 'zod'
import { allowedUses, permissionStates, provenances, readiness, sourceVisibility } from './zrodla'

/**
 * KLI-BRIEF (WZR-BRIEF, process 4.1–4.6) — the client's brief of needs, choices
 * and limits. Filled with what research knows, marked where only the client can
 * decide (goals, direction, audiences, priorities, constraints, channel). Never
 * makes the client write the strategy; never records a guess as a decision.
 */

const ids = z.array(z.string().min(1))

export const briefDecisionStates = ['awaiting_client', 'client_selected', 'simulated_selection'] as const
export const briefKnowledgeStatuses = ['evidence', 'client_declaration', 'hypothesis', 'unknown'] as const

/** Every object field carries how it was decided; `awaiting_client` until a real decision is recorded. */
const decided = {
  value: z.string().min(1),
  decision_state: z.enum(briefDecisionStates),
  decision_ref: z.string().nullable(),
  fact_ids: ids,
}

export const priorityOfferSchema = z.object({
  ...decided,
  result_for_audience: z.string().min(1),
  excluded_from_scope: z.array(z.string().min(1)),
})

export const buyerClaimSchema = z.object({
  component: z.enum(['purchase_situation', 'job', 'selection_criteria', 'objection']),
  value: z.string().nullable(),
  knowledge_status: z.enum(briefKnowledgeStatuses),
  provenance: z.enum(provenances),
  evidence_ids: ids,
  allowed_use: z.string().min(1),
})

export const priorityAudienceSchema = z.object({
  ...decided,
  priority_choice: z.object({
    segment: z.string().min(1),
    target_role: z.array(z.string().min(1)),
    decision_ref: z.string().nullable(),
    decision_version: z.string().nullable(),
    decision_state: z.enum(briefDecisionStates),
  }),
  buyer_claims: z.array(buyerClaimSchema),
  secondary_groups: z.string().nullable(),
})

export const businessDirectionSchema = z.object({
  ...decided,
  from_to: z.string().min(1),
  horizon: z.string().nullable(),
  baseline: z.string().nullable(),
  communication_role: z.string().min(1),
  not_promised: z.array(z.string().min(1)),
})

export const buyerRealityItemSchema = z.object({
  situation: z.string().min(1),
  /** direct_example | general_declaration | hypothesis */
  status: z.string().min(1),
  relevant_fact_ids: ids,
  need_for_real_evidence: z.string().nullable(),
})

export const rightsByProofSchema = z.object({
  proof_id: z.string().min(1),
  source_visibility: z.enum(sourceVisibility),
  allowed_use: z.enum(allowedUses),
  use_basis_ref: z.string().nullable(),
  client_name_permission: z.enum(permissionStates),
  quote_permission: z.enum(permissionStates),
})

export const promiseConstraintsSchema = z.object({
  capabilities: z.string().min(1),
  result_limits: z.string().min(1),
  prohibited_claims: z.array(z.string().min(1)),
  allowed_proof_ids: ids,
  rights_by_proof: z.array(rightsByProofSchema),
  fact_ids: ids,
})

export const voiceExampleSchema = z.object({
  variant_id: z.string().min(1),
  label: z.string().min(1),
  text: z.string().min(1),
  fact_ids: ids,
  provenance: z.literal('creative_proposal'),
})

export const voicePreferencesSchema = z.object({
  desired_traits: z.array(z.string().min(1)),
  unwanted_traits: z.array(z.string().min(1)),
  style_preferences: z.object({ jargon: z.string().nullable(), humor: z.string().nullable(), formalness: z.string().nullable() }),
  /** Two equally valid proposals on the same facts — never a good one against a bad one. */
  proposed_examples: z.array(voiceExampleSchema),
  client_selection: z.string().nullable(),
  decision_version: z.string().nullable(),
  decision_state: z.enum(briefDecisionStates),
  sample_ids: ids,
})

export const channelAndCtaSchema = z.object({
  channel: z.string().min(1),
  audience_context: z.string().min(1),
  cta_goal: z.string().min(1),
  cta_text: z.string().nullable(),
  destination: z.string().nullable(),
  destination_visibility: z.enum(['observed', 'not_observed', 'unknown']),
  destination_functionality: z.enum(['verified', 'failed', 'not_checked']),
  owner: z.string().nullable(),
  required_owner_before_publish: z.boolean(),
  draft_readiness: z.enum(readiness),
  publication_readiness: z.enum(readiness),
  limits: z.array(z.string().min(1)),
  fact_ids: ids,
  decision_state: z.enum(briefDecisionStates),
})

export const successAndLimitsSchema = z.object({
  directional_goal: z.string().min(1),
  measurement_proposals: z.array(z.object({ measure: z.string().min(1), definition: z.string().min(1), status: z.string().min(1) })),
  baseline: z.string().nullable(),
  numerical_target: z.string().nullable(),
  scope_limit: z.string().min(1),
})

export const assetPermissionSchema = z.object({
  asset_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_visibility: z.enum(sourceVisibility),
  allowed_use: z.enum(allowedUses),
  use_basis_ref: z.string().nullable(),
  client_name_permission: z.enum(permissionStates),
  quote_permission: z.enum(permissionStates),
  supported_claim_ids: ids,
})

export const openAssumptionSchema = z.object({
  assumption_id: z.string().min(1),
  text: z.string().min(1),
  /** hypothesis | unknown_operational | creative_proposal | unknown_customer_evidence */
  type: z.string().min(1),
  impact: z.string().min(1),
  decision_owner: z.string().min(1),
  allowed_use: z.string().min(1),
  logical_deadline: z.string().min(1),
  state: z.enum(['open', 'confirmed', 'rejected']),
})

export const briefDataSchema = z.object({
  priority_offer: priorityOfferSchema,
  priority_audience: priorityAudienceSchema,
  business_direction: businessDirectionSchema,
  buyer_reality: z.array(buyerRealityItemSchema),
  promise_constraints: promiseConstraintsSchema,
  voice_preferences: voicePreferencesSchema,
  channel_and_cta: channelAndCtaSchema,
  success_and_limits: successAndLimitsSchema,
  assets_and_permissions: z.array(assetPermissionSchema),
  open_assumptions: z.array(openAssumptionSchema),
})
export type BriefData = z.infer<typeof briefDataSchema>
