import { z } from 'zod'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { publicationTargetSchema } from '@/modules/agency_research/lib/publicationConsent/contracts'
import { publicationPreparationResultSchema } from '@/modules/agency_research/lib/publicationPreparation/contracts'

export const PUBLICATION_CONSENT_REQUEST_SERVICE = 'agencyPublicationConsentRequestService'
export const PUBLICATION_CONSENT_WORKFLOW_ID = 'agency_operations.publication-consent.v1'
export const PUBLICATION_CONSENT_FORM_KEY = 'agency.publication-consent'
export const PUBLICATION_CONSENT_FUNCTION = 'agency_operations.receivePublicationConsent'
export const publicationConsentInviteSchema = z.object({ caseId: z.uuid(), postVersionId: z.uuid(),
  tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(),
}).strict()
export const publicationConsentResponseSchema = z.object({
  postVersionId: z.uuid(), configVersionId: z.uuid(), consent: z.literal(true),
  externalEventId: z.string().trim().min(1).max(200),
}).strict()
export const publicationConsentSnapshotSchema = z.object({
  caseId: z.uuid(), customerEntityId: z.uuid(), customerUserId: z.uuid(),
  documentId: z.uuid(), postVersionId: z.uuid(), version: z.string().min(1),
  contentHash: z.string().min(1), clientViewMd: z.string().min(1),
  acceptedAt: z.iso.datetime(), target: publicationTargetSchema,
}).strict()
export const publicationConsentReadSchema = z.object({ ok: z.literal(true),
  request: publicationConsentSnapshotSchema.omit({ customerUserId: true, customerEntityId: true }),
  canRespond: z.boolean(), canSend: z.literal(false), consentedAt: z.iso.datetime().nullable(),
})
export const publicationConsentResponseReceiptSchema = z.object({ taskId: z.uuid(),
  status: z.literal('consent_recorded'), consentedAt: z.iso.datetime(), replayed: z.boolean(),
  preparation: publicationPreparationResultSchema, canSend: z.literal(false),
})
export const publicationConsentInvitationReceiptSchema = z.object({ workflowInstanceId: z.uuid(), taskId: z.uuid(), replayed: z.boolean(), canSend: z.literal(false) })
export type PublicationConsentRequestService = {
  invite(input: z.infer<typeof publicationConsentInviteSchema>): Promise<z.infer<typeof publicationConsentInvitationReceiptSchema>>
  read(auth: CustomerAuthContext, taskId: string): Promise<z.infer<typeof publicationConsentReadSchema>>
  respond(auth: CustomerAuthContext, taskId: string, input: z.infer<typeof publicationConsentResponseSchema>): Promise<z.infer<typeof publicationConsentResponseReceiptSchema>>
  receiveResponse(input: unknown, context: unknown): Promise<z.infer<typeof publicationConsentResponseReceiptSchema>>
}
