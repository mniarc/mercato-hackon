import { z } from 'zod'
import { planningExecutionOutcomeSchema } from '@/modules/agency_research/lib/contracts'

export const PLANNING_EXECUTION_FUNCTION = 'agency_operations.runAcceptedPlanning'
export const PLANNING_EXECUTION_RESULT_KEY = 'agencyPlanningExecution'
export const PLANNING_EXECUTION_STEP_ID = 'planning_execution'

export const planningExecutionActivityResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_configured'), orderRef: z.string().min(1), reason: z.enum(['missing_planning_authorization', 'missing_process_configuration', 'execution_disabled']) }),
  z.object({ status: z.literal('not_ready'), orderRef: z.string().min(1), reason: z.string().min(1), templateId: z.string().optional() }),
  planningExecutionOutcomeSchema,
  z.object({ status: z.literal('execution_incomplete'), orderRef: z.string().min(1), activationTaskRunId: z.string().min(1), reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])

export type NativePlanningExecutionResult = z.infer<typeof planningExecutionActivityResultSchema>
