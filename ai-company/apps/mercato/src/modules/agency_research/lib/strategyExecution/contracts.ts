import { z } from 'zod'
import { strategyReadinessRequestSchema, type StrategyReadinessReason } from '../strategyReadiness/contracts'

export const strategyExecutionRequestSchema = strategyReadinessRequestSchema.extend({
  maxCostPln: z.number().positive(),
})
export type StrategyExecutionRequest = z.infer<typeof strategyExecutionRequestSchema>

export type StrategyExecutionResult =
  | { status: 'not_ready'; orderRef: string; reason: StrategyReadinessReason | 'pinned_input_missing' | 'order_version_missing'; templateId?: string }
  | {
      status: 'completed' | 'paused_budget'
      orderRef: string
      taskRunIds: string[]
      documentVersionIds: string[]
      agentRunIds: string[]
      spentPln: number
      strategyVersionId: string | null
      tovVersionId: string | null
      qaTaskRunId: string | null
      qaVerdict: 'ready_for_approval' | 'needs_agent_fix' | null
      escalationVersionId?: string
    }
