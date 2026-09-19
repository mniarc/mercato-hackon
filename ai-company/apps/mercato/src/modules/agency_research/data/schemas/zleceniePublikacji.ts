import { z } from 'zod'

/**
 * WEW-ZLECENIE-PUBLIKACJI (WZR-ZLECENIE-PUBLIKACJI, process 7.7 / 8.1–8.7) —
 * the publication order: one pinned KLI-POST version by hash, the executable
 * payload snapshot (no rewrite after approval), a durable destination, the two
 * separate decision checks (content approval ≠ publication consent), the
 * idempotent execution guard, the current hold and the preflight. "Prepared"
 * never means "ready to send"; in this lane nothing is sent.
 */

export const decisionCheckStates = ['valid', 'missing', 'stale', 'revoked'] as const

export const postRefSchema = z.object({
  document_ref: z.string().min(1),
  content_version: z.string().min(1),
  /** sha256 of text + links + mentions; any change = new order. */
  content_hash: z.string().min(1),
})

export const publicationPayloadSchema = z.object({
  text: z.string().min(1),
  link_refs: z.array(z.string().min(1)),
  mention_policy: z.string().min(1),
  platform_format: z.string().min(1),
})

export const publicationDestinationSchema = z.object({
  platform: z.string().min(1),
  account_or_workspace_id_or_null: z.string().nullable(),
  channel_or_page_id_or_null: z.string().nullable(),
  display_label: z.string().min(1),
  config_ref_or_null: z.string().nullable(),
})

export const contentApprovalCheckSchema = z.object({
  state: z.enum(decisionCheckStates),
  approval_ref_or_null: z.string().nullable(),
  checked_content_version: z.string().min(1),
})
export type ContentApprovalCheck = z.infer<typeof contentApprovalCheckSchema>

export const publicationConsentCheckSchema = z.object({
  state: z.enum(decisionCheckStates),
  consent_ref_or_null: z.string().nullable(),
  bound_content_hash_or_null: z.string().nullable(),
  bound_destination_or_null: z.string().nullable(),
})
export type PublicationConsentCheck = z.infer<typeof publicationConsentCheckSchema>

export const executionGuardSchema = z.object({
  /** order + publication task + content version + destination. */
  idempotency_key: z.string().min(1),
  reservation_state: z.enum(['none', 'reserved', 'confirmed', 'unknown', 'released']),
  attempt_refs: z.array(z.string().min(1)),
  prior_outcome: z.enum(['none', 'not_executed', 'confirmed_published', 'confirmed_not_sent', 'unknown']),
})

export const currentHoldSchema = z.object({
  state: z.enum(['none', 'client_hold', 'pending_change', 'exception']),
  reason_or_null: z.string().nullable(),
  request_ref_or_null: z.string().nullable(),
})

export const preflightGates = ['scope', 'version', 'content_approval', 'publication_consent', 'destination', 'access', 'format', 'no_hold', 'no_pending_attempt'] as const

export const preflightCheckSchema = z.object({
  gate: z.enum(preflightGates),
  result: z.enum(['pass', 'fail', 'unknown']),
  detail: z.string().nullable(),
})
export type PreflightCheck = z.infer<typeof preflightCheckSchema>

export const preflightSchema = z.object({
  state: z.enum(['ready', 'not_ready', 'not_run']),
  check_results: z.array(preflightCheckSchema),
  checked_at_or_null: z.string().nullable(),
})

export const deliveryInstructionSchema = z.object({
  mode: z.literal('immediate_after_valid_gates'),
  requested_time_or_null: z.string().nullable(),
})

export const zleceniePublikacjiDataSchema = z.object({
  post_ref: postRefSchema,
  payload: publicationPayloadSchema,
  destination: publicationDestinationSchema,
  content_approval_check: contentApprovalCheckSchema,
  publication_consent_check: publicationConsentCheckSchema,
  execution_guard: executionGuardSchema,
  current_hold: currentHoldSchema,
  preflight: preflightSchema,
  delivery_instruction: deliveryInstructionSchema,
})
export type ZleceniePublikacjiData = z.infer<typeof zleceniePublikacjiDataSchema>
