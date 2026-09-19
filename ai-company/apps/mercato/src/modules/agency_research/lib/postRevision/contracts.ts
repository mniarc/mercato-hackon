import { z } from 'zod'
import { postExecutionRequestSchema } from '../postExecution/contracts'
import { postEvidenceRequestSchema } from '../../data/agents/post'

export const postRevisionSourceSchema = z.object({
  submissionId: z.uuid(), eventId: z.string().min(1), customerUserId: z.uuid(),
  workflowInstanceId: z.uuid(), invitationTaskId: z.uuid(), agentRunId: z.uuid(),
}).strict()

export const postRevisionRequestSchema = postExecutionRequestSchema.omit({ instructionVersionId: true, selectionSubmissionId: true }).extend({
  postVersionId: z.uuid(), source: postRevisionSourceSchema,
  originalText: z.string().min(1).max(20000).refine((text) => text.trim().length > 0),
}).strict()
export type PostRevisionRequest = z.infer<typeof postRevisionRequestSchema>

export const postRevisionOutcomeSchema = z.object({
  status: z.enum(['completed', 'paused_budget']), orderRef: z.string(),
  submissionId: z.uuid(), previousPostVersionId: z.uuid(), instructionVersionId: z.uuid(),
  postVersionId: z.string().nullable(), qaTaskRunId: z.string().nullable(),
  qaVerdict: z.enum(['pass_for_draft', 'needs_fix', 'reject']).nullable(), readyForReview: z.boolean(),
  taskRunIds: z.array(z.string()), documentVersionIds: z.array(z.string()), agentRunIds: z.array(z.string()),
  spentPln: z.number().nonnegative(), escalationVersionId: z.string().optional(),
  evidenceRequest: postEvidenceRequestSchema.optional(),
})
export type PostRevisionOutcome = z.infer<typeof postRevisionOutcomeSchema>
export const postRevisionResultSchema = z.union([
  postRevisionOutcomeSchema,
  z.object({ status: z.literal('not_ready'), orderRef: z.string(), reason: z.string(), templateId: z.string().optional() }),
  z.object({ status: z.literal('execution_incomplete'), orderRef: z.string(), activationTaskRunId: z.string(),
    reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])
export type PostRevisionResult = z.infer<typeof postRevisionResultSchema>
