import { z } from 'zod'
import { briefAcceptanceSourceSchema } from '../briefAcceptance/contracts'
import type { StrategyReviewVersion } from '../strategyReview/types'

export const planReviewRequestSchema = z.object({ orderRef: z.string().min(1), planVersionId: z.uuid() }).strict()
export type PlanReviewRequest = z.infer<typeof planReviewRequestSchema>
export const planAcceptanceRecordSchema = z.object({
  person: z.uuid(), at: z.iso.datetime(), scope: z.literal('plan'), version: z.string(), documentId: z.uuid(), documentVersionId: z.uuid(),
  approvePlan: z.literal(true), selectedTopicId: z.string().min(1),
  briefVersionId: z.uuid(), strategyVersionId: z.uuid(), tovVersionId: z.uuid(), qaTaskRunId: z.uuid(),
  source: briefAcceptanceSourceSchema.extend({ kind: z.literal('agency_plan_acceptance') }),
})
export type PlanAcceptanceRecord = z.infer<typeof planAcceptanceRecordSchema>
export const acceptPlanInputSchema = z.object({
  context: z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).strict(),
  request: z.object({ orderRef: z.string().min(1), documentId: z.uuid(), versionId: z.uuid(), customerUserId: z.uuid(),
    approvePlan: z.literal(true), selectedTopicId: z.string().trim().min(1), source: briefAcceptanceSourceSchema.omit({ kind: true }),
  }).strict(),
}).strict()
export type AcceptPlanInput = z.infer<typeof acceptPlanInputSchema>
export const planAcceptanceReceiptSchema = z.object({ status: z.literal('plan_accepted'), orderRef: z.string().min(1), record: planAcceptanceRecordSchema, replayed: z.boolean() })
export type PlanAcceptanceReceipt = z.infer<typeof planAcceptanceReceiptSchema>
export type PlanReviewNotReady = { status: 'not_ready'; orderRef: string; reason: 'plan_not_found' | 'plan_not_current' | 'plan_not_reviewable' | 'plan_invalid' | 'plan_qa_not_ready' | 'plan_foundations_not_accepted' | 'plan_dependencies_mismatch' | 'approval_record_missing' }
export type PlanReviewReady = {
  status: 'ready'; orderRef: string;
  plan: StrategyReviewVersion & { templateId: 'WZR-PLAN'; clientViewMd: string | null };
  topics: { topicId: string; title: string; recommended: boolean }[];
  recommendedTopicId: string; qaTaskRunId: string;
  briefVersionId: string; strategyVersionId: string; tovVersionId: string;
  receipt: PlanAcceptanceRecord | null;
}
export type PlanReview = PlanReviewReady | PlanReviewNotReady
export type PlanAcceptance = PlanReview
