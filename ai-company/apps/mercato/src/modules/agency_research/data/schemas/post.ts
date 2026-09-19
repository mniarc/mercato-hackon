import { z } from 'zod'

/**
 * KLI-POST (WZR-POST, process 7.2) — the finished post with its internal
 * justification: the text, the exact target (channel, adapter version, format),
 * a claims map covering every checkable promise, links/mentions with their
 * verification state, a ≤80-word client note and the QA block. The author's
 * self-check is a proposal; a separate editor (Q-T) verifies before the client.
 * Version approval and publication consent stay separate envelope records.
 */

const ids = z.array(z.string().min(1))

export const postTargetSchema = z.object({
  channel: z.string().min(1),
  language: z.string().min(1),
  market: z.string().min(1),
  format: z.literal('text'),
  finished_post_count: z.number().int().min(1),
  adapter_id: z.string().nullable(),
  adapter_version: z.string().nullable(),
  /** From the adapter catalog; null = unknown, never a remembered number. */
  platform_character_limit: z.number().int().nullable(),
  platform_limit_status: z.enum(['known', 'unverified']),
  target_account_id: z.string().nullable(),
  publication_status: z.enum(['not_requested', 'blocked_simulation', 'awaiting_consent', 'consented']),
  publication_allowed: z.boolean(),
})

export const claimMapRowSchema = z.object({
  id: z.string().min(1),
  /** Verbatim fragment of `text` (gate checks it is a substring). */
  fragment: z.string().min(1),
  claim_id: z.string().nullable(),
  fact_ids: ids,
  creative_payload_ids: ids,
  kind: z.enum(['fact', 'hypothesis', 'creative_example', 'first_party_claim', 'reader_address']),
  evidence_kind: z.enum(['source_claim', 'creative_proposal', 'none']),
  source_ids: ids,
  limitation: z.string().min(1),
  used_within_evidence: z.boolean(),
  source_relationship: z.string().min(1),
})

export const linkOrMentionSchema = z.object({
  type: z.enum(['link', 'mention']),
  value: z.string().min(1),
  purpose: z.string().min(1),
  owner: z.string().nullable(),
  contact_owner: z.string().nullable(),
  /** e.g. `observed_in_frozen_input`; code fills from the instruction's allowed links. */
  verification_status: z.string().min(1),
  operational_status: z.enum(['verified', 'failed', 'not_tested']),
  opened_during_authoring: z.literal(false),
  claim_id: z.string().nullable(),
  fact_id: z.string().nullable(),
  source_id: z.string().nullable(),
})

export const copyCheckResultSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  result: z.enum(['pass', 'fail', 'not_applicable']),
  evidence: z.string().min(1),
})

export const postMetricsSchema = z.object({
  word_count: z.number().int().min(0),
  word_count_rule: z.string().min(1),
  character_count_with_spaces_and_newlines: z.number().int().min(0),
  character_count_without_whitespace: z.number().int().min(0),
  line_break_count: z.number().int().min(0),
  words_target: z.tuple([z.number().int(), z.number().int()]),
  within_internal_word_target: z.boolean(),
  client_note_word_count: z.number().int().min(0),
  client_note_max_words: z.number().int().min(1),
  platform_character_limit: z.number().int().nullable(),
  platform_limit_compliance: z.enum(['within_limit', 'over_limit', 'unverified']),
})

export const editorFindingSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['blocker', 'major', 'minor']),
  fragment: z.string().nullable(),
  issue: z.string().min(1),
  fix_hint: z.string().min(1),
})

export const editorReviewSchema = z.object({
  reviewer: z.string().min(1),
  review_type: z.string().min(1),
  result: z.enum(['pass_for_draft', 'needs_fix', 'reject']),
  checked: z.array(z.string().min(1)),
  not_verified: z.array(z.string().min(1)),
  findings: z.array(editorFindingSchema),
  new_research: z.literal(0),
  is_client_approval: z.literal(false),
})

export const postQaSchema = z.object({
  review_type: z.string().min(1),
  status: z.string().min(1),
  is_independent_review: z.boolean(),
  /** null until the editor (Q-T) has run. */
  independent_editor_review: editorReviewSchema.nullable(),
  copy_checks: z.array(copyCheckResultSchema),
  metrics: postMetricsSchema,
  instruction_alignment: z.string().min(1),
  factual_scope: z.string().min(1),
  tone_of_voice: z.string().min(1),
  format: z.string().min(1),
  links: z.string().min(1),
  /** The author's deslop report (skill `.ai/skills/deslop`): profile written against, patterns removed, conflicts resolved. */
  style_hygiene: z.string().min(1).default('—'),
  unsupported_facts_added: z.number().int().min(0),
  additional_sources_used: z.literal(0),
  additional_research_performed: z.literal(0),
  corrections_applied: z.array(z.string()),
  corrections_note: z.string().nullable(),
  evidence_limitations: z.array(z.string().min(1)),
  publication_gate: z.enum(['blocked', 'awaiting_consent', 'open']),
  real_approval_recorded: z.literal(false),
  author_review_version: z.string().min(1),
})

export const postDataSchema = z.object({
  text: z.string().min(1),
  target: postTargetSchema,
  claims_map: z.array(claimMapRowSchema),
  links_and_mentions: z.array(linkOrMentionSchema),
  client_note: z.string().min(1),
  qa: postQaSchema,
})
export type PostData = z.infer<typeof postDataSchema>
