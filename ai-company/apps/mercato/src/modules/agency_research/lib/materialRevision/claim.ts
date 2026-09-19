import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../data/entities'
import { fingerprint } from '../research/util'
import { startTaskRun, type ResearchScope, type StartTaskRunInput } from '../store'
import { materialRevisionOutcomeSchema, type MaterialRevisionRequest, type MaterialRevisionResult } from './contracts'

export const MATERIAL_REVISION_STEP = '4.5'
export async function savedMaterialRevision(em: EntityManager, scope: ResearchScope, request: MaterialRevisionRequest): Promise<MaterialRevisionResult | null> {
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...scope, orderRef: request.orderRef, stepId: MATERIAL_REVISION_STEP }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
  const run = runs.find((item) => (item.summary as Record<string, unknown> | null)?.submissionId === request.source.submissionId)
  if (!run) return null
  const summary = run.summary as Record<string, unknown>
  if (summary.requestHash !== fingerprint(request)) throw new Error('[internal] material revision replay differs from the saved directive')
  const result = materialRevisionOutcomeSchema.safeParse(summary.executionResult)
  if (result.success && result.data.submissionId === request.source.submissionId && result.data.taskRunIds.includes(run.id)
    && ((run.status === 'done' && result.data.status !== 'paused_budget') || (run.status === 'paused_budget' && result.data.status === 'paused_budget'))) return result.data
  return { status: 'execution_incomplete', orderRef: request.orderRef, activationTaskRunId: run.id,
    reason: run.status === 'running' ? 'in_progress_or_interrupted' : run.status === 'failed' ? 'failed' : 'result_unavailable' }
}

export async function claimMaterialRevision(em: EntityManager, scope: ResearchScope, request: MaterialRevisionRequest, task: StartTaskRunInput) {
  return em.transactional<{ activationTaskRunId: string } | { existing: MaterialRevisionResult }>(async (tx) => {
    const document = await findOneWithDecryption(tx, AgencyResearchDocument, { ...scope, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const replay = await savedMaterialRevision(tx, scope, request)
    if (replay) return { existing: replay }
    const blocked = (reason: Extract<MaterialRevisionResult, { status: 'not_ready' }>['reason']) => ({ existing: { status: 'not_ready' as const, orderRef: request.orderRef, reason } })
    if (!document || document.currentVersionId !== request.briefVersionId) return blocked('brief_not_current')
    if (document.status !== 'ready_for_review') return blocked('brief_not_reviewable')
    const downstream = await findOneWithDecryption(tx, AgencyResearchDocument, { ...scope, orderRef: request.orderRef, templateId: { $in: ['WZR-STRATEGIA', 'WZR-TOV', 'WZR-PLAN', 'WZR-POST'] }, deletedAt: null }, undefined, scope)
    if (downstream) return blocked('downstream_exists')
    const active = await findOneWithDecryption(tx, AgencyResearchTaskRun, { ...scope, orderRef: request.orderRef, stepId: { $in: ['4.4', '4.5'] }, status: 'running' }, undefined, scope)
    if (active) return blocked('revision_in_progress')
    const run = await startTaskRun(tx, scope, task)
    run.summary = { submissionId: request.source.submissionId, requestHash: fingerprint(request), briefVersionId: request.briefVersionId,
      source: request.source, attachmentId: request.material.attachmentId, directive: request.directive, maxCostPln: request.maxCostPln }
    // Native acceptance requires ready_for_review. No lock is held during agent calls;
    // only the parent availability changes, never the prior version or its approvals.
    document.status = 'draft'
    await tx.flush()
    return { activationTaskRunId: run.id }
  })
}
