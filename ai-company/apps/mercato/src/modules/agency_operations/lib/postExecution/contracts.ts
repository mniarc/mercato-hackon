import { z } from 'zod'
import { postExecutionOutcomeSchema } from '@/modules/agency_research/lib/contracts'

export const POST_EXECUTION_FUNCTION = 'agency_operations.runPostProduction'
export const POST_EXECUTION_RESULT_KEY = 'execute_post_result'
export const POST_EXECUTION_STEP_ID = 'post_production'

export const postExecutionActivityResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_configured'), orderRef: z.string().min(1), reason: z.enum(['missing_post_authorization', 'missing_process_configuration', 'execution_disabled']) }),
  z.object({ status: z.literal('not_ready'), orderRef: z.string().min(1), reason: z.string().min(1), templateId: z.string().optional(),
    taskRunId: z.string().optional(), instructionVersionId: z.string().optional(), issueCodes: z.array(z.string()).optional() }),
  postExecutionOutcomeSchema,
  z.object({ status: z.literal('execution_incomplete'), orderRef: z.string().min(1), activationTaskRunId: z.string().min(1), reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])

export type NativePostExecutionResult = z.infer<typeof postExecutionActivityResultSchema>

export const postReviewHandoffResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('invited'), orderRef: z.string().min(1),
    invitation: z.object({ workflowInstanceId: z.uuid(), taskId: z.uuid(), replayed: z.boolean() }),
  }),
  z.object({
    status: z.literal('blocked'), orderRef: z.string().min(1), invitation: z.null(), reason: z.string().min(1),
    nextAction: z.enum(['review_configuration', 'review_dependencies', 'reconcile_execution', 'review_qa', 'review_employee_exception']),
    execution: postExecutionActivityResultSchema.nullable(),
  }),
])
export type PostReviewHandoffResult = z.infer<typeof postReviewHandoffResultSchema>
