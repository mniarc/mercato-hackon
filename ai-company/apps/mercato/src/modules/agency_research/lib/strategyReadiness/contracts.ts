import { z } from 'zod'
import type { BriefAcceptanceRecord } from '../briefAcceptance/contracts'

// Resolved by the trusted native caller from the case's pinned workflow, never
// from client input. This identifies STD-PROCES; it is not a spend authorization.
export const strategyProcessReferenceSchema = z.object({
  workflowDefinitionId: z.uuid(),
  workflowId: z.string().min(1),
  version: z.number().int().positive(),
})
export type StrategyProcessReference = z.infer<typeof strategyProcessReferenceSchema>

export const strategyReadinessRequestSchema = z.object({
  orderRef: z.string().min(1),
  briefVersionId: z.uuid(),
  acceptanceSubmissionId: z.uuid(),
  process: strategyProcessReferenceSchema.optional(),
})
export type StrategyReadinessRequest = z.infer<typeof strategyReadinessRequestSchema>

export type StrategyDocumentReference = {
  documentId: string
  versionId: string
  documentRef: string
  version: string
  templateId: string
}

export type StrategyReadinessReason =
  | 'missing_process_configuration'
  | 'brief_not_found'
  | 'brief_not_current'
  | 'brief_not_approved'
  | 'acceptance_not_found'
  | 'frozen_analysis_not_found'
  | 'frozen_analysis_invalid'
  | 'analysis_qa_not_ready'
  | 'analysis_qa_versions_mismatch'
  | 'analysis_version_not_found'
  | 'analysis_not_current'
  | 'analysis_requires_review'
  | 'brief_dependencies_mismatch'

export type StrategyReadiness =
  | { status: 'not_ready'; orderRef: string; reason: StrategyReadinessReason; templateId?: string }
  | {
      status: 'ready'
      orderRef: string
      brief: StrategyDocumentReference
      acceptance: BriefAcceptanceRecord
      analysis: {
        freezeTaskRunId: string
        qaTaskRunId: string
        setHash: string
        documents: StrategyDocumentReference[]
      }
      process: StrategyProcessReference
    }
