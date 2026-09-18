import { z } from 'zod'
import {
  factKinds,
  proofTypes,
  readiness,
  coverageOwners,
  coverageRequirements,
  businessProfileSchema,
} from './schemas/zrodla'
import { qaResultSchema } from './schemas/qa'

/**
 * Agent inputs and results. Every agent is a RESEARCHER (`{ kind: 'research', data }`)
 * that reads one bounded input and returns one SECTION of a document — never the
 * document, never the envelope. Sections stay small (≤4 arrays, ≤12 leaf fields per
 * item, `local_ref`/ids only) so provider-side structured output keeps working; the
 * pipeline (`lib/research/pipeline.ts`) assembles documents, mints ids and gates.
 *
 * Bounds (counts, lengths) are targets in the prompts, not `.max()` here: providers
 * do not honour JSON-schema maxItems and a hard max rejects an otherwise good answer.
 */

export * from './schemas/envelope'
export * from './schemas/zamowienie'
export * from './schemas/zrodla'
export * from './schemas/qa'

export const outputLanguages = ['pl', 'en'] as const
export type OutputLanguage = (typeof outputLanguages)[number]

const orderContextSchema = z.object({
  brand: z.string().min(1),
  market: z.string().min(1),
  language: z.string().min(1),
  websiteUrl: z.string().min(1),
  purchaseGoal: z.string().nullable(),
})

// ---------------------------------------------------------------------------
// 3.2 map — page extractor: one page (or chunk) in, its evidence out
// ---------------------------------------------------------------------------

export const pageExtractorInputSchema = z.object({
  order: orderContextSchema,
  /** `client` for the brand's own material, else the competitor name. */
  entity: z.string().min(1),
  page: z.object({
    source_id: z.string().min(1),
    url: z.string().min(1),
    publisher: z.string().min(1),
    channel: z.string().min(1),
    origin: z.string().min(1),
    chunk: z.object({ index: z.number().int().min(0), total: z.number().int().min(1) }),
    content_md: z.string().min(1),
  }),
  outputLanguage: z.enum(outputLanguages),
})
export type PageExtractorInput = z.infer<typeof pageExtractorInputSchema>

export const extractedFactSchema = z.object({
  local_ref: z.string().min(1),
  claim: z.string().min(1),
  /** Verbatim run of ≥ 5 words copied from the page; the gate drops paraphrases. */
  quote: z.string().min(1),
  kind: z.enum(factKinds),
  use_scope: z.array(z.string().min(1)),
  limitation: z.string().nullable(),
})

export const extractedSampleSchema = z.object({
  local_ref: z.string().min(1),
  /** Verbatim, ≤ 40 words, in the source language. */
  excerpt: z.string().min(1),
  situation: z.string().nullable(),
  suggested_audience: z.string().nullable(),
  linguistic_features: z.array(z.string().min(1)),
  observed_function: z.string().nullable(),
})

export const extractedSignalSchema = z.object({
  local_ref: z.string().min(1),
  role_or_organization: z.string().min(1),
  trigger: z.string().min(1),
  problem: z.string().min(1),
  risk: z.string().nullable(),
  objection: z.string().nullable(),
  evidence_status: z.string().min(1),
  fact_refs: z.array(z.string().min(1)),
})

export const pageExtractionSchema = z.object({
  facts: z.array(extractedFactSchema),
  language_samples: z.array(extractedSampleSchema),
  audience_signals: z.array(extractedSignalSchema),
  /** One or two sentences: what this page is and what it is not. */
  page_summary: z.string().min(1),
})
export type PageExtraction = z.infer<typeof pageExtractionSchema>

export const pageExtractorResult = z.object({ kind: z.literal('research'), data: pageExtractionSchema })

// ---------------------------------------------------------------------------
// 3.2 reduce — the four synthesis sections over the fact bank
// ---------------------------------------------------------------------------

/** What every reduce agent gets: the bank with final ids, never page text. */
export const factBankInputSchema = z.object({
  order: orderContextSchema,
  outputLanguage: z.enum(outputLanguages),
  sources: z.array(
    z.object({ source_id: z.string(), publisher: z.string(), kind: z.string(), url: z.string(), access: z.string(), retrieved_at: z.string() }),
  ),
  facts: z.array(
    z.object({ fact_id: z.string(), entity: z.string(), claim: z.string(), kind: z.enum(factKinds), source_ids: z.array(z.string()), limitation: z.string().nullable() }),
  ),
  language_samples: z.array(z.object({ sample_id: z.string(), source_id: z.string(), channel: z.string(), excerpt: z.string() })),
  audience_signals: z.array(z.object({ signal_id: z.string(), role_or_organization: z.string(), problem: z.string(), evidence_status: z.string(), fact_ids: z.array(z.string()) })),
})
export type FactBankInput = z.infer<typeof factBankInputSchema>

export const proofBuilderInputSchema = factBankInputSchema
export const proofBuilderResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    proof_cards: z.array(
      z.object({
        proof_type: z.enum(proofTypes),
        problem: z.string().nullable(),
        actual_action: z.string().nullable(),
        artifact_or_method: z.string().nullable(),
        observed_result: z.string().nullable(),
        fact_ids: z.array(z.string().min(1)),
        limitations: z.array(z.string().min(1)),
      }),
    ),
    business_profile: businessProfileSchema,
  }),
})

export const contentSeederInputSchema = factBankInputSchema.extend({
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), artifact_or_method: z.string().nullable(), fact_ids: z.array(z.string()) })),
  requiredTopics: z.number().int().min(1),
})
export const contentSeederResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    content_bank: z.array(
      z.object({
        audience_question: z.string().min(1),
        angle: z.string().min(1),
        source_claim: z.string().min(1),
        source_claim_fact_ids: z.array(z.string().min(1)),
        proposed_utility: z.string().min(1),
        proof_ids: z.array(z.string().min(1)),
        prohibited_claims: z.array(z.string().min(1)),
        readiness: z.enum(readiness),
        readiness_reason: z.string().nullable(),
      }),
    ),
  }),
})

export const conflictFinderInputSchema = factBankInputSchema.pick({ order: true, outputLanguage: true, facts: true, sources: true })
export const conflictFinderResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    conflicts: z.array(
      z.object({
        fact_ids: z.array(z.string().min(1)),
        detail: z.string().min(1),
        impact: z.string().min(1),
        question: z.string().min(1),
        state: z.string().min(1),
      }),
    ),
  }),
})

export const coverageAssessorInputSchema = factBankInputSchema.extend({
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), fact_ids: z.array(z.string()) })),
  content_bank: z.array(z.object({ seed_id: z.string(), audience_question: z.string(), readiness: z.string() })),
  conflicts: z.array(z.object({ conflict_id: z.string(), state: z.string() })),
  requirements: z.array(z.enum(coverageRequirements)),
})
export const coverageAssessorResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    coverage: z.array(
      z.object({
        requirement: z.enum(coverageRequirements),
        readiness: z.enum(readiness),
        evidence_ids: z.array(z.string().min(1)),
        gap: z.string().nullable(),
        owner: z.enum(coverageOwners),
      }),
    ),
  }),
})

// ---------------------------------------------------------------------------
// 3.7 — analysis QA over the finished documents plus the validator's findings
// ---------------------------------------------------------------------------

export const researchQaInputSchema = z.object({
  order: orderContextSchema,
  outputLanguage: z.enum(outputLanguages),
  /** template output id → the document's `data`, ids only where text is long. */
  documents: z.record(z.string(), z.unknown()),
  validator_findings: z.array(z.unknown()),
  criteria: z.array(z.string().min(1)),
})
export const researchQaResult = z.object({ kind: z.literal('research'), data: qaResultSchema })
