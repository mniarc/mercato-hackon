import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../data/entities'
import type { InputVersion } from '../../data/schemas/envelope'
import { startTaskRun, type ResearchScope } from '../store'
import type { ModelSet } from '../research/pipeline'
import { postExecutionOutcomeSchema, type PostExecutionRequest, type PostExecutionResult } from './contracts'
import { readPostExecutionInputs, type PostExecutionReady } from './readiness'

export async function savedPostExecution(em: EntityManager, scope: ResearchScope, request: PostExecutionRequest): Promise<PostExecutionResult | null> {
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...scope, orderRef: request.orderRef, stepId: '7.1' }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
  const run = runs.find((candidate) => {
    const summary = candidate.summary as Record<string, unknown> | null
    const process = summary?.process as Record<string, unknown> | undefined
    return summary?.instructionVersionId === request.instructionVersionId && summary?.selectionSubmissionId === request.selectionSubmissionId
      && process?.workflowDefinitionId === request.process.workflowDefinitionId && process?.workflowId === request.process.workflowId && process?.version === request.process.version
  })
  if (!run) return null
  const result = postExecutionOutcomeSchema.safeParse((run.summary as Record<string, unknown>).executionResult)
  if (result.success && result.data.orderRef === request.orderRef && result.data.instructionVersionId === request.instructionVersionId
    && result.data.selectionSubmissionId === request.selectionSubmissionId && result.data.taskRunIds.includes(run.id)
    && ((run.status === 'done' && result.data.status === 'completed') || (run.status === 'paused_budget' && result.data.status === 'paused_budget'))) return result.data
  return { status: 'execution_incomplete', orderRef: request.orderRef, activationTaskRunId: run.id,
    reason: run.status === 'running' ? 'in_progress_or_interrupted' : run.status === 'failed' ? 'failed' : 'result_unavailable' }
}

export async function claimPostExecution(em: EntityManager, scope: ResearchScope, request: PostExecutionRequest, models: ModelSet, repairAttempts: number): Promise<
  { activationTaskRunId: string; ready: PostExecutionReady; summary: Record<string, unknown> } | { existing: PostExecutionResult }
> {
  return em.transactional(async (transaction) => {
    const brief = await findOneWithDecryption(transaction, AgencyResearchDocument, {
      ...scope, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!brief) return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'brief_not_current_or_accepted' } } as const
    const existing = await savedPostExecution(transaction, scope, request)
    if (existing) return { existing }
    const ready = await readPostExecutionInputs(transaction, scope, request)
    if (ready.status === 'not_ready') return { existing: ready }
    const summary = { process: request.process, instructionVersionId: request.instructionVersionId,
      selectionSubmissionId: request.selectionSubmissionId, planVersionId: ready.planVersionId, selectedTopicId: ready.selectedTopicId,
      instructionTaskRunId: ready.instructionTaskRunId, tovVersionId: ready.tov.versionId, orderVersionId: ready.orderInput.versionId,
      limits: { maxCostPln: request.maxCostPln, postRepairAttempts: repairAttempts }, steps: ['7.2', '7.3'] }
    const pin = ({ document_id, version, status }: InputVersion): InputVersion => ({ document_id, version, status })
    const activation = await startTaskRun(transaction, scope, { orderRef: request.orderRef, brand: ready.order.brand,
      stepId: '7.1', attempt: 1, runner: 'system', models, inputVersions: [ready.orderInput, ready.instruction, ready.tov].map(pin) })
    activation.summary = summary
    await transaction.flush()
    return { activationTaskRunId: activation.id, ready, summary }
  })
}
