import { z } from 'zod'
import { postExecutionOutcomeSchema, postExecutionNotReadySchema } from '../postExecution/contracts'

export const runPostEvidenceRequestSchema = z.object({
  orderRef: z.string().min(1), postVersionId: z.uuid(), instructionVersionId: z.uuid(),
  qaTaskRunId: z.uuid(), maxCostPln: z.number().positive(),
}).strict()
export type RunPostEvidenceRequest = z.infer<typeof runPostEvidenceRequestSchema>
export const postEvidenceOutcomeSchema = postExecutionOutcomeSchema.omit({ evidenceRequest: true }).extend({
  requestedQaTaskRunId: z.uuid(), requestedPostVersionId: z.uuid(), evidenceTaskRunId: z.uuid(),
})
export type PostEvidenceOutcome = z.infer<typeof postEvidenceOutcomeSchema>
export const postEvidenceResultSchema = z.union([
  postEvidenceOutcomeSchema, postExecutionNotReadySchema,
  z.object({ status: z.literal('execution_incomplete'), orderRef: z.string(), activationTaskRunId: z.string(),
    reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])
export type PostEvidenceResult = z.infer<typeof postEvidenceResultSchema>
