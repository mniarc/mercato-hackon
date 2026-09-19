import { z } from 'zod'
import { ctaTypes, planBalanceSchema } from '../schemas/plan'
import { qaFindingSchema } from '../schemas/qa'
import { readiness } from '../schemas/zrodla'

/**
 * Agent input/result schemas of the planning phase (6.2 writer in three section
 * calls over two agents, 6.3 Q-P QA). Sections, not documents: topics come back with `local_ref`
 * and code mints `TOP01…` by day; the balance/recommendation call reads the
 * already gated topics. Selection (6.5) and the post instruction (6.7) are code.
 */

const ids = z.array(z.string().min(1))
const outputLanguage = z.enum(['pl', 'en'])

export const planWriterSections = ['topics_1_6', 'topics_7_12', 'balance_recommendation'] as const
export type PlanWriterSection = (typeof planWriterSections)[number]

const planOrderContextSchema = z.object({
  brand: z.string().min(1),
  market: z.string().min(1),
  language: z.string().min(1),
  websiteUrl: z.string().min(1),
  purchaseGoal: z.string().nullable(),
  sku: z.string().min(1),
})

/** A gated topic as the balance call and a repair pass see it. */
const compactTopicSchema = z.object({
  topic_id: z.string(),
  day: z.number().int(),
  pillar_id: z.string(),
  audience_question: z.string(),
  topic: z.string(),
  main_message: z.string(),
  seed_ids: ids,
  claim_ids: ids,
  fact_ids: ids,
  proof_ids: ids,
  readiness: z.enum(readiness),
})

/** What every writer call reads: the strategy's frame, the seeds with their evidence texts — never page text. */
export const planWriterInputSchema = z.object({
  order: planOrderContextSchema,
  outputLanguage,
  section: z.enum(planWriterSections),
  /** Inclusive day window and number of topics this call must return (0 for the balance call). */
  days: z.tuple([z.number().int(), z.number().int()]),
  topic_count: z.number().int().min(0),
  channel: z.string(),
  audience: z.string(),
  positioning: z.string(),
  pillars: z.array(z.object({ pillar_id: z.string(), area: z.string(), strategic_goal: z.string(), audience_question: z.string(), allowed_content: z.array(z.string()), exclusions: z.array(z.string()), claim_ids: ids, seed_ids: ids })),
  claims: z.array(z.object({ claim_id: z.string(), allowed_claim: z.string(), status: z.string(), forbidden_claim: z.string(), limitations: z.array(z.string()) })),
  creative_boundaries: z.object({ not_promoted: z.array(z.string()), prohibited_promises: z.array(z.string()), permitted_creativity: z.string() }),
  channel_role: z.object({ role: z.string(), content_scope: z.string(), limits: z.string() }),
  cta: z.object({ goal: z.string(), text: z.string().nullable(), destination: z.string().nullable() }),
  voice_traits: z.array(z.string()),
  seeds: z.array(
    z.object({
      seed_id: z.string(),
      audience_question: z.string(),
      angle: z.string(),
      source_claim: z.string(),
      proposed_utility: z.string(),
      fact_ids: ids,
      proof_ids: ids,
      prohibited_claims: z.array(z.string()),
      readiness: z.enum(readiness),
    }),
  ),
  facts: z.array(z.object({ fact_id: z.string(), claim: z.string(), kind: z.string(), source_ids: ids, limitation: z.string().nullable() })),
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), artifact_or_method: z.string().nullable(), observed_result: z.string().nullable(), limitations: z.array(z.string()) })),
  sources: z.array(z.object({ source_id: z.string(), publisher: z.string(), url: z.string() })),
  implications: z.array(z.object({ finding: z.string(), limitation: z.string() })),
  /** Topics already gated in this run (the earlier section, or all twelve for the balance call). */
  existing_topics: z.array(compactTopicSchema),
  /** QA findings addressed to this step on a repair pass. */
  repair_findings: z.array(qaFindingSchema),
})
export type PlanWriterInput = z.infer<typeof planWriterInputSchema>

// Lenient on purpose: provider-side structured output enforces types and enums, not string lengths or
// numeric ranges, and a single empty string must not void a whole six-topic answer — the gate drops the row.
export const planWriterTopicSchema = z.object({
  local_ref: z.string(),
  day: z.number().int(),
  pillar_id: z.string(),
  audience_question: z.string(),
  topic: z.string(),
  main_message: z.string(),
  format: z.string(),
  angle: z.object({
    tool: z.string(),
    steps: z.array(z.string()),
    status: z.string(),
    example: z.object({ text: z.string(), status: z.string() }).nullable(),
  }),
  claim_ids: ids,
  seed_ids: ids,
  fact_ids: ids,
  proof_ids: ids,
  source_ids: ids,
  evidence_excerpt: z.string(),
  evidence_limits: z.string(),
  post_goal: z.string(),
  cta: z.string(),
  cta_type: z.enum(ctaTypes),
  readiness: z.enum(readiness),
  readiness_scope: z.string(),
  evidence_reuse_note: z.string().nullable(),
})
export type PlanWriterTopic = z.infer<typeof planWriterTopicSchema>

export const planWriterRecommendationSchema = z.object({
  /** A `TOP..` id of the existing topics. */
  topic_id: z.string(),
  reason: z.string(),
  evidence_available: z.array(z.string()),
  role: z.string(),
  readiness: z.enum(readiness),
})

/** The writer's balance: pillar counts as rows (a record is not accepted by provider structured output); code rebuilds the record. */
export const planWriterBalanceSchema = planBalanceSchema.omit({ pillar_counts: true }).extend({
  pillar_counts: z.array(z.object({ pillar_id: z.string(), count: z.number().int() })),
})

/** One agent per section, each with a section-sized result: the topics window, or balance + recommendation. */
export const planTopicsSectionSchema = z.object({ topics: z.array(planWriterTopicSchema) })
export const planBalanceSectionSchema = z.object({ balance: planWriterBalanceSchema, recommendation: planWriterRecommendationSchema })
export type PlanTopicsSection = z.infer<typeof planTopicsSectionSchema>
export type PlanBalanceSection = z.infer<typeof planBalanceSectionSchema>

export const planTopicsResult = z.object({ kind: z.literal('research'), data: planTopicsSectionSchema })
export const planBalanceResult = z.object({ kind: z.literal('research'), data: planBalanceSectionSchema })

// ---------------------------------------------------------------------------
// 6.3 — Q-P over the assembled plan plus the validator's findings
// ---------------------------------------------------------------------------

export const planQaVerdicts = ['ready_for_approval', 'needs_agent_fix'] as const
export type PlanQaVerdict = (typeof planQaVerdicts)[number]

export const planQaInputSchema = z.object({
  order: planOrderContextSchema,
  outputLanguage,
  plan: z.unknown(),
  pillars: z.array(z.object({ pillar_id: z.string(), area: z.string(), audience_question: z.string() })),
  seeds: z.array(z.object({ seed_id: z.string(), audience_question: z.string(), source_claim: z.string(), readiness: z.enum(readiness) })),
  audience: z.string(),
  topic_count: z.number().int(),
  validator_findings: z.array(qaFindingSchema),
  criteria: z.array(z.string().min(1)),
})
export type PlanQaInput = z.infer<typeof planQaInputSchema>

export const planQaAgentDataSchema = z.object({
  verdict: z.enum(planQaVerdicts),
  findings: z.array(qaFindingSchema),
  summary: z.string().min(1),
})
export type PlanQaAgentData = z.infer<typeof planQaAgentDataSchema>

export const planQaAgentResult = z.object({ kind: z.literal('research'), data: planQaAgentDataSchema })
