import { z } from 'zod'
import { materialRevisionResultSchema } from '@/modules/agency_research/lib/contracts'

export const MATERIAL_REVISION_FUNCTION = 'agency_operations.runMaterialRevision'
export const MATERIAL_REVISION_STEP_ID = 'material_revision'
export const MATERIAL_REVISION_RESULT_KEY = 'execute_material_revision_result'
export const MATERIAL_REVISION_REVIEW_FUNCTION = 'agency_operations.handoffMaterialRevisionReview'
export const MATERIAL_REVISION_EXCEPTION_FUNCTION = 'agency_operations.handoffMaterialRevisionException'
export const materialRevisionUnavailableSchema = z.object({
  status: z.literal('not_configured'), orderRef: z.string().min(1),
  reason: z.enum(['missing_process_configuration', 'missing_material_revision_authorization', 'execution_disabled']),
})
export const materialRevisionActivityResultSchema = z.union([
  materialRevisionResultSchema,
  materialRevisionUnavailableSchema,
  z.object({ status: z.literal('not_ready'), orderRef: z.string().min(1),
    reason: z.enum(['impact_review_required', 'material_unreadable', 'brief_not_reviewable']) }),
])
export type NativeMaterialRevisionResult = z.infer<typeof materialRevisionActivityResultSchema>
export const materialRevisionHandoffSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('invited'), orderRef: z.string(), versionId: z.uuid(),
    invitation: z.object({ workflowInstanceId: z.uuid(), taskId: z.uuid(), replayed: z.boolean() }) }),
  z.object({ status: z.literal('blocked'), orderRef: z.string(), invitation: z.null(), reason: z.string(),
    nextAction: z.enum(['review_configuration', 'review_material', 'review_impact', 'review_employee_exception']),
    revision: materialRevisionActivityResultSchema }),
])
export type MaterialRevisionHandoff = z.infer<typeof materialRevisionHandoffSchema>
