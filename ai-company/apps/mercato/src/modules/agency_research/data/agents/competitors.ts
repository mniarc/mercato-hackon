import { z } from 'zod'
import { onboardingContextSchema } from './onboarding'
import { businessProfileSchema, factKinds } from '../schemas/zrodla'
import { alternativeRouteSchema, cardDimensionSchema, claimStrengths, implicationSchema, parityClaimSchema, returnRequestSchema } from '../schemas/konkurencja'

/**
 * 3.4–3.5 agent I/O. Discovery is code (Firecrawl search); the selector only
 * chooses among real hits; card extraction reads one competitor's facts; the
 * synthesizer compares on common criteria and never declares uniqueness from
 * absence.
 */

const ids = z.array(z.string().min(1))
const orderContext = z.object({ brand: z.string(), market: z.string(), language: z.string(), websiteUrl: z.string(), purchaseGoal: z.string().nullable() })

export const competitorSelectorInputSchema = z.object({
  onboarding_context: onboardingContextSchema.nullable().optional(),
  order: orderContext,
  outputLanguage: z.enum(['pl', 'en']),
  business_profile: businessProfileSchema,
  offer_map: z.array(z.object({ service: z.string(), described_audience: z.string(), problem: z.string() })),
  buyer_map: z.array(z.object({ status: z.string(), job: z.string(), purchase_moment: z.string() })),
  /** Real search results; a candidate's `url` MUST be one of these. */
  search_hits: z.array(z.object({ url: z.string(), title: z.string().nullable(), snippet: z.string().nullable() })),
  maxCompetitors: z.number().int().min(1),
})

export const competitorSelectorResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    candidates: z.array(
      z.object({
        company: z.string().min(1),
        url: z.string().min(1),
        competition_type: z.string().min(1),
        shared_problem_scope: z.string().min(1),
        market_scale_difference: z.string().min(1),
        reason: z.string().min(1),
      }),
    ),
    excluded: z.array(z.object({ url: z.string().min(1), why: z.string().min(1) })),
  }),
})

export const competitorCardInputSchema = z.object({
  order: orderContext,
  outputLanguage: z.enum(['pl', 'en']),
  company: z.string(),
  selection: z.object({ competition_type: z.string(), shared_problem_scope: z.string(), reason: z.string() }),
  sources: z.array(z.object({ source_id: z.string(), url: z.string(), kind: z.string(), access: z.string() })),
  facts: z.array(z.object({ fact_id: z.string(), kind: z.enum(factKinds), claim: z.string(), limitation: z.string().nullable(), source_ids: z.array(z.string()) })),
  language_samples: z.array(z.object({ sample_id: z.string(), excerpt: z.string(), linguistic_features: z.array(z.string()) })),
})

export const competitorCardResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    card: z.object({
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
    }),
  }),
})

/** The channel observation is a second agent over the same packet, so each registered schema stays small. */
export const competitorChannelsResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    channel_observation: z.object({
      visible_activity: z.string().min(1),
      sample: z.string().min(1),
      visible_metrics: z.string().min(1),
      unknowns: z.array(z.string().min(1)),
      fact_ids: ids,
    }),
  }),
})

export const competitorSynthesizerInputSchema = z.object({
  order: orderContext,
  outputLanguage: z.enum(['pl', 'en']),
  client: z.object({
    offer_map: z.array(z.object({ service: z.string(), problem: z.string(), mechanism: z.string(), fact_ids: z.array(z.string()) })),
    buyer_map: z.array(z.object({ scenario_id: z.string(), status: z.string(), job: z.string(), objections: z.array(z.string()) })),
    message_map: z.array(z.object({ message: z.string(), benefit: z.string(), mechanism: z.string(), proof_ids: z.array(z.string()), fact_ids: z.array(z.string()) })),
    proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), artifact_or_method: z.string().nullable(), observed_result: z.string().nullable() })),
  }),
  selection: z.array(z.object({ company: z.string(), competition_type: z.string(), shared_problem_scope: z.string() })),
  cards: z.array(z.unknown()),
  repair_findings: z.array(z.unknown()),
})

export const competitorSynthesizerResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    parity_claims: z.array(parityClaimSchema),
    alternative_routes: z.array(alternativeRouteSchema),
    difference_candidates: z.array(
      z.object({
        feature: z.string().min(1),
        audience_value: z.string().min(1),
        proof_ids: ids,
        comparison: z.string().min(1),
        unknown: z.string().min(1),
        allowed_claim_strength: z.enum(claimStrengths),
        fact_ids: ids,
      }),
    ),
    implications: z.array(implicationSchema),
    return_requests: z.array(returnRequestSchema),
  }),
})
