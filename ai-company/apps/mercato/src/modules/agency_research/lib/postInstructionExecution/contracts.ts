import { z } from 'zod'
import type { PlanReviewNotReady } from '../planAcceptance/contracts'

export const postInstructionExecutionRequestSchema = z.object({
  orderRef: z.string().min(1), planVersionId: z.uuid(), selectionSubmissionId: z.uuid().optional(),
}).strict()
export type PostInstructionExecutionRequest = z.infer<typeof postInstructionExecutionRequestSchema>

export const postInstructionReadySchema = z.object({
  status: z.literal('ready'), orderRef: z.string(), planVersionId: z.string(), selectedTopicId: z.string(),
  selectionSubmissionId: z.string(), taskRunId: z.string(), instructionDocumentId: z.string(),
  instructionVersionId: z.string(), instructionVersion: z.string(), replayed: z.boolean(),
})
export type PostInstructionReady = z.infer<typeof postInstructionReadySchema>
export const postInstructionExecutionResultSchema = z.discriminatedUnion('status', [
  postInstructionReadySchema,
  z.object({ status: z.literal('not_ready'), orderRef: z.string(), reason: z.string(), templateId: z.string().optional(),
    taskRunId: z.string().optional(), instructionVersionId: z.string().optional(), issueCodes: z.array(z.string()).optional() }),
])
export type PostInstructionExecutionResult = PostInstructionReady | {
  status: 'not_ready'
  orderRef: string
  reason: PlanReviewNotReady['reason'] | 'brief_not_found' | 'selection_missing' | 'selection_superseded' | 'selected_topic_missing'
    | 'dependency_missing' | 'dependency_not_current' | 'dependency_requires_review' | 'dependency_invalid'
    | 'instruction_not_current' | 'compiler_blocked'
  templateId?: string
  taskRunId?: string
  instructionVersionId?: string
  issueCodes?: string[]
}
