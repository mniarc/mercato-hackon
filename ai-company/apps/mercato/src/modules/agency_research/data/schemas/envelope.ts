import { z } from 'zod'

/**
 * COMMON-ENVELOPE (Rafał's template package v1.1): the metadata every document
 * instance carries. Agents never see or emit it — `lib/research/envelope.ts`
 * fills it in code from the pinned inputs and the gate's issues.
 */

export const documentStatuses = [
  'draft',
  'ready_for_review',
  'approved',
  'needs_review',
  'blocked',
  'simulated_draft',
  'simulated_accepted',
] as const
export type DocumentStatus = (typeof documentStatuses)[number]

export const templateIds = [
  'WZR-ZAMOWIENIE',
  'WZR-ZRODLA',
  'WZR-AUDYT',
  'WZR-KONKURENCJA',
  'WZR-USTALENIA',
  'WZR-BRIEF',
  'WZR-ESKALACJA',
  'WZR-STRATEGIA',
  'WZR-TOV',
  'WZR-PLAN',
  'WZR-ZLECENIE-POSTU',
  'WZR-POST',
  'WZR-KONFIG-PUBLIKACJI',
  'WZR-ZLECENIE-PUBLIKACJI',
  'WZR-POTWIERDZENIE-PUBLIKACJI',
  'WZR-PAKIET',
] as const
export type TemplateId = (typeof templateIds)[number]

/** The filled instance of a template: WEW-* internal, KLI-* client-facing. */
export const outputIdByTemplate: Record<TemplateId, string> = {
  'WZR-ZAMOWIENIE': 'WEW-DANE-ZAMOWIENIA',
  'WZR-ZRODLA': 'WEW-ZRODLA',
  'WZR-AUDYT': 'WEW-AUDYT',
  'WZR-KONKURENCJA': 'WEW-KONKURENCJA',
  'WZR-USTALENIA': 'WEW-USTALENIA',
  'WZR-BRIEF': 'KLI-BRIEF',
  'WZR-ESKALACJA': 'WEW-ESKALACJA',
  'WZR-STRATEGIA': 'KLI-STRATEGIA',
  'WZR-TOV': 'KLI-TOV',
  'WZR-PLAN': 'KLI-PLAN',
  'WZR-ZLECENIE-POSTU': 'WEW-ZLECENIE-POSTU',
  'WZR-POST': 'KLI-POST',
  'WZR-KONFIG-PUBLIKACJI': 'WEW-KONFIG-PUBLIKACJI',
  'WZR-ZLECENIE-PUBLIKACJI': 'WEW-ZLECENIE-PUBLIKACJI',
  'WZR-POTWIERDZENIE-PUBLIKACJI': 'WEW-POTWIERDZENIE-PUBLIKACJI',
  'WZR-PAKIET': 'KLI-PAKIET',
}

export const inputVersionSchema = z.object({
  document_id: z.string().min(1),
  version: z.string().min(1),
  status: z.string().optional(),
})
export type InputVersion = z.infer<typeof inputVersionSchema>

/** One gap or limitation the document carries forward; `null` in the data never means "condition met". */
export const documentIssueSchema = z.object({
  code: z.string().min(1),
  severity: z.string().min(1),
  detail: z.string().min(1),
  path: z.string().optional(),
})
export type DocumentIssue = z.infer<typeof documentIssueSchema>

export const approvalRecordSchema = z.object({
  person: z.string().min(1),
  at: z.string().min(1),
  scope: z.string().min(1),
  version: z.string().min(1),
  documentVersionId: z.uuid().optional(),
  // Persist the typed acceptance provenance without making data schemas depend on services.
  source: z.object({
    kind: z.enum(['agency_brief_acceptance', 'agency_post_acceptance', 'agency_publication_consent']),
    submissionId: z.uuid(),
    eventId: z.string().min(1).max(200),
    workflowInstanceId: z.uuid(),
    agentRunId: z.uuid(),
    invitationTaskId: z.uuid(),
  }).strict().optional(),
})

export const envelopeSchema = z.object({
  document_id: z.string().min(1),
  template_id: z.enum(templateIds),
  schema_version: z.literal('1.1'),
  /** null only before purchase or in a test. */
  order_id: z.string().nullable(),
  version: z.string().min(1),
  status: z.enum(documentStatuses),
  input_versions: z.array(inputVersionSchema),
  /** data key → ids of the facts / sources / decisions that support it. */
  field_evidence: z.record(z.string(), z.array(z.string())),
  approval_records: z.array(approvalRecordSchema),
  simulation_flag: z.boolean(),
  issues: z.array(documentIssueSchema),
})
export type Envelope = z.infer<typeof envelopeSchema>

export function documentSchema<T extends z.ZodTypeAny>(templateId: TemplateId, data: T) {
  return envelopeSchema.extend({ template_id: z.literal(templateId), data })
}
