import type { EntityManager } from '@mikro-orm/postgresql'
import type { ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { readStrategyPairAcceptance } from '../strategyPairAcceptance/read'
import { planningReadinessRequestSchema, type PlanningReadiness } from './contracts'

/** Read-only 5.8 handoff. Does not generate a plan or seek new client consent. */
export async function readPlanningReadiness(em: EntityManager, scope: { tenantId: string; organizationId: string }, rawInput: unknown, readSpecialistTov?: ReadSpecialistTov): Promise<PlanningReadiness> {
  const input = planningReadinessRequestSchema.parse(rawInput)
  if (!input.process) return { status: 'not_ready', orderRef: input.orderRef, reason: 'missing_process_configuration' }
  const acceptanceInput = {
    orderRef: input.orderRef, strategyVersionId: input.strategyVersionId, tovVersionId: input.tovVersionId,
  }
  const accepted = readSpecialistTov
    ? await readStrategyPairAcceptance(em, scope, acceptanceInput, readSpecialistTov)
    : await readStrategyPairAcceptance(em, scope, acceptanceInput)
  if (accepted.status === 'not_ready') return accepted
  if (accepted.status !== 'accepted') return { status: 'not_ready', orderRef: input.orderRef, reason: 'pair_acceptance_incomplete', remainingDocuments: accepted.remainingDocuments }
  return { status: 'ready', orderRef: input.orderRef, process: input.process, accepted: { ...accepted, status: 'accepted' } }
}
