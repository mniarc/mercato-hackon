import { z } from 'zod'
import { provenances, readiness } from './zrodla'

/**
 * WEW-USTALENIA (WZR-USTALENIA, process 3.6) — the readiness map for the brief:
 * research turned into proposed brief-field values, client questions (≤ 8 per
 * batch), evidence requests and readiness per downstream result. Provenance,
 * readiness and decision state are separate axes; a ready hypothesis is still a
 * hypothesis.
 */

const ids = z.array(z.string().min(1))

/** The ten KLI-BRIEF fields every MUST row of `field_map` maps to. */
export const briefFieldKeys = [
  'priority_offer',
  'priority_audience',
  'business_direction',
  'buyer_reality',
  'promise_constraints',
  'voice_preferences',
  'channel_and_cta',
  'success_and_limits',
  'assets_and_permissions',
  'open_assumptions',
] as const
export type BriefFieldKey = (typeof briefFieldKeys)[number]

export const decisionStates = ['not_required', 'awaiting_client', 'client_selected', 'simulated_selection'] as const
export const fieldPriorities = ['must', 'should', 'could'] as const
export const knowledgeStatuses = ['fact', 'hypothesis', 'client_decision', 'unknown'] as const

export const fieldMapItemSchema = z.object({
  field_key: z.enum(briefFieldKeys),
  proposed_value: z.string().nullable(),
  evidence_ids: ids,
  provenance: z.enum(provenances),
  readiness: z.enum(readiness),
  decision_state: z.enum(decisionStates),
  priority: z.enum(fieldPriorities),
  reason: z.string().min(1),
  /** fact | hypothesis | client_decision | unknown — the knowledge status of the proposed value. */
  status: z.enum(knowledgeStatuses),
})

export const questionItemSchema = z.object({
  question_id: z.string().min(1),
  /** One decision per question. */
  question: z.string().min(1),
  hint: z.string().min(1),
  reason: z.string().min(1),
  brief_field: z.enum(briefFieldKeys),
  priority: z.enum(fieldPriorities),
  if_unanswered: z.string().min(1),
  /** open | resolved_by_client | deferred_until_real_publication … */
  state: z.string().min(1),
  /** Two equal variants on the same facts when the decision is a choice (never good vs bad). */
  options: z
    .array(z.object({ variant_id: z.string().min(1), label: z.string().min(1), text: z.string().min(1), fact_ids: ids }))
    .optional(),
})

export const evidenceRequestSchema = z.object({
  request_id: z.string().min(1),
  needed: z.string().min(1),
  claim_supported: z.string().min(1),
  without_it: z.string().min(1),
  owner: z.string().min(1),
  status: z.string().min(1),
  priority: z.string().min(1),
})

export const readinessOutputs = ['UVP', 'strategia', 'ToV', 'plan', 'post'] as const

export const readinessItemSchema = z.object({
  output: z.enum(readinessOutputs),
  input_fields: z.array(z.string().min(1)),
  state: z.enum(['ready', 'conditional', 'blocked']),
  missing: z.string().nullable(),
  owner: z.string().min(1),
})

export const researchReturnSchema = z.object({
  question: z.string().min(1),
  source_to_check: z.string().min(1),
  expected_result: z.string().min(1),
  owner_step: z.string().min(1),
  limit: z.string().min(1),
  stop_condition: z.string().min(1),
})

export const ustaleniaDataSchema = z.object({
  field_map: z.array(fieldMapItemSchema),
  questions: z.array(questionItemSchema),
  evidence_requests: z.array(evidenceRequestSchema),
  readiness: z.array(readinessItemSchema),
  research_return: z.array(researchReturnSchema),
})
export type UstaleniaData = z.infer<typeof ustaleniaDataSchema>
