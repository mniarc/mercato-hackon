import { z } from 'zod'

export const publicationPreparationRequestSchema = z.object({ orderRef: z.string().min(1), postVersionId: z.uuid(), acceptanceSubmissionId: z.uuid() }).strict()
export const preparePublicationInputSchema = z.object({
  context: z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).strict(),
  request: publicationPreparationRequestSchema,
}).strict()
export type PreparePublicationInput = z.infer<typeof preparePublicationInputSchema>
export const publicationPreparationPreparedSchema = z.object({
  status: z.literal('prepared'), orderRef: z.string().min(1), postVersionId: z.uuid(), acceptanceSubmissionId: z.uuid(),
  taskRunId: z.uuid(), instructionVersionId: z.uuid(), configVersionId: z.uuid(), contentHash: z.string().min(1),
  contentApproval: z.literal('valid'), publicationConsent: z.enum(['missing', 'valid', 'stale', 'revoked']), canSend: z.literal(false),
  missingGates: z.array(z.string()), replayed: z.boolean(),
})
export const publicationPreparationResultSchema = z.discriminatedUnion('status', [
  publicationPreparationPreparedSchema,
  z.object({ status: z.literal('not_ready'), orderRef: z.string().min(1), reason: z.enum([
    'post_not_found', 'post_not_current', 'post_not_reviewable', 'post_qa_not_ready', 'approval_record_missing',
    'acceptance_missing', 'acceptance_superseded', 'pinned_input_missing', 'pinned_input_invalid', 'saved_preparation_incomplete',
  ]) }),
])
export type PublicationPreparationResult = z.infer<typeof publicationPreparationResultSchema>
