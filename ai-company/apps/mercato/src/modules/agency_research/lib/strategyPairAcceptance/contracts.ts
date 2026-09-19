import { z } from 'zod'
import { briefAcceptanceSourceSchema } from '../briefAcceptance/contracts'
import type { StrategyReviewVersion } from '../strategyReview/types'

export const pairDocumentKinds = ['strategy', 'tov'] as const
export type PairDocumentKind = (typeof pairDocumentKinds)[number]
const referenceSchema = z.object({ documentId: z.uuid(), versionId: z.uuid() }).strict()
export const strategyPairReferenceSchema = z.object({ strategy: referenceSchema, tov: referenceSchema }).strict()
const selectedSchema = z.array(z.enum(pairDocumentKinds)).min(1).max(2).refine((selected) => new Set(selected).size === selected.length, 'Selections must be unique')
export const strategyPairAcceptanceRecordSchema = z.object({
  person: z.uuid(), at: z.iso.datetime(), scope: z.enum(pairDocumentKinds), version: z.string().regex(/^[1-9]\d*\.0$/), documentVersionId: z.uuid(),
  briefVersionId: z.uuid(), pair: strategyPairReferenceSchema, approvedDocuments: selectedSchema,
  source: briefAcceptanceSourceSchema.extend({ kind: z.literal('agency_strategy_pair_acceptance') }),
})
export const acceptStrategyPairInputSchema = z.object({
  context: z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).strict(),
  request: z.object({ orderRef: z.string().min(1), pair: strategyPairReferenceSchema, approvedDocuments: selectedSchema,
    customerUserId: z.uuid(), source: briefAcceptanceSourceSchema.omit({ kind: true }),
  }).strict(),
}).strict()
export const strategyPairAcceptanceRequestSchema = z.object({ orderRef: z.string().min(1), strategyVersionId: z.uuid(), tovVersionId: z.uuid() }).strict()
export type AcceptStrategyPairInput = z.infer<typeof acceptStrategyPairInputSchema>
export type StrategyPairAcceptanceRequest = z.infer<typeof strategyPairAcceptanceRequestSchema>
export type StrategyPairAcceptanceRecord = z.infer<typeof strategyPairAcceptanceRecordSchema>
export const strategyPairAcceptanceReceiptSchema = z.object({
  status: z.literal('recorded'), orderRef: z.string().min(1), pair: strategyPairReferenceSchema,
  approvedDocuments: selectedSchema, records: z.array(strategyPairAcceptanceRecordSchema).min(1).max(2), replayed: z.boolean(),
})
export type StrategyPairAcceptanceReceipt = z.infer<typeof strategyPairAcceptanceReceiptSchema>
export type PairAcceptanceReason = 'pair_not_found' | 'pair_not_current' | 'pair_not_reviewable' | 'pair_qa_not_ready'
  | 'pair_dependency_mismatch' | 'brief_not_current_or_accepted' | 'approval_record_missing'
export type StrategyPairAcceptanceState =
  | { status: 'not_ready'; orderRef: string; reason: PairAcceptanceReason }
  | {
    status: 'partial' | 'accepted'; orderRef: string;
    pair: { strategy: StrategyReviewVersion & { templateId: 'WZR-STRATEGIA' }; tov: StrategyReviewVersion & { templateId: 'WZR-TOV' } };
    brief: StrategyReviewVersion; qaTaskRunId: string;
    acceptances: { strategy: StrategyPairAcceptanceRecord | null; tov: StrategyPairAcceptanceRecord | null };
    remainingDocuments: PairDocumentKind[];
  }
