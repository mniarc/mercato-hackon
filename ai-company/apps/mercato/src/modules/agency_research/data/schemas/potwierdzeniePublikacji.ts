import { z } from 'zod'

/**
 * WEW-POTWIERDZENIE-PUBLIKACJI (WZR-POTWIERDZENIE-PUBLIKACJI, process 8.5–8.7) —
 * the outcome record of exactly one publication attempt. `not_executed` is a
 * record of what is missing, not a proof of publication; `unknown` (timeout,
 * dropped socket) forbids automatic retry and closure; the external id and URL
 * are never synthesised — null until a real platform response exists.
 */

export const publicationOutcomes = ['not_executed', 'confirmed_published', 'confirmed_not_sent', 'unknown'] as const

export const executionRefSchema = z.object({
  publication_order_ref: z.string().min(1),
  attempt_id_or_null: z.string().nullable(),
  reservation_key_or_null: z.string().nullable(),
})

export const approvedMaterialRefSchema = z.object({
  post_ref: z.string().min(1),
  content_version: z.string().nullable(),
  content_hash: z.string().nullable(),
  content_approval_ref_or_null: z.string().nullable(),
  publication_consent_ref_or_null: z.string().nullable(),
})

export const confirmationDestinationSchema = z.object({
  platform: z.string().min(1),
  account_or_workspace_id_or_null: z.string().nullable(),
  channel_or_page_id_or_null: z.string().nullable(),
})

export const externalArtifactSchema = z.object({
  external_post_id_or_null: z.string().nullable(),
  verified_url_or_null: z.string().nullable(),
  published_at_or_null: z.string().nullable(),
})

export const proofSchema = z.object({
  method: z.enum(['provider_confirmation', 'state_reconciliation', 'none']),
  evidence_ref_or_null: z.string().nullable(),
  verified_at_or_null: z.string().nullable(),
  content_match_state: z.enum(['matched', 'mismatched', 'not_checked']),
})

export const failureDetailsSchema = z.object({
  code_or_null: z.string().nullable(),
  sanitized_message_or_null: z.string().nullable(),
  evidence_ref_or_null: z.string().nullable(),
})

export const recoverySchema = z.object({
  next_action: z.enum(['none', 'reconcile', 'retry_after_known_no_send', 'obtain_missing_gates', 'human_review']),
  retry_allowed: z.boolean(),
  required_evidence: z.string().min(1),
  exception_ref_or_null: z.string().nullable(),
})

export const potwierdzeniePublikacjiDataSchema = z.object({
  execution_ref: executionRefSchema,
  approved_material_ref: approvedMaterialRefSchema,
  destination: confirmationDestinationSchema,
  outcome: z.enum(publicationOutcomes),
  external_artifact: externalArtifactSchema,
  proof: proofSchema,
  failure_details: failureDetailsSchema,
  recovery: recoverySchema,
  /** ≤350 characters, only after a confirmed success; null before. */
  client_receipt: z.string().max(350).nullable(),
})
export type PotwierdzeniePublikacjiData = z.infer<typeof potwierdzeniePublikacjiDataSchema>
