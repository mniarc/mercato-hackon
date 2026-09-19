import { z } from 'zod'

export const briefAcceptanceSourceSchema = z.object({
  kind: z.literal('agency_brief_acceptance'),
  submissionId: z.uuid(), eventId: z.string().min(1).max(200),
  workflowInstanceId: z.uuid(), agentRunId: z.uuid(), invitationTaskId: z.uuid(),
}).strict()

export const briefAcceptanceRecordSchema = z.object({
  person: z.uuid(), at: z.iso.datetime(), scope: z.literal('brief'),
  version: z.string().regex(/^[1-9]\d*\.0$/), documentVersionId: z.uuid(),
  source: briefAcceptanceSourceSchema,
})

/** Server-only handoff: the caller verifies saved G interpretation, original response and native contact/task binding. */
export const acceptBriefInputSchema = z.object({
  context: z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).strict(),
  request: z.object({
    orderRef: z.string().min(1), documentId: z.uuid(), versionId: z.uuid(), customerUserId: z.uuid(),
    source: briefAcceptanceSourceSchema.omit({ kind: true }),
  }).strict(),
}).strict()

export const briefAcceptanceReceiptSchema = z.object({
  status: z.literal('accepted'), orderRef: z.string(), documentId: z.uuid(), versionId: z.uuid(),
  version: z.string(), acceptedAt: z.iso.datetime(), customerUserId: z.uuid(),
  source: briefAcceptanceSourceSchema, replayed: z.boolean(),
})

export type AcceptBriefInput = z.infer<typeof acceptBriefInputSchema>
export type BriefAcceptanceRecord = z.infer<typeof briefAcceptanceRecordSchema>
export type BriefAcceptanceReceipt = z.infer<typeof briefAcceptanceReceiptSchema>
export type BriefAcceptanceProjection = Omit<BriefAcceptanceReceipt, 'replayed'>
