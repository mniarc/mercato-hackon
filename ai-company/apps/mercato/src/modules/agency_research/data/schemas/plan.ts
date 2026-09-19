import { z } from 'zod'
import { readiness } from './zrodla'

/**
 * KLI-PLAN (WZR-PLAN, process 6.2) — twelve distinct topics over relative days
 * 1–30 on one channel, each on a pillar with an audience question, one main
 * message, a concrete angle, and the claims / seeds / facts behind it; a
 * recommendation and the (client) selection. Q-P: an approved plan has exactly
 * `unit.plan_topics` items with `readiness: ready`; `blocked` only in a draft.
 * The plan is a schedule of topics, never an order for twelve posts.
 */

const ids = z.array(z.string().min(1))

export const selectionStatuses = ['awaiting_client', 'simulated_selection', 'client_selected'] as const
export type SelectionStatus = (typeof selectionStatuses)[number]

export const ctaTypes = ['contact', 'question', 'reflection', 'none'] as const

export const planContextSchema = z.object({
  channel: z.string().min(1),
  relative_days: z.string().min(1),
  audience: z.string().min(1),
  topic_count: z.number().int().min(1),
  format: z.string().min(1),
  finished_posts_in_scope: z.number().int().min(0),
  /** Pinned versions of the documents this plan rests on (document id → version). */
  versions: z.record(z.string(), z.string()),
  /** True when any consumed client document has not been approved by the client. */
  simulation_flag: z.boolean(),
})

export const planAngleSchema = z.object({
  tool: z.string().min(1),
  steps: z.array(z.string().min(1)),
  /** `creative_proposal` — never presented as the company's process. */
  status: z.string().min(1),
  example: z.object({ text: z.string().min(1), status: z.string().min(1) }).nullable(),
})

export const planTopicSchema = z.object({
  topic_id: z.string().min(1),
  day: z.number().int().min(1).max(30),
  pillar_id: z.string().min(1),
  audience_question: z.string().min(1),
  topic: z.string().min(1),
  main_message: z.string().min(1),
  format: z.string().min(1),
  angle: planAngleSchema,
  claim_ids: ids,
  seed_ids: ids,
  fact_ids: ids,
  proof_ids: ids,
  source_ids: ids,
  /** The short supporting content itself, so the post instruction does not reopen pages. */
  evidence_excerpt: z.string().min(1),
  evidence_limits: z.string().min(1),
  post_goal: z.string().min(1),
  cta: z.string().min(1),
  cta_type: z.enum(ctaTypes),
  readiness: z.enum(readiness),
  readiness_scope: z.string().min(1),
  evidence_reuse_note: z.string().nullable(),
})
export type PlanTopic = z.infer<typeof planTopicSchema>

export const planBalanceSchema = z.object({
  pillar_counts: z.record(z.string(), z.number().int().min(0)),
  need_stages: z.string().min(1),
  distinctness: z.string().min(1),
  evidence_diversity: z.string().min(1),
})

export const planRecommendationSchema = z.object({
  topic_id: z.string().min(1),
  reason: z.string().min(1),
  evidence_available: z.array(z.string().min(1)),
  role: z.string().min(1),
  readiness: z.enum(readiness),
})

export const selectedTopicSchema = z.object({
  topic_id: z.string().nullable(),
  status: z.enum(selectionStatuses),
  decision_id: z.string().nullable(),
  decision_version: z.string().nullable(),
  decision_text: z.string().nullable(),
  /** True only when a real client approval record backs the selection — never set by this lane. */
  real_approval: z.boolean(),
})

export const planDataSchema = z.object({
  plan_context: planContextSchema,
  topics: z.array(planTopicSchema),
  balance: planBalanceSchema,
  recommendation: planRecommendationSchema,
  selected_topic: selectedTopicSchema,
})
export type PlanData = z.infer<typeof planDataSchema>
