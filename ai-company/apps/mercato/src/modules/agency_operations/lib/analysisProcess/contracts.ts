import { z } from 'zod'
import { researchRunRequestSchema, researchSteps } from '@/modules/agency_research/lib/contracts'

export const analysisIntakeSteps = ['3.2', '3.5', '3.8', '4.2'] as const

// Execution permission/budget comes from the trusted caller, never inferred from
// a portal offer preview, a document's status, or a model recommendation.
export const analysisExecutionPolicySchema = z.object({
  through: z.enum(analysisIntakeSteps),
  maxCostPln: z.number().positive(),
  briefRevision: z.object({ maxCostPln: z.number().positive() }).strict().optional(),
  materialRevision: z.object({ maxCostPln: z.number().positive() }).strict().optional(),
  strategyExecution: z.object({ maxCostPln: z.number().positive() }).strict().optional(),
  planningExecution: z.object({ maxCostPln: z.number().positive() }).strict().optional(),
  postExecution: z.object({ maxCostPln: z.number().positive() }).strict().optional(),
  postRevision: z.object({ maxCostPln: z.number().positive() }).strict().optional(),
  productSelection: researchRunRequestSchema.shape.order.shape.product_selection,
}).strict().superRefine((policy, context) => {
  if (policy.materialRevision && policy.through !== '4.2') {
    context.addIssue({ code: 'custom', path: ['materialRevision'], message: 'Material revision requires the brief review handoff' })
  }
  if (policy.briefRevision && policy.through !== '4.2') {
    context.addIssue({ code: 'custom', path: ['briefRevision'], message: 'Brief revision requires the brief review handoff' })
  }
  if (policy.strategyExecution && policy.through !== '4.2') {
    context.addIssue({ code: 'custom', path: ['strategyExecution'], message: 'Strategy continuation requires the brief review handoff' })
  }
  if (policy.planningExecution && policy.through !== '4.2') {
    context.addIssue({ code: 'custom', path: ['planningExecution'], message: 'Planning continuation requires the brief and strategy review handoffs' })
  }
  if (policy.postExecution && policy.through !== '4.2') {
    context.addIssue({ code: 'custom', path: ['postExecution'], message: 'Post continuation requires the accepted plan and instruction handoffs' })
  }
  if (policy.postRevision && policy.through !== '4.2') {
    context.addIssue({ code: 'custom', path: ['postRevision'], message: 'Post revision requires the exact post review handoff' })
  }
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
