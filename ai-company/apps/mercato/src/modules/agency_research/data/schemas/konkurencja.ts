import { z } from 'zod'

/**
 * WEW-KONKURENCJA (WZR-KONKURENCJA, process 3.4–3.5) — alternatives and the
 * credibility of a differentiator. ≤ 3 companies on common criteria; "brak
 * publicznej wzmianki nie jest negatywnym dowodem"; a UVP candidate joins
 * mechanism, benefit and provenance, never just an adjective. Competitor facts
 * are `C01…` in WEW-ZRODLA v2; client facts stay `F01…`.
 */

const ids = z.array(z.string().min(1))

export const selectionItemSchema = z.object({
  company: z.string().min(1),
  url: z.string().min(1),
  competition_type: z.string().min(1),
  shared_problem_scope: z.string().min(1),
  market_scale_difference: z.string().min(1),
  reason: z.string().min(1),
  fact_ids: ids,
})

/** One compared dimension: the text and the competitor facts behind it; `unknown` when nothing was read. */
export const cardDimensionSchema = z.object({
  text: z.string().min(1),
  fact_ids: ids,
  status: z.string().nullable(),
})

export const competitorCardSchema = z.object({
  company: z.string().min(1),
  market_segment: cardDimensionSchema,
  problem: cardDimensionSchema,
  service: cardDimensionSchema,
  message: cardDimensionSchema,
  mechanism: cardDimensionSchema,
  proof: cardDimensionSchema,
  cta: cardDimensionSchema,
  language: cardDimensionSchema,
  channels: z.object({ confirmed: z.array(z.string()), unverified: z.array(z.string()), fact_ids: ids }),
  comparability: z.string().min(1),
  category: z.string().min(1),
  unknowns: z.array(z.string().min(1)),
})

export const parityClaimSchema = z.object({
  claim: z.string().min(1),
  companies: z.array(z.string().min(1)).min(2),
  evidence_ids: ids,
  why_insufficient: z.string().min(1),
})

export const alternativeRouteSchema = z.object({
  route: z.string().min(1),
  /** hypothesis_not_buyer_research | buyer_evidence */
  status: z.string().min(1),
  when_sensible: z.string().min(1),
  tradeoff: z.string().min(1),
  evidence_ids: ids,
})

export const claimStrengths = ['hypothesis', 'described_approach', 'documented_capability', 'demonstrated_result'] as const

export const differenceCandidateSchema = z.object({
  candidate_id: z.string().min(1),
  feature: z.string().min(1),
  audience_value: z.string().min(1),
  proof_ids: ids,
  comparison: z.string().min(1),
  /** What is still unknown — never empty, because absence at a competitor is not exclusivity. */
  unknown: z.string().min(1),
  allowed_claim_strength: z.enum(claimStrengths),
  fact_ids: ids,
})

export const channelObservationSchema = z.object({
  company: z.string().min(1),
  visible_activity: z.string().min(1),
  sample: z.string().min(1),
  retrieved_at: z.string().min(1),
  published_dates: z.string().nullable(),
  visible_metrics: z.string().min(1),
  /** Always `unknown` unless a source measured it — reactions are not effectiveness. */
  business_effectiveness: z.string().min(1),
  unknowns: z.array(z.string().min(1)),
  fact_ids: ids,
})

export const implicationSchema = z.object({
  finding: z.string().min(1),
  limitation: z.string().min(1),
  strategy_field: z.string().min(1),
  client_answer_needed: z.string().nullable(),
  evidence_ids: ids,
})

/** A concrete gap 3.5 sends back to 3.2 or 3.4 within STD-LIMITY. */
export const returnRequestSchema = z.object({
  target_step: z.enum(['3.2', '3.4']),
  question: z.string().min(1),
  source_to_check: z.string().min(1),
  expected_result: z.string().min(1),
})

export const konkurencjaDataSchema = z.object({
  selection: z.array(selectionItemSchema),
  cards: z.array(competitorCardSchema),
  parity_claims: z.array(parityClaimSchema),
  alternative_routes: z.array(alternativeRouteSchema),
  difference_candidates: z.array(differenceCandidateSchema),
  channels: z.array(channelObservationSchema),
  implications: z.array(implicationSchema),
})
export type KonkurencjaData = z.infer<typeof konkurencjaDataSchema>
