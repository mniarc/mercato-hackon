import { z } from 'zod'
import { qaFindingSchema } from '../schemas/qa'
import { deliveryConstraintsSchema, evidenceCardSchema, readerValueSchema, selectedItemSchema, voiceExtractSchema } from '../schemas/zleceniePostu'
import { editorFindingSchema } from '../schemas/post'
import { styleAxisSchema, voicePrincipleSchema, wordingSchema } from '../schemas/tov'

/**
 * Agent input/result schemas of the post phase (7.2 author, 7.3 editor). The
 * author's world is the instruction and the ToV — nothing else, no network; the
 * editor gets the same packet plus the draft. Ids from the input only; the
 * target, metrics, the qa block and the envelope are set by code.
 */

const ids = z.array(z.string().min(1))
const outputLanguage = z.enum(['pl', 'en'])

const postOrderContextSchema = z.object({
  brand: z.string().min(1),
  market: z.string().min(1),
  language: z.string().min(1),
  sku: z.string().min(1),
})

/** The ToV the author writes in: principles, axes, wording and the copy checks — never the whole document. */
const postTovExtractSchema = z.object({
  voice_principles: z.array(voicePrincipleSchema),
  style_axes: z.array(styleAxisSchema),
  wording: wordingSchema,
  evidence_language: z.array(z.object({ type: z.string(), pattern: z.string(), forbidden_upgrade: z.string() })),
  copy_checks: z.array(z.object({ id: z.string().min(1), question: z.string().min(1) })),
})

export const postAuthorInputSchema = z.object({
  order: postOrderContextSchema,
  outputLanguage,
  selected_item: selectedItemSchema,
  evidence_payload: z.array(evidenceCardSchema),
  reader_value: readerValueSchema,
  voice_extract: voiceExtractSchema,
  delivery_constraints: deliveryConstraintsSchema,
  completion: z.array(z.string()),
  tov: postTovExtractSchema,
  /** The previous version's text on a repair pass, so untouched content survives. */
  previous_text: z.string().nullable(),
  /** QA findings addressed to this step on a repair pass. */
  repair_findings: z.array(qaFindingSchema),
})
export type PostAuthorInput = z.infer<typeof postAuthorInputSchema>

export const postClaimKinds = ['fact', 'hypothesis', 'creative_example', 'first_party_claim', 'reader_address'] as const
export const postEvidenceKinds = ['source_claim', 'creative_proposal', 'none'] as const

export const postDraftClaimSchema = z.object({
  local_ref: z.string().min(1),
  /** Verbatim run of the post text; the gate drops rows it cannot find. */
  fragment: z.string().min(1),
  claim_id: z.string().nullable(),
  fact_ids: ids,
  creative_payload_ids: ids,
  kind: z.enum(postClaimKinds),
  evidence_kind: z.enum(postEvidenceKinds),
  source_ids: ids,
  limitation: z.string().min(1),
  used_within_evidence: z.boolean(),
  source_relationship: z.string().min(1),
})

export const postDraftLinkSchema = z.object({
  type: z.enum(['link', 'mention']),
  value: z.string().min(1),
  purpose: z.string().min(1),
  claim_id: z.string().nullable(),
  fact_id: z.string().nullable(),
  source_id: z.string().nullable(),
})

/** An answer to one ToV copy check by its id; the question text is code's. */
export const copyCheckAnswerSchema = z.object({
  id: z.string().min(1),
  result: z.enum(['pass', 'fail', 'not_applicable']),
  evidence: z.string().min(1),
})

export const postSelfCheckSchema = z.object({
  copy_checks: z.array(copyCheckAnswerSchema),
  instruction_alignment: z.string().min(1),
  factual_scope: z.string().min(1),
  tone_of_voice: z.string().min(1),
  format: z.string().min(1),
  links: z.string().min(1),
  evidence_limitations: z.array(z.string().min(1)),
  /** deslop report: profile id/version/status written against, patterns removed, profile-vs-generic conflicts and how resolved. */
  style_hygiene: z.string().min(1).default('—'),
})

export const postDraftSchema = z.object({
  text: z.string().min(1),
  claims_map: z.array(postDraftClaimSchema),
  links_and_mentions: z.array(postDraftLinkSchema),
  client_note: z.string().min(1),
  self_check: postSelfCheckSchema,
})
export type PostDraft = z.infer<typeof postDraftSchema>
export const postAuthorResult = z.object({ kind: z.literal('research'), data: postDraftSchema })

// 7.3 — the independent editor
export const postEditorInputSchema = z.object({
  order: postOrderContextSchema,
  outputLanguage,
  text: z.string().min(1),
  claims_map: z.array(z.object({ id: z.string(), fragment: z.string(), claim_id: z.string().nullable(), fact_ids: ids, kind: z.string(), evidence_kind: z.string(), limitation: z.string() })),
  links_and_mentions: z.array(z.object({ type: z.string(), value: z.string(), purpose: z.string(), operational_status: z.string() })),
  client_note: z.string(),
  selected_item: selectedItemSchema,
  evidence_payload: z.array(z.object({ claim_id: z.string(), kind: z.string(), text: z.string(), fact_ids: ids, limitations: z.array(z.string()), permitted_copy: z.string().nullable() })),
  reader_value: readerValueSchema,
  voice_extract: voiceExtractSchema,
  prohibited_claims: z.array(z.string()),
  allowed_links: z.array(z.string()),
  copy_checks: z.array(z.object({ id: z.string().min(1), question: z.string().min(1) })),
  length: z.object({ words: z.number().int(), words_target: z.tuple([z.number().int(), z.number().int()]), platform_character_limit: z.number().int().nullable(), characters: z.number().int() }),
  validator_findings: z.array(qaFindingSchema),
  criteria: z.array(z.string().min(1)),
})
export type PostEditorInput = z.infer<typeof postEditorInputSchema>

export const postEditorResults = ['pass_for_draft', 'needs_fix', 'reject'] as const

export const postEditorReviewSchema = z.object({
  result: z.enum(postEditorResults),
  checked: z.array(z.string().min(1)),
  not_verified: z.array(z.string().min(1)),
  findings: z.array(editorFindingSchema),
  copy_checks: z.array(copyCheckAnswerSchema),
  summary: z.string().min(1),
})
export type PostEditorReview = z.infer<typeof postEditorReviewSchema>
export const postEditorResult = z.object({ kind: z.literal('research'), data: postEditorReviewSchema })
