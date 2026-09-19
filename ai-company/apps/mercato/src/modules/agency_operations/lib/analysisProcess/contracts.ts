import { z } from 'zod'
import { researchRunRequestSchema, researchSteps } from '@/modules/agency_research/lib/contracts'

// Execution permission/budget comes from the trusted caller, never inferred from
// a portal offer preview, a document's status, or a model recommendation.
export const analysisExecutionPolicySchema = z.object({
  through: z.enum(researchSteps),
  maxCostPln: z.number().positive(),
  productSelection: researchRunRequestSchema.shape.order.shape.product_selection,
}).strict().superRefine((policy, context) => {
  if (!Number.isInteger(policy.productSelection.result_limits?.topics) || (policy.productSelection.result_limits?.topics ?? 0) <= 0) {
    context.addIssue({ code: 'custom', path: ['productSelection', 'result_limits', 'topics'], message: 'Explicit product topic limit required' })
  }
})

export const analysisMaterialSchema = researchRunRequestSchema.pick({ order: true, socialPosts: true, pages: true })
  .superRefine((material, context) => {
    const topics = material.order.product_selection.result_limits?.topics
    if (!Number.isInteger(topics) || (topics ?? 0) <= 0) {
      context.addIssue({ code: 'custom', path: ['order', 'product_selection', 'result_limits', 'topics'], message: 'The approved product must specify its topic limit; no default offer is assumed' })
    }
  })

export const analysisProcessResultSchema = z.object({
  caseId: z.uuid(),
  requestedThrough: z.enum(researchSteps),
  state: z.enum(['completed', 'waiting']),
  taskRunIds: z.array(z.string()),
  documentVersionIds: z.array(z.string()),
  agentRunIds: z.array(z.string()),
  spentPln: z.number(),
  completedThrough: z.enum(researchSteps).nullable(),
  qaVerdict: z.enum(['ready', 'to_fix', 'exception']).optional(),
  briefQaVerdict: z.enum(['ready_for_approval', 'needs_client_data', 'needs_agent_fix']).optional(),
  escalationVersionId: z.string().optional(),
})

export type AnalysisExecutionPolicy = z.infer<typeof analysisExecutionPolicySchema>
export type AnalysisProcessResult = z.infer<typeof analysisProcessResultSchema>
