import { z } from 'zod'
import { allowedUses, permissionStates, provenances, sourceVisibility } from './zrodla'

/**
 * WEW-ZLECENIE-POSTU (WZR-ZLECENIE-POSTU, process 6.7) — the self-contained
 * instruction for an ISOLATED author and editor: the selected topic, the full
 * evidence payload (texts, not ids), the reader value, a ≤5-rule voice extract,
 * delivery constraints from a versioned adapter catalog, and the completion
 * checklist. The author gets this and the pinned ToV — nothing else, no network.
 */

const ids = z.array(z.string().min(1))

export const selectedItemSchema = z.object({
  topic_id: z.string().min(1),
  seed_id: z.string().nullable(),
  plan_id: z.string().min(1),
  plan_version: z.string().min(1),
  selection_status: z.enum(['awaiting_client', 'simulated_selection', 'client_selected']),
  decision_id: z.string().nullable(),
  audience: z.string().min(1),
  audience_question: z.string().min(1),
  goal: z.string().min(1),
  main_message: z.string().min(1),
  angle: z.string().min(1),
  task: z.string().min(1),
})

export const rightsAndLimitsSchema = z.object({
  source_visibility: z.enum(sourceVisibility),
  allowed_use: z.enum(allowedUses),
  use_basis_ref: z.array(z.string()),
  client_name_permission: z.enum(permissionStates),
  quote_permission: z.enum(permissionStates),
  publication_approval: z.enum(['missing', 'granted', 'not_applicable']),
})

export const evidenceCardSchema = z.object({
  claim_id: z.string().min(1),
  kind: z.enum(['source_claim', 'creative_proposal']),
  /** The content itself — ids and URLs alone are not enough for an isolated author. */
  text: z.string().min(1),
  fact_id: z.string().nullable(),
  seed_id: z.string().nullable(),
  fact_ids: ids,
  source_ids: ids,
  source_payload: z.array(z.object({ source_id: z.string(), publisher: z.string(), title: z.string().nullable(), url: z.string(), access: z.string(), read_scope: z.string() })),
  limitations: z.array(z.string().min(1)),
  /** What may be copied verbatim vs paraphrased. */
  permitted_copy: z.string().nullable(),
  provenance: z.enum(provenances),
  reuse_of_evidence: z.string().nullable(),
  is_new_independent_source: z.boolean(),
  rights_and_limits: rightsAndLimitsSchema,
})

export const readerValueSchema = z.object({
  type: z.enum(['decision_question', 'mini_checklist', 'perspective', 'explanation']),
  title: z.string().min(1),
  items: z.array(z.string().min(1)),
  /** `creative_proposal` — the utility is authored, not observed. */
  status: z.string().min(1),
  usage: z.string().min(1),
  example_option: z.string().nullable(),
})

export const voiceExtractSchema = z.object({
  tov_id: z.string().min(1),
  tov_version: z.string().min(1),
  rules: z.array(z.string().min(1)),
  forbidden_cliches: z.array(z.string().min(1)),
  short_pattern: z.string().min(1),
})

export const allowedLinkSchema = z.object({
  url: z.string().min(1),
  purpose: z.string().min(1),
  owner: z.string().nullable(),
  visibility_status: z.enum(['observed', 'not_observed', 'unknown']),
  operational_status: z.enum(['verified', 'failed', 'not_checked']),
  contact_owner: z.string().nullable(),
})

export const deliveryConstraintsSchema = z.object({
  channel: z.string().min(1),
  language: z.string().min(1),
  market: z.string().min(1),
  format: z.literal('text'),
  adapter_id: z.string().nullable(),
  adapter_version: z.string().nullable(),
  /** From the versioned adapter catalog; null blocks final format QA (no guessed limit). */
  max_text_length: z.number().int().nullable(),
  length_unit: z.enum(['characters', 'words']).nullable(),
  platform_limit_status: z.enum(['known', 'unknown']),
  product_length_target: z.object({ words: z.tuple([z.number().int(), z.number().int()]), word_count_rule: z.string().min(1) }),
  links: z.array(allowedLinkSchema),
  mentions: z.array(z.string()),
  cta: z.string().nullable(),
  cta_destination: z.string().nullable(),
  cta_draft_readiness: z.enum(['pending', 'ready', 'conditional', 'blocked']),
  cta_publication_readiness: z.enum(['pending', 'ready', 'conditional', 'blocked']),
  prohibited_claims: z.array(z.string().min(1)),
  finished_post_count: z.number().int().min(1),
})

export const zleceniePostuDataSchema = z.object({
  selected_item: selectedItemSchema,
  evidence_payload: z.array(evidenceCardSchema),
  reader_value: readerValueSchema,
  voice_extract: voiceExtractSchema,
  delivery_constraints: deliveryConstraintsSchema,
  /** The full instruction list; must cover editorial, factual, format, no_network, allowed_documents, missing_data_action, independent_reviewer. */
  completion: z.array(z.string().min(1)),
})
export type ZleceniePostuData = z.infer<typeof zleceniePostuDataSchema>

export const completionCategories = ['editorial', 'factual', 'format', 'no_network', 'allowed_documents', 'missing_data_action', 'independent_reviewer'] as const
