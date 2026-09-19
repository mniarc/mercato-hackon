import { z } from 'zod'
import { briefKnowledgeStatuses } from '../schemas/brief'
import { qaFindingSchema, briefQaVerdicts } from '../schemas/qa'
import { provenances, readiness } from '../schemas/zrodla'
import { briefFieldKeys, decisionStates, fieldPriorities, knowledgeStatuses } from '../schemas/ustalenia'

/**
 * Agent input/result schemas of the brief phase (4.1 writer in three section
 * calls, 4.2 QA). Sections, not documents; ids from the input only; the envelope,
 * decision states, permissions and open assumptions are set by code.
 */

const ids = z.array(z.string().min(1))
const outputLanguage = z.enum(['pl', 'en'])

const briefOrderContextSchema = z.object({
  brand: z.string().min(1),
  market: z.string().min(1),
  language: z.string().min(1),
  websiteUrl: z.string().min(1),
  purchaseGoal: z.string().nullable(),
  sku: z.string().min(1),
})

/** What every writer call reads: the findings map plus compact evidence — never page text. */
export const briefWriterInputSchema = z.object({
  order: briefOrderContextSchema,
  outputLanguage,
  /** Which of the three section groups this call writes. */
  section: z.enum(['offer_audience_direction', 'promise_voice', 'channel_success_assets']),
  field_map: z.array(
    z.object({
      field_key: z.enum(briefFieldKeys),
      proposed_value: z.string().nullable(),
      evidence_ids: ids,
      provenance: z.enum(provenances),
      readiness: z.enum(readiness),
      decision_state: z.enum(decisionStates),
      priority: z.enum(fieldPriorities),
      status: z.enum(knowledgeStatuses),
      reason: z.string(),
    }),
  ),
  questions: z.array(z.object({ question_id: z.string(), question: z.string(), brief_field: z.enum(briefFieldKeys), priority: z.enum(fieldPriorities), state: z.string() })),
  facts: z.array(z.object({ fact_id: z.string(), entity: z.string(), claim: z.string(), kind: z.string(), limitation: z.string().nullable() })),
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), artifact_or_method: z.string().nullable(), observed_result: z.string().nullable(), limitations: z.array(z.string()) })),
  language_samples: z.array(z.object({ sample_id: z.string(), channel: z.string(), excerpt: z.string(), linguistic_features: z.array(z.string()) })),
  offer_map: z.array(z.object({ service: z.string(), described_audience: z.string(), problem: z.string(), mechanism: z.string(), limits: z.string(), fact_ids: ids })),
  buyer_map: z.array(z.object({ scenario_id: z.string(), status: z.string(), initiator: z.string(), job: z.string(), objections: z.array(z.string()), fact_ids: ids })),
  voice_audit_summary: z.string(),
  journey: z.array(z.object({ stage: z.string(), material: z.string(), cta: z.string(), destination_status: z.string(), fact_ids: ids })),
  sources: z.array(z.object({ source_id: z.string(), url: z.string(), kind: z.string(), source_visibility: z.string() })),
  /** QA findings addressed to this step on a repair pass. */
  repair_findings: z.array(qaFindingSchema),
})
export type BriefWriterInput = z.infer<typeof briefWriterInputSchema>

// (a) priority_offer, priority_audience, business_direction
export const briefOfferSectionSchema = z.object({
  priority_offer: z.object({
    value: z.string().min(1),
    result_for_audience: z.string().min(1),
    excluded_from_scope: z.array(z.string().min(1)),
    fact_ids: ids,
  }),
  priority_audience: z.object({
    value: z.string().min(1),
    segment: z.string().min(1),
    target_role: z.array(z.string().min(1)),
    buyer_claims: z.array(
      z.object({
        component: z.enum(['purchase_situation', 'job', 'selection_criteria', 'objection']),
        value: z.string().nullable(),
        knowledge_status: z.enum(briefKnowledgeStatuses),
        evidence_ids: ids,
        allowed_use: z.string().min(1),
      }),
    ),
    secondary_groups: z.string().nullable(),
    fact_ids: ids,
  }),
  business_direction: z.object({
    value: z.string().min(1),
    from_to: z.string().min(1),
    horizon: z.string().nullable(),
    baseline: z.string().nullable(),
    communication_role: z.string().min(1),
    not_promised: z.array(z.string().min(1)),
    fact_ids: ids,
  }),
})
export const briefOfferSectionResult = z.object({ kind: z.literal('research'), data: briefOfferSectionSchema })

// (b) promise_constraints, voice_preferences
export const briefPromiseVoiceSectionSchema = z.object({
  promise_constraints: z.object({
    capabilities: z.string().min(1),
    result_limits: z.string().min(1),
    prohibited_claims: z.array(z.string().min(1)),
    allowed_proof_ids: ids,
    fact_ids: ids,
  }),
  voice_preferences: z.object({
    desired_traits: z.array(z.string().min(1)),
    unwanted_traits: z.array(z.string().min(1)),
    style_preferences: z.object({ jargon: z.string().nullable(), humor: z.string().nullable(), formalness: z.string().nullable() }),
    /** Exactly two equally valid variants on the same facts. */
    proposed_examples: z.array(z.object({ variant_id: z.string().min(1), label: z.string().min(1), text: z.string().min(1), fact_ids: ids })),
    sample_ids: ids,
  }),
})
export const briefPromiseVoiceSectionResult = z.object({ kind: z.literal('research'), data: briefPromiseVoiceSectionSchema })

// (c) channel_and_cta, success_and_limits, assets_and_permissions, buyer_reality
export const briefChannelSectionSchema = z.object({
  channel_and_cta: z.object({
    channel: z.string().min(1),
    audience_context: z.string().min(1),
    cta_goal: z.string().min(1),
    cta_text: z.string().nullable(),
    destination: z.string().nullable(),
    destination_visibility: z.enum(['observed', 'not_observed', 'unknown']),
    destination_functionality: z.enum(['verified', 'failed', 'not_checked']),
    owner: z.string().nullable(),
    limits: z.array(z.string().min(1)),
    fact_ids: ids,
  }),
  success_and_limits: z.object({
    directional_goal: z.string().min(1),
    measurement_proposals: z.array(z.object({ measure: z.string().min(1), definition: z.string().min(1), status: z.string().min(1) })),
    baseline: z.string().nullable(),
    numerical_target: z.string().nullable(),
    scope_limit: z.string().min(1),
  }),
  assets_and_permissions: z.array(z.object({ source_ref: z.string().min(1), supported_claim_ids: ids })),
  buyer_reality: z.array(
    z.object({ situation: z.string().min(1), status: z.string().min(1), relevant_fact_ids: ids, need_for_real_evidence: z.string().nullable() }),
  ),
})
export const briefChannelSectionResult = z.object({ kind: z.literal('research'), data: briefChannelSectionSchema })

// 4.2 — brief QA
export const briefQaInputSchema = z.object({
  order: briefOrderContextSchema,
  outputLanguage,
  brief: z.unknown(),
  field_map: briefWriterInputSchema.shape.field_map,
  readiness: z.array(z.object({ output: z.string(), state: z.string(), missing: z.string().nullable(), owner: z.string() })),
  validator_findings: z.array(qaFindingSchema),
  criteria: z.array(z.string().min(1)),
})
export const briefQaAgentResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    verdict: z.enum(briefQaVerdicts),
    findings: z.array(qaFindingSchema),
    summary: z.string().min(1),
  }),
})
export type BriefQaAgentData = z.infer<typeof briefQaAgentResult>['data']

/**
 * One result shape for all three writer calls: every section key optional, the
 * pipeline requires the keys of the requested section. A flat object keeps
 * provider-side structured output reliable (no top-level union).
 */
export const briefWriterSectionsSchema = z.object({
  ...briefOfferSectionSchema.partial().shape,
  ...briefPromiseVoiceSectionSchema.partial().shape,
  ...briefChannelSectionSchema.partial().shape,
})
export type BriefWriterSections = z.infer<typeof briefWriterSectionsSchema>
export const briefWriterResult = z.object({ kind: z.literal('research'), data: briefWriterSectionsSchema })
