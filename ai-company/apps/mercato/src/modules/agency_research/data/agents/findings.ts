import { z } from 'zod'
import { provenances, readiness } from '../schemas/zrodla'
import { briefFieldKeys, decisionStates, fieldPriorities, knowledgeStatuses, readinessOutputs } from '../schemas/ustalenia'

/**
 * Agent I/O of the findings phase (3.6). Three section-sized researchers over the
 * evidence bank (ids + short text, never page content): the field mapper fills the
 * ten seeded KLI-BRIEF rows, the question writer turns unknowns into ≤ 8 client
 * decisions and evidence requests, the readiness assessor judges the five
 * downstream results. Ids are minted by code; the gate resolves every citation.
 */

const ids = z.array(z.string().min(1))

const findingsOrderSchema = z.object({
  brand: z.string().min(1),
  market: z.string().min(1),
  language: z.string().min(1),
  websiteUrl: z.string().min(1),
  officialSocialUrl: z.string().nullable(),
  purchaseGoal: z.string().nullable(),
})

/** The bank every findings agent reads — the register's ids and one-line texts, the audit's maps, the comparison's conclusions. */
export const findingsBankSchema = z.object({
  order: findingsOrderSchema,
  outputLanguage: z.enum(['pl', 'en']),
  facts: z.array(z.object({ fact_id: z.string(), entity: z.string(), claim: z.string(), kind: z.string(), limitation: z.string().nullable() })),
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), artifact_or_method: z.string().nullable(), observed_result: z.string().nullable(), limitations: z.array(z.string()) })),
  language_samples: z.array(z.object({ sample_id: z.string(), channel: z.string(), excerpt: z.string() })),
  conflicts: z.array(z.object({ conflict_id: z.string(), question: z.string(), state: z.string() })),
  coverage: z.array(z.object({ requirement: z.string(), readiness: z.string(), gap: z.string().nullable(), owner: z.string() })),
  plan_capacity: z.object({ required_topics: z.number(), distinct_count: z.number(), ready_count: z.number(), readiness: z.string() }).nullable(),
  content_bank: z.array(z.object({ seed_id: z.string(), audience_question: z.string(), readiness: z.string() })),
  audit: z.object({
    offer_map: z.array(z.object({ service: z.string(), described_audience: z.string(), problem: z.string(), fact_ids: ids })),
    buyer_map: z.array(z.object({ scenario_id: z.string(), status: z.string(), initiator: z.string(), job: z.string(), objections: z.array(z.string()), fact_ids: ids })),
    message_map: z.array(z.object({ message: z.string(), benefit: z.string(), risk: z.string(), proof_ids: ids, fact_ids: ids })),
    voice_summary: z.string(),
    journey: z.array(z.object({ stage: z.string(), cta: z.string(), destination_status: z.string(), fact_ids: ids })),
    gaps: z.array(z.object({ gap_id: z.string(), observation: z.string(), priority: z.string(), needed: z.string(), destination: z.string(), evidence_ids: ids })),
    reusable_assets: z.array(z.object({ asset: z.string(), value_for_audience: z.string(), proof_ids: ids, seed_ids: ids })),
  }),
  /** null when 3.4/3.5 have not run — the mapper must say so, never invent competitors. */
  competition: z
    .object({
      difference_candidates: z.array(z.object({ candidate_id: z.string(), feature: z.string(), allowed_claim_strength: z.string(), unknown: z.string(), proof_ids: ids })),
      implications: z.array(z.object({ finding: z.string(), strategy_field: z.string(), client_answer_needed: z.string().nullable(), evidence_ids: ids })),
    })
    .nullable(),
})
export type FindingsBank = z.infer<typeof findingsBankSchema>

// ---------------------------------------------------------------------------
// 3.6a — field mapper: the ten seeded KLI-BRIEF rows, filled from evidence
// ---------------------------------------------------------------------------

export const fieldMapperSeedSchema = z.object({
  field_key: z.enum(briefFieldKeys),
  priority: z.enum(fieldPriorities),
  /** What the template says the field must hold (from WZR-BRIEF). */
  field_description: z.string(),
})

export const fieldMapperInputSchema = findingsBankSchema.extend({
  seeded_rows: z.array(fieldMapperSeedSchema),
  repair_findings: z.array(z.object({ path: z.string(), gap: z.string(), fix_hint: z.string().nullable() })),
})
export type FieldMapperInput = z.infer<typeof fieldMapperInputSchema>

export const fieldMapperRowSchema = z.object({
  field_key: z.enum(briefFieldKeys),
  proposed_value: z.string().nullable(),
  evidence_ids: ids,
  provenance: z.enum(provenances),
  readiness: z.enum(readiness),
  decision_state: z.enum(decisionStates),
  reason: z.string().min(1),
  status: z.enum(knowledgeStatuses),
})

export const fieldMapperResult = z.object({
  kind: z.literal('research'),
  data: z.object({ field_map: z.array(fieldMapperRowSchema) }),
})

// ---------------------------------------------------------------------------
// 3.6b — question writer: ≤ 8 client decisions + the smallest useful evidence requests
// ---------------------------------------------------------------------------

export const questionWriterInputSchema = findingsBankSchema.pick({ order: true, outputLanguage: true, coverage: true, plan_capacity: true, conflicts: true }).extend({
  field_map: z.array(fieldMapperRowSchema.extend({ priority: z.enum(fieldPriorities) })),
  audit_gaps: z.array(z.object({ gap_id: z.string(), observation: z.string(), priority: z.string(), needed: z.string(), destination: z.string() })),
  reusable_assets: z.array(z.object({ asset: z.string(), proof_ids: ids, seed_ids: ids })),
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), observed_result: z.string().nullable() })),
  /** Data the client already gave — never asked again. */
  already_known: z.array(z.string()),
  question_batch_max: z.number().int().min(1),
  repair_findings: z.array(z.object({ path: z.string(), gap: z.string(), fix_hint: z.string().nullable() })),
})
export type QuestionWriterInput = z.infer<typeof questionWriterInputSchema>

export const questionWriterResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    questions: z.array(
      z.object({
        question: z.string().min(1),
        hint: z.string().min(1),
        reason: z.string().min(1),
        brief_field: z.enum(briefFieldKeys),
        priority: z.enum(fieldPriorities),
        if_unanswered: z.string().min(1),
        options: z.array(z.object({ variant_id: z.string().min(1), label: z.string().min(1), text: z.string().min(1), fact_ids: ids })).optional(),
      }),
    ),
    evidence_requests: z.array(
      z.object({
        needed: z.string().min(1),
        claim_supported: z.string().min(1),
        without_it: z.string().min(1),
        owner: z.string().min(1),
        priority: z.string().min(1),
        evidence_ids: ids,
      }),
    ),
  }),
})

// ---------------------------------------------------------------------------
// 3.6c — readiness assessor: the five downstream results, judged separately
// ---------------------------------------------------------------------------

export const readinessAssessorInputSchema = findingsBankSchema.pick({ order: true, outputLanguage: true, coverage: true, plan_capacity: true }).extend({
  field_map: z.array(fieldMapperRowSchema.extend({ priority: z.enum(fieldPriorities) })),
  questions: z.array(z.object({ question_id: z.string(), brief_field: z.string(), priority: z.string() })),
  evidence_requests: z.array(z.object({ request_id: z.string(), claim_supported: z.string() })),
  outputs: z.array(z.enum(readinessOutputs)),
  gates: z.array(z.string()),
})
export type ReadinessAssessorInput = z.infer<typeof readinessAssessorInputSchema>

export const readinessAssessorResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    readiness: z.array(
      z.object({
        output: z.enum(readinessOutputs),
        input_fields: z.array(z.string().min(1)),
        state: z.enum(['ready', 'conditional', 'blocked']),
        missing: z.string().nullable(),
        owner: z.string().min(1),
      }),
    ),
    research_return: z.array(
      z.object({
        question: z.string().min(1),
        source_to_check: z.string().min(1),
        expected_result: z.string().min(1),
        owner_step: z.string().min(1),
        limit: z.string().min(1),
        stop_condition: z.string().min(1),
      }),
    ),
  }),
})
