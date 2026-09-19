import type { SpecialistTovReference } from '@/modules/agency_tov/lib/documentVersion/contracts'
import type { QaFinding } from '../../data/schemas/qa'

export type StrategyReviewVersion = {
  documentId: string
  versionId: string
  version: string
  isCurrent: boolean
  documentStatus: string
  versionStatus: string
  simulationFlag: boolean
  specialistReference?: SpecialistTovReference
}

export type StrategyReviewQa =
  | { state: 'missing' }
  | { state: 'unavailable'; taskRunId: string; status: string }
  | { state: 'assessed'; taskRunId: string; status: 'done' | 'to_fix'; verdict: 'ready_for_approval' | 'needs_agent_fix'; findings?: QaFinding[] }

/** Stored pair and QA evidence; customer acceptance remains a separate record. */
export type StrategyReviewProjection = {
  orderRef: string
  strategy: StrategyReviewVersion & { templateId: 'WZR-STRATEGIA'; clientViewMd: string | null }
  tov: StrategyReviewVersion & { templateId: 'WZR-TOV'; clientViewMd: string | null }
  qa: StrategyReviewQa
  tovUsesStrategy: boolean
  brief: StrategyReviewVersion | null
}
