import { z } from 'zod'

export const briefRevisionSourceSchema = z.object({
  submissionId: z.string().uuid(),
  eventId: z.string().min(1),
  customerUserId: z.string().uuid(),
  workflowInstanceId: z.string().uuid(),
  invitationTaskId: z.string().uuid(),
}).strict()

export const briefRevisionRequestSchema = z.object({
  orderRef: z.string().min(1),
  briefVersionId: z.string().uuid(),
  source: briefRevisionSourceSchema,
  originalText: z.string().min(1),
  maxCostPln: z.number().positive(),
}).strict()

export const briefRevisionOutcomeSchema = z.object({
  status: z.enum(['completed', 'needs_client_data', 'analysis_blocked', 'paused_budget']),
  orderRef: z.string(),
  submissionId: z.string().uuid(),
  previousBriefVersionId: z.string().uuid(),
  briefVersionId: z.string().uuid().nullable(),
  findingsVersionId: z.string().uuid().nullable(),
  qaTaskRunId: z.string().uuid().nullable(),
  qaVerdict: z.enum(['ready_for_approval', 'needs_client_data', 'needs_agent_fix']).nullable(),
  analysisQaTaskRunId: z.string().uuid().nullable(),
  freezeTaskRunId: z.string().uuid().nullable(),
  answeredQuestionIds: z.array(z.string()),
  unresolvedQuestionIds: z.array(z.string()),
  questions: z.array(z.object({ questionId: z.string(), question: z.string() })),
  taskRunIds: z.array(z.string().uuid()),
  documentVersionIds: z.array(z.string().uuid()),
  agentRunIds: z.array(z.string().uuid()),
  spentPln: z.number().nonnegative(),
  escalationVersionId: z.string().uuid().optional(),
})

export type BriefRevisionRequest = z.infer<typeof briefRevisionRequestSchema>
export type BriefRevisionOutcome = z.infer<typeof briefRevisionOutcomeSchema>
export const briefRevisionResultSchema = z.union([
  briefRevisionOutcomeSchema,
  z.object({
    status: z.literal('not_ready'), orderRef: z.string(),
    reason: z.enum(['brief_not_current', 'brief_not_reviewable', 'input_missing', 'input_changed', 'revision_in_progress']),
  }),
  z.object({
    status: z.literal('execution_incomplete'), orderRef: z.string(), activationTaskRunId: z.string().uuid(),
    reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']),
  }),
])
export type BriefRevisionResult = z.infer<typeof briefRevisionResultSchema>

export const briefAnswerProposalSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().min(1),
    value: z.string().min(1),
    quote: z.string().min(1),
  }).strict()),
}).strict()
export const briefAnswerAgentResultSchema = z.object({ kind: z.literal('research'), data: briefAnswerProposalSchema })
export type BriefAnswerProposal = z.infer<typeof briefAnswerProposalSchema>
