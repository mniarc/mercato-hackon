import { z } from 'zod'
import { strategyReadinessRequestSchema, type StrategyReadinessReason } from '../strategyReadiness/contracts'
import { specialistTovReferenceSchema } from '@/modules/agency_tov/lib/documentVersion/contracts'

export const strategyExecutionRequestSchema = strategyReadinessRequestSchema.extend({
  maxCostPln: z.number().positive(),
  /** Trusted case-linked specialist output, never a client-selected foreign version. */
  specialistTov: specialistTovReferenceSchema.optional(),
  /** Trusted correction caller: reassess this unchanged current strategy, never author it again. */
  reassessStrategyVersionId: z.uuid().optional(),
})
export type StrategyExecutionRequest = z.infer<typeof strategyExecutionRequestSchema>

export const strategyExecutionOutcomeSchema = z.object({
  status: z.enum(['completed', 'paused_budget']),
  orderRef: z.string().min(1),
  taskRunIds: z.array(z.string()),
  documentVersionIds: z.array(z.string()),
  agentRunIds: z.array(z.string()),
  spentPln: z.number().nonnegative(),
  strategyVersionId: z.string().nullable(),
  tovVersionId: z.string().nullable(),
  qaTaskRunId: z.string().nullable(),
  qaVerdict: z.enum(['ready_for_approval', 'needs_agent_fix']).nullable(),
  escalationVersionId: z.string().optional(),
  specialistTov: specialistTovReferenceSchema.optional(),
})
export type StrategyExecutionOutcome = z.infer<typeof strategyExecutionOutcomeSchema>

export type StrategyExecutionResult =
  | { status: 'not_ready'; orderRef: string; reason: StrategyReadinessReason | 'pinned_input_missing' | 'order_version_missing' | 'specialist_tov_required' | 'specialist_tov_unavailable'; templateId?: string }
  | {
      status: 'execution_incomplete'
      orderRef: string
      activationTaskRunId: string
      reason: 'in_progress_or_interrupted' | 'failed' | 'result_unavailable'
    }
  | StrategyExecutionOutcome
