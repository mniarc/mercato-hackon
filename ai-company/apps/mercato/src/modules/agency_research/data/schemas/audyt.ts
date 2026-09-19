import { z } from 'zod'

/**
 * WEW-AUDYT (WZR-AUDYT, process 3.3) — audit of the current communication and of
 * the ability to justify promises. "Rozpoznać stan obecny, mocne materiały i luki.
 * Nie wybierać za klienta jego przyszłej wizji." Every item cites ids from
 * WEW-ZRODLA (facts F/C, proof cards P, samples L, seeds T).
 */

const ids = z.array(z.string().min(1))

export const evidenceStatuses = ['evidence', 'hypothesis', 'unknown'] as const
export const gapPriorities = ['must', 'should', 'could'] as const

export const offerMapItemSchema = z.object({
  service: z.string().min(1),
  described_audience: z.string().min(1),
  problem: z.string().min(1),
  result: z.string().min(1),
  mechanism: z.string().min(1),
  limits: z.string().min(1),
  fact_ids: ids.min(1),
})

export const buyerMapItemSchema = z.object({
  scenario_id: z.string().min(1),
  status: z.enum(evidenceStatuses),
  initiator: z.string().min(1),
  user: z.string().min(1),
  decision_maker: z.string().min(1),
  purchase_moment: z.string().min(1),
  job: z.string().min(1),
  objections: z.array(z.string().min(1)),
  selection_criteria: z.string().nullable(),
  selection_criteria_status: z.enum(evidenceStatuses),
  direct_customer_voice: z.boolean(),
  fact_ids: ids,
})

export const messageMapItemSchema = z.object({
  message: z.string().min(1),
  category: z.string().min(1),
  audience: z.string().min(1),
  benefit: z.string().min(1),
  mechanism: z.string().min(1),
  proof_ids: ids,
  /** The generality or over-promise in it. */
  risk: z.string().min(1),
  fact_ids: ids.min(1),
})

const voiceDimensionSchema = z.object({
  finding: z.string().min(1),
  sample_ids: ids,
  interpretation_limit: z.string().nullable(),
})

export const voiceAuditSchema = z.object({
  sample_size: z.string().min(1),
  formality: voiceDimensionSchema,
  directness: voiceDimensionSchema,
  technical_level: voiceDimensionSchema,
  emotion: voiceDimensionSchema,
  claim_certainty: voiceDimensionSchema,
  recurring_phrases: voiceDimensionSchema,
  channel_difference: voiceDimensionSchema,
  /** The future voice is a client decision, never an audit finding. */
  future_voice_status: z.string().min(1),
})

export const journeyItemSchema = z.object({
  stage: z.string().min(1),
  material: z.string().min(1),
  promise: z.string().min(1),
  cta: z.string().min(1),
  destination_status: z.string().min(1),
  friction: z.string().nullable(),
  friction_status: z.string().min(1),
  possible_improvement: z.string().min(1),
  research_limitation: z.string().nullable(),
  fact_ids: ids.min(1),
})

export const relationshipItemSchema = z.object({
  area: z.string().min(1),
  finding: z.string().min(1),
  /** first_party_claim | observed_partial | unknown */
  status: z.string().min(1),
  fact_ids: ids,
})

export const gapItemSchema = z.object({
  gap_id: z.string().min(1),
  observation: z.string().min(1),
  business_impact_hypothesis: z.string().nullable(),
  evidence_ids: ids,
  priority: z.enum(gapPriorities),
  needed: z.string().min(1),
  /** Where the gap is resolved: `WEW-USTALENIA → KLI-BRIEF.priority_offer`, `3.4`, … */
  destination: z.string().min(1),
  finding_type: z.string().min(1),
  consequence_for_work: z.string().min(1),
})

export const reusableAssetSchema = z.object({
  asset: z.string().min(1),
  value_for_audience: z.string().min(1),
  proof_ids: ids,
  seed_ids: ids,
  availability: z.string().min(1),
  limit: z.string().min(1),
})

export const audytDataSchema = z.object({
  offer_map: z.array(offerMapItemSchema),
  buyer_map: z.array(buyerMapItemSchema),
  message_map: z.array(messageMapItemSchema),
  voice_audit: voiceAuditSchema,
  journey: z.array(journeyItemSchema),
  relationship: z.array(relationshipItemSchema),
  gaps: z.array(gapItemSchema),
  reusable_assets: z.array(reusableAssetSchema),
})
export type AudytData = z.infer<typeof audytDataSchema>
