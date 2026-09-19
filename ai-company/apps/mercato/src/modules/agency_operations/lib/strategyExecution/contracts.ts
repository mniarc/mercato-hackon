import { z } from 'zod'
import { strategyExecutionOutcomeSchema } from '@/modules/agency_research/lib/contracts'

export const STRATEGY_EXECUTION_FUNCTION = 'agency_operations.runAcceptedStrategy'
export const STRATEGY_EXECUTION_RESULT_KEY = 'execute_strategy_result'
export const STRATEGY_EXECUTION_STEP_ID = 'strategy_execution'
export const STRATEGY_REVIEW_HANDOFF_FUNCTION = 'agency_operations.handoffStrategyReview'

// Saved native activity result read model. orderRef is the owning agency case ID.
export const strategyExecutionActivityResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_configured'), orderRef: z.string().min(1), reason: z.enum(['missing_strategy_authorization', 'missing_process_configuration']) }),
  z.object({ status: z.literal('not_ready'), orderRef: z.string().min(1), reason: z.string().min(1), templateId: z.string().optional() }),
  strategyExecutionOutcomeSchema,
  z.object({ status: z.literal('execution_incomplete'), orderRef: z.string().min(1), activationTaskRunId: z.string().min(1),
    reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])

export type NativeStrategyExecutionResult = z.infer<typeof strategyExecutionActivityResultSchema>
