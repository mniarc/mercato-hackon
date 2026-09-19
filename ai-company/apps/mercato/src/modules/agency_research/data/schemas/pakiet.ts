import { z } from 'zod'
import { publicationOutcomes } from './potwierdzeniePublikacji'

/**
 * KLI-PAKIET (WZR-PAKIET, process 9.1–9.3) — the delivery package: identity of
 * the purchased package, a manifest pointing at the approved versions (never a
 * copy of them), 3–5 audit takeaways, the publication receipt reference, how to
 * use the results, limitations, the completion check, the delivery record and
 * the deterministic closure gate (payment from 2.1, completion, publication,
 * delivery, no open blockers). Closure needs proof of delivery, not of reading.
 */

export const deliverableKinds = ['brief', 'strategy', 'tov', 'plan', 'post', 'audit_takeaways', 'publication_proof'] as const

export const packageIdentitySchema = z.object({
  brand: z.string().min(1),
  purchased_sku: z.string().min(1),
  purchased_offer_version: z.string().min(1),
  realization_state: z.enum(['preparing', 'ready_for_delivery', 'delivered']),
})

export const deliverableSchema = z.object({
  kind: z.enum(deliverableKinds),
  title: z.string().min(1),
  document_ref: z.string().min(1),
  content_version: z.string().min(1),
  access_ref_or_null: z.string().nullable(),
  approval_state: z.enum(['approved', 'simulated_accepted', 'ready_for_review', 'draft', 'not_applicable', 'blocked']),
  availability_state: z.enum(['available', 'blocked', 'not_available']),
})

export const auditTakeawaySchema = z.object({
  finding: z.string().min(1),
  source_finding_ref: z.string().min(1),
  implication: z.string().min(1),
  limitation: z.string().min(1),
})

export const publicationReceiptRefSchema = z.object({
  receipt_ref: z.string().min(1),
  outcome: z.enum(publicationOutcomes),
  verified_url_or_null: z.string().nullable(),
})

export const howToUseSchema = z.object({ action: z.string().min(1), document_ref: z.string().min(1) })

export const packageLimitationSchema = z.object({ topic: z.string().min(1), limitation: z.string().min(1), source_ref: z.string().min(1) })

export const completionCheckSchema = z.object({
  state: z.enum(['complete', 'incomplete']),
  required_items: z.array(z.string().min(1)),
  unresolved_changes: z.array(z.string().min(1)),
  blockers: z.array(z.string().min(1)),
})

export const packageDeliverySchema = z.object({
  state: z.enum(['not_executed', 'failed', 'delivered']),
  channel_or_null: z.string().nullable(),
  recipient_ref_or_null: z.string().nullable(),
  delivered_at_or_null: z.string().nullable(),
  delivery_evidence_ref_or_null: z.string().nullable(),
})

export const closureGateSchema = z.object({
  payment_verified: z.boolean(),
  completion_passed: z.boolean(),
  publication_verified: z.boolean(),
  delivery_verified: z.boolean(),
  open_blockers: z.boolean(),
  close_allowed: z.boolean(),
})

export const pakietDataSchema = z.object({
  package_identity: packageIdentitySchema,
  deliverables_manifest: z.array(deliverableSchema),
  audit_takeaways: z.array(auditTakeawaySchema),
  publication_receipt_ref: publicationReceiptRefSchema,
  how_to_use: z.array(howToUseSchema).max(3),
  limitations: z.array(packageLimitationSchema),
  completion_check: completionCheckSchema,
  delivery: packageDeliverySchema,
  closure_gate: closureGateSchema,
  /** ≤250 characters, neutral note about the next request through G. */
  next_contact: z.string().max(250).nullable(),
})
export type PakietData = z.infer<typeof pakietDataSchema>
