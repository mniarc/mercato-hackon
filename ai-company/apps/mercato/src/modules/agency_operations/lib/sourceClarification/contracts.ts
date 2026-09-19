import { z } from 'zod'

export const SOURCE_CLARIFICATION_STEP = 'source_clarification'
export const SOURCE_RESPONSE_STEP = 'source_response_saved'
export const SOURCE_RESPONSE_FUNCTION = 'agency_operations.receiveSourceClarification'
export const SOURCE_RESPONSE_KEY = 'agencySourceResponse'
export const SOURCE_CORRECTION_KEY = 'agencySourceCorrection'

export const correctedWebsiteSchema = z.url({ protocol: /^https?$/ })
export const sourceClarificationSchema = z.object({
  reason: z.literal('insufficient_source_evidence'), sourceIds: z.array(z.string()),
})
export const sourceResponseSchema = z.object({
  state: z.enum(['received', 'needs_correction']), taskId: z.uuid(), submissionId: z.uuid(),
  websiteUrl: correctedWebsiteSchema.nullable(),
})
export const sourceCorrectionSchema = z.object({
  workflowInstanceId: z.uuid(), taskId: z.uuid(), submissionId: z.uuid(), websiteUrl: correctedWebsiteSchema,
})
export type SourceCorrection = z.infer<typeof sourceCorrectionSchema>
