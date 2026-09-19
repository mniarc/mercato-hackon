import { z } from 'zod'
import { briefRevisionResultSchema } from '@/modules/agency_research/lib/contracts'

export const BRIEF_REVISION_FUNCTION = 'agency_operations.runBriefRevision'
export const BRIEF_REVISION_STEP_ID = 'brief_revision'
export const BRIEF_REVISION_ACTIVITY_ID = 'execute_brief_revision'
export const BRIEF_REVISION_RESULT_KEY = 'execute_brief_revision_result'
export const BRIEF_REVISION_REVIEW_FUNCTION = 'agency_operations.handoffBriefRevisionReview'
export const BRIEF_REVISION_EXCEPTION_FUNCTION = 'agency_operations.handoffBriefRevisionResearchException'

export const briefRevisionUnavailableSchema = z.object({
  status: z.literal('not_configured'), orderRef: z.string().min(1),
  reason: z.enum(['missing_process_configuration', 'missing_brief_revision_authorization', 'execution_disabled']),
})
export const briefRevisionActivityResultSchema = z.union([briefRevisionUnavailableSchema, briefRevisionResultSchema])
export type NativeBriefRevisionResult = z.infer<typeof briefRevisionActivityResultSchema>
