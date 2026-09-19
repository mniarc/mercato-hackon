import type { PlanningReadiness, StrategyPairAcceptanceState } from '@/modules/agency_research/lib/contracts'

export const STRATEGY_PAIR_CONTINUATION_FUNCTION = 'agency_operations.continueStrategyPairApproval'
export const STRATEGY_PAIR_CONTINUATION_RESULT_KEY = 'agencyStrategyPairContinuation'

export type StrategyPairContinuation =
  | { status: 'not_ready'; orderRef: string; cumulative: Extract<StrategyPairAcceptanceState, { status: 'not_ready' }>; reason: Extract<StrategyPairAcceptanceState, { status: 'not_ready' }>['reason'] }
  | { status: 'partial'; orderRef: string; cumulative: Exclude<StrategyPairAcceptanceState, { status: 'not_ready' }>; followUpTask: { workflowInstanceId: string; taskId: string; replayed: boolean } }
  | { status: 'accepted'; orderRef: string; cumulative: Exclude<StrategyPairAcceptanceState, { status: 'not_ready' }>; planningReadiness: PlanningReadiness }
