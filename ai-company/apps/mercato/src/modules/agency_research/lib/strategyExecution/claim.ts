import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../data/entities'
import { startTaskRun, type ResearchScope, type StartTaskRunInput } from '../store'
import { strategyExecutionOutcomeSchema, type StrategyExecutionRequest, type StrategyExecutionResult } from './contracts'

export async function savedStrategyExecution(em: EntityManager, scope: ResearchScope, request: StrategyExecutionRequest): Promise<StrategyExecutionResult | null> {
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef: request.orderRef, stepId: '5.1',
  }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
  const run = runs.find((candidate) => {
    const summary = candidate.summary as Record<string, unknown> | null
    const specialist = summary?.specialistTov as { versionId?: string } | undefined
    return summary?.briefVersionId === request.briefVersionId && summary?.acceptanceSubmissionId === request.acceptanceSubmissionId
      && (!request.specialistTov || specialist?.versionId === request.specialistTov.versionId)
  })
  if (!run) return null
  const summary = run.summary as Record<string, unknown>
  const result = strategyExecutionOutcomeSchema.safeParse(summary.executionResult)
  if (result.success && result.data.orderRef === request.orderRef && result.data.taskRunIds.includes(run.id)
    && ((run.status === 'done' && result.data.status === 'completed') || (run.status === 'paused_budget' && result.data.status === 'paused_budget'))) {
    return result.data
  }
  return {
    status: 'execution_incomplete', orderRef: request.orderRef, activationTaskRunId: run.id,
    reason: run.status === 'running' ? 'in_progress_or_interrupted' : run.status === 'failed' ? 'failed' : 'result_unavailable',
  }
}

export async function claimStrategyExecution(
  em: EntityManager,
  scope: ResearchScope,
  request: StrategyExecutionRequest,
  task: StartTaskRunInput,
  summary: Record<string, unknown>,
): Promise<{ activationTaskRunId: string } | { existing: StrategyExecutionResult }> {
  return em.transactional<{ activationTaskRunId: string } | { existing: StrategyExecutionResult }>(async (transaction) => {
    const document = await findOneWithDecryption(transaction, AgencyResearchDocument, {
      ...scope, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!document) return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'brief_not_found' } }
    const existing = await savedStrategyExecution(transaction, scope, request)
    if (existing) return { existing }
    if (document.currentVersionId !== request.briefVersionId) {
      return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'brief_not_current' } }
    }
    if (document.status !== 'approved') return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'brief_not_approved' } }
    const activation = await startTaskRun(transaction, scope, task)
    activation.summary = summary
    await transaction.flush()
    return { activationTaskRunId: activation.id }
  })
}
