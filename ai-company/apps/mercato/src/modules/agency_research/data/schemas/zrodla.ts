import { z } from 'zod'

/**
 * WEW-ZRODLA (WZR-ZRODLA, process 3.2) — the source register, fact bank and
 * material for communication. Field names are Rafał's v1.1 contract verbatim.
 * "Przekazać treść dowodów, a nie samą listę linków" — a later agent must be
 * able to write strategy and posts without reopening the pages.
 *
 * Everything with an id is minted in code; every fact/sample carries a verbatim
 * quote the gate checks against the stored page text.
 */

export const sourceAccess = ['full', 'partial', 'unavailable'] as const
export const sourceVisibility = ['public', 'client_private', 'unknown'] as const
export const sourceOrigins = ['purchase_form', 'agent', 'client', 'corpus'] as const
export const factKinds = ['observed', 'first_party_claim', 'case_evidence'] as const
export const proofTypes = ['declaration', 'observed_artifact', 'measured_case', 'external_confirmation'] as const
export const provenances = ['observed', 'inferred', 'client_answer', 'synthetic', 'creative_proposal'] as const
export const readiness = ['pending', 'ready', 'conditional', 'blocked'] as const
export const permissionStates = ['granted', 'denied', 'unknown', 'not_applicable'] as const
export const allowedUses = ['internal_only', 'client_review', 'public_with_attribution', 'public'] as const
export const coverageRequirements = ['segment', 'problem', 'zakup', 'oferta', 'mechanizm', 'dowód', 'alternatywy', 'język', 'CTA'] as const
export const coverageOwners = ['research', 'klient', 'agencja', 'none'] as const

const ids = z.array(z.string().min(1))

export const sourceSchema = z.object({
  source_id: z.string().min(1),
  canonical_source_id: z.string().min(1),
  /** null for an access attempt that yielded no material. */
  independent_material_id: z.string().nullable(),
  url_or_file: z.string().min(1),
  publisher: z.string().min(1),
  /** Free text per Rafał: "oficjalna strona", "oficjalny kanał publiczny", "access_attempt", … */
  kind: z.string().min(1),
  title: z.string().nullable(),
  retrieved_at: z.string().min(1),
  published_at: z.string().nullable(),
  access: z.enum(sourceAccess),
  /** What was actually read: chars, truncation, which section. */
  read_scope: z.string().min(1),
  limitation: z.string().nullable(),
  source_visibility: z.enum(sourceVisibility),
  duplicate_of: z.string().nullable(),
  origin: z.enum(sourceOrigins),
})
export type Source = z.infer<typeof sourceSchema>

export const locatorSchema = z.object({
  source_id: z.string().min(1),
  /** Verbatim run of words from the source; the gate re-checks it against the stored text. */
  quote: z.string().min(1),
  char_offset: z.number().int().min(0).nullable(),
})

export const factSchema = z.object({
  fact_id: z.string().min(1),
  /** Whose claim it is: the client brand or a competitor name. */
  entity: z.string().min(1),
  claim: z.string().min(1),
  source_ids: ids.min(1),
  locator: locatorSchema,
  paraphrase: z.string().min(1),
  kind: z.enum(factKinds),
  use_scope: z.array(z.string().min(1)),
  limitation: z.string().nullable(),
})
export type Fact = z.infer<typeof factSchema>

export const proofCardSchema = z.object({
  proof_id: z.string().min(1),
  proof_type: z.enum(proofTypes),
  problem: z.string().nullable(),
  actual_action: z.string().nullable(),
  artifact_or_method: z.string().nullable(),
  observed_result: z.string().nullable(),
  fact_ids: ids.min(1),
  source_ids: ids,
  limitations: z.array(z.string().min(1)),
  source_visibility: z.enum(sourceVisibility),
  allowed_use: z.enum(allowedUses),
  use_basis_ref: z.string().nullable(),
  client_name_permission: z.enum(permissionStates),
  quote_permission: z.enum(permissionStates),
  provenance: z.enum(provenances),
})
export type ProofCard = z.infer<typeof proofCardSchema>

export const languageSampleSchema = z.object({
  sample_id: z.string().min(1),
  independent_material_id: z.string().min(1),
  canonical_source_id: z.string().min(1),
  source_id: z.string().min(1),
  /** Verbatim; the gate re-checks it. */
  excerpt_or_paraphrase: z.string().min(1),
  channel: z.string().min(1),
  suggested_audience: z.string().nullable(),
  situation: z.string().nullable(),
  linguistic_features: z.array(z.string().min(1)),
  observed_function: z.string().nullable(),
  sample_limit: z.string().min(1),
})
export type LanguageSample = z.infer<typeof languageSampleSchema>

export const audienceSignalSchema = z.object({
  signal_id: z.string().min(1),
  role_or_organization: z.string().min(1),
  trigger: z.string().min(1),
  problem: z.string().min(1),
  risk: z.string().nullable(),
  objection: z.string().nullable(),
  /** e.g. customer_voice | supplier_interpretation_not_customer_voice | hypothesis */
  evidence_status: z.string().min(1),
  fact_ids: ids,
})
export type AudienceSignal = z.infer<typeof audienceSignalSchema>

export const contentSeedSchema = z.object({
  seed_id: z.string().min(1),
  audience_question: z.string().min(1),
  angle: z.string().min(1),
  /** The exact supported content with its limitation — evidence, not opinion. */
  source_claim: z.object({
    text: z.string().min(1),
    fact_ids: ids,
    source_ids: ids,
    provenance: z.enum(provenances),
  }),
  /** An analytical or creative explanation, checklist or question — explicitly authored. */
  proposed_utility: z.object({
    text: z.string().min(1),
    provenance: z.literal('creative_proposal'),
  }),
  fact_ids: ids,
  proof_ids: ids,
  provenance: z.enum(provenances),
  reuse_of_evidence: z.object({
    note: z.string().nullable(),
    shared_fact_ids: ids,
    shared_proof_ids: ids,
  }),
  prohibited_claims: z.array(z.string().min(1)),
  readiness: z.enum(readiness),
  readiness_reason: z.string().nullable(),
})
export type ContentSeed = z.infer<typeof contentSeedSchema>

export const conflictSchema = z.object({
  conflict_id: z.string().min(1),
  facts: ids.min(2),
  dates: z.array(z.string()),
  detail: z.string().min(1),
  impact: z.string().min(1),
  question: z.string().min(1),
  /** unresolved_real_decision | resolved_* | framing_difference … */
  state: z.string().min(1),
})
export type Conflict = z.infer<typeof conflictSchema>

export const requirementCoverageSchema = z.object({
  item_type: z.literal('requirement_coverage'),
  requirement: z.enum(coverageRequirements),
  readiness: z.enum(readiness),
  evidence_ids: ids,
  gap: z.string().nullable(),
  owner: z.enum(coverageOwners),
})

export const supportedAngleSchema = z.object({
  angle_id: z.string().min(1),
  audience_question: z.string().min(1),
  distinct_value: z.string().min(1),
  seed_ids: ids.min(1),
  fact_ids: ids,
  proof_ids: ids,
  readiness: z.enum(readiness),
})

export const planCapacitySchema = z.object({
  item_type: z.literal('plan_capacity'),
  required_topics: z.number().int().min(1),
  supported_angles: z.array(supportedAngleSchema),
  distinct_count: z.number().int().min(0),
  ready_count: z.number().int().min(0),
  unsupported_angles: ids,
  readiness: z.enum(readiness),
})

export const coverageItemSchema = z.discriminatedUnion('item_type', [requirementCoverageSchema, planCapacitySchema])
export type CoverageItem = z.infer<typeof coverageItemSchema>

export const zrodlaDataSchema = z.object({
  sources: z.array(sourceSchema),
  facts: z.array(factSchema),
  proof_cards: z.array(proofCardSchema),
  language_samples: z.array(languageSampleSchema),
  audience_signals: z.array(audienceSignalSchema),
  content_bank: z.array(contentSeedSchema),
  conflicts: z.array(conflictSchema),
  coverage: z.array(coverageItemSchema),
})
export type ZrodlaData = z.infer<typeof zrodlaDataSchema>

/** O-3.2 — the preliminary business profile 3.3 and 3.4 start from; a step output, not a document field. */
export const businessProfileSchema = z.object({
  category: z.string().min(1),
  offer_summary: z.string().min(1),
  audience_hint: z.string().min(1),
  market_hint: z.string().min(1),
  /** Ids of the facts the profile rests on. */
  fact_ids: ids,
})
export type BusinessProfile = z.infer<typeof businessProfileSchema>
