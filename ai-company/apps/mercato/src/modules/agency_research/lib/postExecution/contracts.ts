import { z } from 'zod'
import { strategyProcessReferenceSchema } from '../strategyReadiness/contracts'
import { postEvidenceRequestSchema } from '../../data/agents/post'

export const postExecutionRequestSchema = z.object({
  orderRef: z.string().min(1), instructionVersionId: z.uuid(), selectionSubmissionId: z.uuid(),
  process: strategyProcessReferenceSchema, maxCostPln: z.number().positive(),
}).strict()
export type PostExecutionRequest = z.infer<typeof postExecutionRequestSchema>

export const postExecutionOutcomeSchema = z.object({
  status: z.enum(['completed', 'paused_budget']), orderRef: z.string().min(1),
  instructionVersionId: z.string(), selectionSubmissionId: z.string(),
  taskRunIds: z.array(z.string()), documentVersionIds: z.array(z.string()), agentRunIds: z.array(z.string()),
  spentPln: z.number().nonnegative(), postVersionId: z.string().nullable(), qaTaskRunId: z.string().nullable(),
  qaVerdict: z.enum(['pass_for_draft', 'needs_fix', 'reject']).nullable(), readyForReview: z.boolean(),
  escalationVersionId: z.string().optional(),
  evidenceRequest: postEvidenceRequestSchema.optional(),
  evidencePendingReason: z.string().optional(),
})
export type PostExecutionOutcome = z.infer<typeof postExecutionOutcomeSchema>
export const postExecutionNotReadySchema = z.object({
  status: z.literal('not_ready'), orderRef: z.string(), reason: z.string(), templateId: z.string().optional(),
})
export type PostExecutionNotReady = z.infer<typeof postExecutionNotReadySchema>
export const postExecutionResultSchema = z.union([
  postExecutionOutcomeSchema, postExecutionNotReadySchema,
  z.object({ status: z.literal('execution_incomplete'), orderRef: z.string(), activationTaskRunId: z.string(),
    reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])
export type PostExecutionResult = z.infer<typeof postExecutionResultSchema>
