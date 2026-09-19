import { z } from 'zod'
import { postRevisionResultSchema } from '@/modules/agency_research/lib/contracts'

export const POST_REVISION_FUNCTION = 'agency_operations.runPostRevision'
export const POST_REVISION_STEP_ID = 'post_revision'
export const POST_REVISION_ACTIVITY_ID = 'execute_post_revision'
export const POST_REVISION_RESULT_KEY = 'execute_post_revision_result'
export const POST_REVISION_REVIEW_FUNCTION = 'agency_operations.handoffPostRevisionReview'
export const POST_REVISION_EXCEPTION_FUNCTION = 'agency_operations.handoffPostRevisionResearchException'

export const postRevisionUnavailableSchema = z.object({
  status: z.literal('not_configured'), orderRef: z.string().min(1),
  reason: z.enum(['missing_process_configuration', 'missing_post_revision_authorization', 'execution_disabled']),
})
export const postRevisionActivityResultSchema = z.union([postRevisionUnavailableSchema, postRevisionResultSchema])
export type NativePostRevisionResult = z.infer<typeof postRevisionActivityResultSchema>

export const postRevisionReviewHandoffResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('invited'), orderRef: z.string(), versionId: z.uuid(),
    invitation: z.object({ workflowInstanceId: z.uuid(), taskId: z.uuid(), replayed: z.boolean() }) }),
  z.object({ status: z.literal('blocked'), orderRef: z.string(), invitation: z.null(), reason: z.string(),
    nextAction: z.enum(['review_configuration', 'inspect_saved_change']), revision: postRevisionActivityResultSchema }),
])
export type PostRevisionReviewHandoffResult = z.infer<typeof postRevisionReviewHandoffResultSchema>
