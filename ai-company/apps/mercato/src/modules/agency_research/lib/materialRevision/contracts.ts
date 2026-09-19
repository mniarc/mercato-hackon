import { z } from 'zod'
import { briefFieldKeys } from '../../data/schemas/ustalenia'
import { researchMaterialSourceSchema } from '../contracts/agencyResearch'

export const materialRevisionDirectiveSchema = z.object({ question: z.string().min(1), briefField: z.enum(briefFieldKeys) }).strict()
export const materialRevisionRequestSchema = z.object({
  orderRef: z.string().min(1), briefVersionId: z.string().uuid(),
  source: z.object({ submissionId: z.string().uuid(), eventId: z.string().min(1), customerUserId: z.string().uuid(), workflowInstanceId: z.string().uuid() }).strict(),
  material: researchMaterialSourceSchema,
  directive: materialRevisionDirectiveSchema,
  maxCostPln: z.number().positive(),
}).strict().refine((value) => value.material.submissionId === value.source.submissionId, { message: 'Material must belong to the originating submission' })
export type MaterialRevisionRequest = z.infer<typeof materialRevisionRequestSchema>

export const materialRevisionOutcomeSchema = z.object({
  status: z.enum(['completed', 'needs_client_data', 'analysis_blocked', 'paused_budget']),
  orderRef: z.string(), submissionId: z.string().uuid(), previousBriefVersionId: z.string().uuid(),
  briefVersionId: z.string().uuid().nullable(), sourcesVersionId: z.string().uuid().nullable(), findingsVersionId: z.string().uuid().nullable(),
  qaTaskRunId: z.string().uuid().nullable(), qaVerdict: z.enum(['ready_for_approval', 'needs_client_data', 'needs_agent_fix']).nullable(),
  analysisQaTaskRunId: z.string().uuid().nullable(), freezeTaskRunId: z.string().uuid().nullable(),
  questions: z.array(z.object({ questionId: z.string(), question: z.string() })),
  taskRunIds: z.array(z.string().uuid()), documentVersionIds: z.array(z.string().uuid()), agentRunIds: z.array(z.string().uuid()),
  spentPln: z.number().nonnegative(), escalationVersionId: z.string().uuid().optional(),
})
export const materialRevisionResultSchema = z.union([
  materialRevisionOutcomeSchema,
  z.object({ status: z.literal('not_ready'), orderRef: z.string(), reason: z.enum(['brief_not_current', 'brief_not_reviewable', 'input_missing', 'input_changed', 'revision_in_progress', 'material_already_registered', 'downstream_exists']) }),
  z.object({ status: z.literal('execution_incomplete'), orderRef: z.string(), activationTaskRunId: z.string().uuid(), reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])
export type MaterialRevisionOutcome = z.infer<typeof materialRevisionOutcomeSchema>
export type MaterialRevisionResult = z.infer<typeof materialRevisionResultSchema>
