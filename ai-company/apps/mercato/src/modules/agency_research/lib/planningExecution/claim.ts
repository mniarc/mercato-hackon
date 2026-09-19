import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../data/entities'
import { startTaskRun, type ResearchScope, type StartTaskRunInput } from '../store'
import { readPlanningReadiness } from '../planningReadiness/read'
import { planningExecutionOutcomeSchema, type PlanningExecutionRequest, type PlanningExecutionResult } from './contracts'

export async function savedPlanningExecution(em: EntityManager, scope: ResearchScope, request: PlanningExecutionRequest): Promise<PlanningExecutionResult | null> {
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...scope, orderRef: request.orderRef, stepId: '6.1' }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
  const run = runs.find((candidate) => {
    const summary = candidate.summary as Record<string, unknown> | null
    const process = summary?.process as Record<string, unknown> | undefined
    return summary?.strategyVersionId === request.strategyVersionId && summary?.tovVersionId === request.tovVersionId
      && process?.workflowDefinitionId === request.process.workflowDefinitionId && process?.workflowId === request.process.workflowId && process?.version === request.process.version
  })
  if (!run) return null
  const result = planningExecutionOutcomeSchema.safeParse((run.summary as Record<string, unknown>).executionResult)
  if (result.success && result.data.orderRef === request.orderRef && result.data.strategyVersionId === request.strategyVersionId
    && result.data.tovVersionId === request.tovVersionId && result.data.taskRunIds.includes(run.id)
    && ((run.status === 'done' && result.data.status === 'completed') || (run.status === 'paused_budget' && result.data.status === 'paused_budget'))) return result.data
  return { status: 'execution_incomplete', orderRef: request.orderRef, activationTaskRunId: run.id,
    reason: run.status === 'running' ? 'in_progress_or_interrupted' : run.status === 'failed' ? 'failed' : 'result_unavailable' }
}

export async function claimPlanningExecution(em: EntityManager, scope: ResearchScope, request: PlanningExecutionRequest, task: StartTaskRunInput, summary: Record<string, unknown>): Promise<{ activationTaskRunId: string } | { existing: PlanningExecutionResult }> {
  return em.transactional(async (transaction) => {
    // The same brief-first lock order as pair acceptance; never hold locks over model calls.
    const brief = await findOneWithDecryption(transaction, AgencyResearchDocument, {
      ...scope, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!brief) return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'brief_not_current_or_accepted' } } as const
    const existing = await savedPlanningExecution(transaction, scope, request)
    if (existing) return { existing }
    const { maxCostPln: _budget, ...readinessRequest } = request
    const ready = await readPlanningReadiness(transaction, scope, readinessRequest)
    if (ready.status === 'not_ready') return { existing: ready }
    const activation = await startTaskRun(transaction, scope, task)
    activation.summary = summary
    await transaction.flush()
    return { activationTaskRunId: activation.id }
  })
}
