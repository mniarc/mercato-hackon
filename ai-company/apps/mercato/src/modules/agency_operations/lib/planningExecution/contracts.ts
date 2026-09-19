import { z } from 'zod'
import { planningExecutionOutcomeSchema } from '@/modules/agency_research/lib/contracts'

export const PLANNING_EXECUTION_FUNCTION = 'agency_operations.runAcceptedPlanning'
export const PLANNING_EXECUTION_RESULT_KEY = 'execute_planning_result'
export const PLANNING_EXECUTION_STEP_ID = 'planning_execution'
export const PLAN_REVIEW_HANDOFF_FUNCTION = 'agency_operations.invitePlanReview'

export const planningExecutionActivityResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_configured'), orderRef: z.string().min(1), reason: z.enum(['missing_planning_authorization', 'missing_process_configuration', 'execution_disabled']) }),
  z.object({ status: z.literal('not_ready'), orderRef: z.string().min(1), reason: z.string().min(1), templateId: z.string().optional() }),
  planningExecutionOutcomeSchema,
  z.object({ status: z.literal('execution_incomplete'), orderRef: z.string().min(1), activationTaskRunId: z.string().min(1), reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])

export type NativePlanningExecutionResult = z.infer<typeof planningExecutionActivityResultSchema>

export const planningReviewHandoffResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('invited'), orderRef: z.string().min(1),
    invitation: z.object({ workflowInstanceId: z.uuid(), taskId: z.uuid(), replayed: z.boolean() }),
  }),
  z.object({
    status: z.literal('blocked'), orderRef: z.string().min(1), invitation: z.null(), reason: z.string().min(1),
    nextAction: z.enum(['review_configuration', 'review_dependencies', 'reconcile_execution', 'review_qa', 'review_employee_exception']),
    activationTaskRunId: z.string().optional(), templateId: z.string().optional(),
  }),
])

export type PlanningReviewHandoffResult = z.infer<typeof planningReviewHandoffResultSchema>
