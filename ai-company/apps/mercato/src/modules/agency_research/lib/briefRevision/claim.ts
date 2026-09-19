import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../data/entities'
import { fingerprint } from '../research/util'
import { startTaskRun, type ResearchScope, type StartTaskRunInput } from '../store'
import { briefRevisionOutcomeSchema, type BriefRevisionRequest, type BriefRevisionResult } from './contracts'

export const BRIEF_REVISION_STEP = '4.4'

export function revisionIdentity(request: BriefRevisionRequest): string {
  return fingerprint([request.orderRef, request.briefVersionId, request.source, request.originalText])
}

export async function savedBriefRevision(em: EntityManager, scope: ResearchScope, request: BriefRevisionRequest): Promise<BriefRevisionResult | null> {
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef: request.orderRef, stepId: BRIEF_REVISION_STEP,
  }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
  const run = runs.find((candidate) => (candidate.summary as Record<string, unknown> | null)?.submissionId === request.source.submissionId)
  if (!run) return null
  const summary = run.summary as Record<string, unknown>
  if (summary.requestHash !== revisionIdentity(request)) throw new Error('[internal] brief revision replay source differs from its saved directive')
  const result = briefRevisionOutcomeSchema.safeParse(summary.executionResult)
  if (result.success && result.data.submissionId === request.source.submissionId
    && result.data.taskRunIds.includes(run.id)
    && ((run.status === 'done' && result.data.status !== 'paused_budget') || (run.status === 'paused_budget' && result.data.status === 'paused_budget'))) return result.data
  return {
    status: 'execution_incomplete', orderRef: request.orderRef, activationTaskRunId: run.id,
    reason: run.status === 'running' ? 'in_progress_or_interrupted' : run.status === 'failed' ? 'failed' : 'result_unavailable',
  }
}

export async function claimBriefRevision(em: EntityManager, scope: ResearchScope, request: BriefRevisionRequest, task: StartTaskRunInput) {
  return em.transactional<{ activationTaskRunId: string } | { existing: BriefRevisionResult }>(async (transaction) => {
    const document = await findOneWithDecryption(transaction, AgencyResearchDocument, {
      ...scope, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const existing = await savedBriefRevision(transaction, scope, request)
    if (existing) return { existing }
    if (!document || document.currentVersionId !== request.briefVersionId) return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'brief_not_current' } }
    if (document.status !== 'ready_for_review') return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'brief_not_reviewable' } }
    const active = await findOneWithDecryption(transaction, AgencyResearchTaskRun, {
      ...scope, orderRef: request.orderRef, stepId: BRIEF_REVISION_STEP, status: 'running',
    }, undefined, scope)
    if (active) return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'revision_in_progress' } }
    const run = await startTaskRun(transaction, scope, task)
    run.summary = {
      submissionId: request.source.submissionId, requestHash: revisionIdentity(request),
      briefVersionId: request.briefVersionId, source: request.source, originalText: request.originalText,
      maxCostPln: request.maxCostPln,
    }
    await transaction.flush()
    return { activationTaskRunId: run.id }
  })
}
