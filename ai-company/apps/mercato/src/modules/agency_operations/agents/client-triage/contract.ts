import { z } from 'zod'
import { clientSubmissionRequestSchema } from '../../lib/contracts/clientSubmission'
import { materialRevisionDirectiveSchema } from '@/modules/agency_research/lib/materialRevision/contracts'
import { materialContextSchema } from '../../lib/materialRevision/input'
import { tovChangeDirectiveSchema } from '../../lib/tovRevision/contracts'

export const sourceStoryIds = ['F42-1', 'F42-2', 'F40-2', 'F44-2', 'F47-1', 'F57-1'] as const

export const CLIENT_TRIAGE_AGENT_ID = 'agency_operations.client_triage'

export const inputSchema = z.object({
  original: clientSubmissionRequestSchema.transform(({ scaffoldScenario: _scaffoldScenario, ...original }) => original),
  materialContext: materialContextSchema.nullish(),
}).strict().transform(({ materialContext, ...input }) => materialContext ? { ...input, materialContext } : input)

export type ClientTriageInput = z.infer<typeof inputSchema>

export const clientTriageIntentSchema = z.enum(['question', 'material', 'change', 'approval', 'problem', 'hold'])
export const clientTriageRecommendationSchema = z.enum(['answer', 'clarify', 'refuse_extension', 'change', 'approve', 'hold', 'escalate'])

export const clientTriageInterpretationSchema = z.object({
  parts: z.array(z.object({
    intent: clientTriageIntentSchema.nullable(),
    summary: z.string().min(1),
    rationale: z.string().min(1),
    needsClarification: z.boolean(),
    recommendedDisposition: clientTriageRecommendationSchema,
  }).strict()).min(1),
  rationale: z.string().min(1),
  recommendedDisposition: clientTriageRecommendationSchema,
  responseMessage: z.string().min(1).nullable(),
  changeScope: z.enum(['post_content', 'upstream', 'uncertain']).optional(),
  materialDirective: materialRevisionDirectiveSchema.optional(),
  tovDirective: tovChangeDirectiveSchema.optional(),
}).strict()

export const clientTriageScopeSchema = z.object({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  customerEntityId: z.uuid(),
  caseId: z.uuid(),
  submissionId: z.uuid(),
  workflowInstanceId: z.uuid(),
}).strict()

export const clientTriageResultSchema = z.object({
  source: z.literal('native_agent'),
  workerId: z.literal(CLIENT_TRIAGE_AGENT_ID),
  scope: clientTriageScopeSchema,
  interpretation: clientTriageInterpretationSchema,
  disposition: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('answer'), targetStepId: z.literal('answered') }).strict(),
    z.object({ kind: z.literal('clarify'), targetStepId: z.literal('client_reply') }).strict(),
    z.object({ kind: z.literal('change'), targetStepId: z.enum(['brief_revision', 'post_revision', 'material_revision', 'tov_revision']) }).strict(),
    z.object({ kind: z.literal('approve'), targetStepId: z.enum(['brief_accepted', 'strategy_pair_decision', 'plan_topic_decision', 'post_content_decision']) }).strict(),
  ]).nullable(),
  unappliedReason: z.enum(['unsupported_disposition', 'mixed_dispositions', 'uncertainty_not_clarified', 'target_not_authorized', 'missing_response']).nullable(),
  effectsApplied: z.literal(false),
}).strict()

export type ClientTriageInterpretation = z.infer<typeof clientTriageInterpretationSchema>
export type ClientTriageScope = z.infer<typeof clientTriageScopeSchema>
export type ClientTriageResult = z.infer<typeof clientTriageResultSchema>
export type ClientTriageAllowedTarget = 'answered' | 'client_reply' | 'brief_revision' | 'post_revision' | 'material_revision' | 'tov_revision' | 'brief_accepted' | 'strategy_pair_decision' | 'plan_topic_decision' | 'post_content_decision'

export const outputSchema = clientTriageInterpretationSchema
