import { z } from 'zod'

/**
 * WEW-KONFIG-PUBLIKACJI (WZR-KONFIG-PUBLIKACJI, process 8.2 / 8.4) — the
 * technical publication configuration: platform from the adapter catalog,
 * destination identifiers (a profile name is not an id), brand binding,
 * the secure-connection reference (never a secret), capabilities as checked,
 * connection validation and readiness. Technical access is not consent.
 */

export const tristate = ['true', 'false', 'unknown'] as const

export const konfigPlatformSchema = z.object({
  platform: z.string().min(1),
  adapter_id: z.string().min(1),
  adapter_version: z.string().min(1),
})

export const destinationIdentitySchema = z.object({
  account_or_workspace_id_or_null: z.string().nullable(),
  channel_or_page_id_or_null: z.string().nullable(),
  display_name: z.string().min(1),
  public_url_or_null: z.string().nullable(),
})

export const brandBindingSchema = z.object({
  brand_name: z.string().min(1),
  binding_basis: z.string().min(1),
  confirmation_ref_or_null: z.string().nullable(),
})

export const secureConnectionSchema = z.object({
  /** Reference into the integrations store; the document never carries a token. */
  connection_ref_or_null: z.string().nullable(),
  connection_state: z.enum(['connected', 'disconnected', 'not_provided']),
})

export const capabilitiesSchema = z.object({
  can_publish_text: z.enum(tristate),
  can_read_result: z.enum(tristate),
  /** A number from the adapter catalog or the literal `unknown`. */
  length_limit_or_unknown: z.union([z.number().int().positive(), z.literal('unknown')]),
  mention_controls: z.string().min(1),
  checked_at_or_null: z.string().nullable(),
})

export const connectionValidationSchema = z.object({
  state: z.enum(['verified', 'failed', 'not_executed']),
  method: z.string().min(1),
  checked_at_or_null: z.string().nullable(),
  evidence_ref_or_null: z.string().nullable(),
  failure_code_or_null: z.string().nullable(),
})

export const accessOwnerSchema = z.object({
  client_contact_ref_or_null: z.string().nullable(),
  internal_role: z.string().min(1),
})

export const konfigReadinessSchema = z.object({
  state: z.enum(['ready', 'not_ready']),
  blockers: z.array(z.string().min(1)),
  next_action: z.string().min(1),
})

export const konfigPublikacjiDataSchema = z.object({
  platform: konfigPlatformSchema,
  destination_identity: destinationIdentitySchema,
  brand_binding: brandBindingSchema,
  secure_connection: secureConnectionSchema,
  capabilities: capabilitiesSchema,
  connection_validation: connectionValidationSchema,
  access_owner: accessOwnerSchema,
  readiness: konfigReadinessSchema,
})
export type KonfigPublikacjiData = z.infer<typeof konfigPublikacjiDataSchema>
