import { z } from 'zod'
import { planningReadinessRequestSchema, type PlanningReadiness } from '../planningReadiness/contracts'
import { strategyProcessReferenceSchema } from '../strategyReadiness/contracts'

export const planningExecutionRequestSchema = planningReadinessRequestSchema.extend({
  process: strategyProcessReferenceSchema, maxCostPln: z.number().positive(),
})
export type PlanningExecutionRequest = z.infer<typeof planningExecutionRequestSchema>
export const planningExecutionOutcomeSchema = z.object({
  status: z.enum(['completed', 'paused_budget']), orderRef: z.string().min(1),
  strategyVersionId: z.string(), tovVersionId: z.string(),
  taskRunIds: z.array(z.string()), documentVersionIds: z.array(z.string()), agentRunIds: z.array(z.string()),
  spentPln: z.number().nonnegative(), planVersionId: z.string().nullable(), qaTaskRunId: z.string().nullable(),
  qaVerdict: z.enum(['ready_for_approval', 'needs_agent_fix']).nullable(), readyForApproval: z.boolean(),
})
export type PlanningExecutionOutcome = z.infer<typeof planningExecutionOutcomeSchema>
export type PlanningExecutionResult = PlanningExecutionOutcome
  | Extract<PlanningReadiness, { status: 'not_ready' }>
  | { status: 'not_ready'; orderRef: string; reason: 'pinned_input_missing' | 'pinned_input_invalid' | 'order_version_missing' | 'topic_count_missing'; templateId?: string }
  | { status: 'execution_incomplete'; orderRef: string; activationTaskRunId: string; reason: 'in_progress_or_interrupted' | 'failed' | 'result_unavailable' }
