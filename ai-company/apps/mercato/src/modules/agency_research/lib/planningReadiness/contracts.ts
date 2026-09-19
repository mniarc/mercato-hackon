import { strategyProcessReferenceSchema } from '../strategyReadiness/contracts'
import type { StrategyProcessReference } from '../strategyReadiness/contracts'
import { strategyPairAcceptanceRequestSchema, type StrategyPairAcceptanceState, type PairDocumentKind } from '../strategyPairAcceptance/contracts'
import type { z } from 'zod'

export const planningReadinessRequestSchema = strategyPairAcceptanceRequestSchema.extend({ process: strategyProcessReferenceSchema.optional() })
export type PlanningReadinessRequest = z.infer<typeof planningReadinessRequestSchema>
export type PlanningReadiness =
  | Extract<StrategyPairAcceptanceState, { status: 'not_ready' }>
  | { status: 'not_ready'; orderRef: string; reason: 'missing_process_configuration' | 'pair_acceptance_incomplete'; remainingDocuments?: PairDocumentKind[] }
  | { status: 'ready'; orderRef: string; process: StrategyProcessReference; accepted: Exclude<StrategyPairAcceptanceState, { status: 'not_ready' }> & { status: 'accepted' } }
