import { z } from 'zod'
import { acceptPostInputSchema, postAcceptanceRecordSchema } from '../postAcceptance/contracts'

export const publicationTargetSchema = z.object({
  configVersionId: z.uuid(), platform: z.string().trim().min(1),
  accountId: z.string().trim().min(1).nullable(), channelId: z.string().trim().min(1).nullable(),
  displayName: z.string().min(1),
}).strict().refine((target) => Boolean(target.accountId || target.channelId), 'A concrete configured destination is required')
export type PublicationTarget = z.infer<typeof publicationTargetSchema>
export const nativePublicationConsentSourceSchema = z.object({
  kind: z.literal('native_publication_consent_task'), workflowInstanceId: z.uuid(),
  invitationTaskId: z.uuid(), eventId: z.string().min(1).max(200),
}).strict()
const bundledConsentSourceSchema = postAcceptanceRecordSchema.shape.source.extend({ kind: z.literal('agency_publication_consent') })
export const publicationConsentSourceSchema = z.union([bundledConsentSourceSchema, nativePublicationConsentSourceSchema])
export const publicationConsentRecordSchema = z.object({
  person: z.uuid(), at: z.iso.datetime(), scope: z.literal('post_publication'),
  documentId: z.uuid(), documentVersionId: z.uuid(), version: z.string().min(1),
  contentHash: z.string().min(1), destination: publicationTargetSchema,
  source: publicationConsentSourceSchema,
}).strict()
export type PublicationConsentRecord = z.infer<typeof publicationConsentRecordSchema>
export const recordPublicationConsentInputSchema = acceptPostInputSchema.extend({
  request: z.union([
    acceptPostInputSchema.shape.request.extend({ destination: publicationTargetSchema, consent: z.literal(true), decidedAt: z.iso.datetime() }).strict(),
    acceptPostInputSchema.shape.request.extend({ source: nativePublicationConsentSourceSchema,
      destination: publicationTargetSchema, consent: z.literal(true), decidedAt: z.iso.datetime(), expectedContentHash: z.string().min(1),
    }).strict(),
  ]),
})
export type RecordPublicationConsentInput = z.infer<typeof recordPublicationConsentInputSchema>
export type PublicationConsent = {
  target: PublicationTarget | null
  contentHash?: string | null
  state: 'missing' | 'valid' | 'stale'
  record: PublicationConsentRecord | null
}
export type PublicationConsentResult =
  | { status: 'recorded'; record: PublicationConsentRecord; replayed: boolean }
  | { status: 'not_ready'; reason: 'target_changed' | 'post_not_current' | 'content_approval_missing' | 'content_changed' }

export function publicationConsentSourceRef(source: z.infer<typeof publicationConsentSourceSchema>): string {
  return source.kind === 'native_publication_consent_task' ? `task:${source.invitationTaskId}` : source.submissionId
}

/** Display names and connection/config revisions are not destination identity. */
export function samePublicationDestination(left: PublicationTarget, right: PublicationTarget): boolean {
  return left.platform === right.platform && left.accountId === right.accountId && left.channelId === right.channelId
}
export function publicationDestinationKey(target: PublicationTarget): string {
  return JSON.stringify([target.platform, target.accountId, target.channelId])
}
