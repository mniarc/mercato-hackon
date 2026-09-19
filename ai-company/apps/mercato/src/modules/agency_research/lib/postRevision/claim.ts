import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../data/entities'
import type { InputVersion } from '../../data/schemas/envelope'
import type { ModelSet } from '../research/pipeline'
import { fingerprint } from '../research/util'
import { startTaskRun, type ResearchScope } from '../store'
import { postRevisionOutcomeSchema, type PostRevisionRequest, type PostRevisionResult } from './contracts'
import { readPostRevisionInputs, type PostRevisionReady } from './readiness'

export const POST_REVISION_STEP = '7.5'

function requestIdentity({ maxCostPln: _cap, ...directive }: PostRevisionRequest): string {
  return fingerprint(directive)
}

export async function savedPostRevision(em: EntityManager, scope: ResearchScope, request: PostRevisionRequest): Promise<PostRevisionResult | null> {
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...scope, orderRef: request.orderRef, stepId: POST_REVISION_STEP }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
  const run = runs.find((candidate) => (candidate.summary as Record<string, unknown> | null)?.submissionId === request.source.submissionId)
  if (!run) return null
  const summary = run.summary as Record<string, unknown>
  if (summary.requestHash !== requestIdentity(request)) throw new Error('[internal] Post revision replay differs from its saved client directive')
  const parsed = postRevisionOutcomeSchema.safeParse(summary.executionResult)
  if (parsed.success && parsed.data.orderRef === request.orderRef && parsed.data.submissionId === request.source.submissionId
    && parsed.data.previousPostVersionId === request.postVersionId && parsed.data.taskRunIds.includes(run.id)
    && ((run.status === 'done' && parsed.data.status === 'completed') || (run.status === 'paused_budget' && parsed.data.status === 'paused_budget'))) return parsed.data
  return { status: 'execution_incomplete', orderRef: request.orderRef, activationTaskRunId: run.id,
    reason: run.status === 'running' ? 'in_progress_or_interrupted' : run.status === 'failed' ? 'failed' : 'result_unavailable' }
}

export async function claimPostRevision(em: EntityManager, scope: ResearchScope, request: PostRevisionRequest, models: ModelSet, repairAttempts: number): Promise<
  { activationTaskRunId: string; ready: PostRevisionReady } | { existing: PostRevisionResult }
> {
  return em.transactional(async (transaction) => {
    const post = await findOneWithDecryption(transaction, AgencyResearchDocument, {
      ...scope, orderRef: request.orderRef, templateId: 'WZR-POST', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const existing = await savedPostRevision(transaction, scope, request)
    if (existing) return { existing }
    if (!post || post.currentVersionId !== request.postVersionId) return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'post_not_current' } } as const
    const active = await findOneWithDecryption(transaction, AgencyResearchTaskRun, {
      ...scope, orderRef: request.orderRef, stepId: POST_REVISION_STEP, status: 'running',
    }, undefined, scope)
    if (active) return { existing: { status: 'not_ready', orderRef: request.orderRef, reason: 'revision_in_progress' } } as const
    const ready = await readPostRevisionInputs(transaction, scope, request)
    if (ready.status === 'not_ready') return { existing: ready }
    const pin = ({ document_id, version, status }: InputVersion): InputVersion => ({ document_id, version, status })
    const activation = await startTaskRun(transaction, scope, { orderRef: request.orderRef, brand: ready.order.brand,
      stepId: POST_REVISION_STEP, attempt: 1, runner: 'system', models,
      inputVersions: [ready.orderInput, ready.instruction, ready.tov, ready.previousPost].map(pin) })
    activation.summary = { submissionId: request.source.submissionId, requestHash: requestIdentity(request),
      source: request.source, originalText: request.originalText, previousPostVersionId: request.postVersionId,
      instructionVersionId: ready.instruction.versionId, selectionSubmissionId: ready.selectionSubmissionId,
      process: request.process, limits: { maxCostPln: request.maxCostPln, postRepairAttempts: repairAttempts } }
    await transaction.flush()
    return { activationTaskRunId: activation.id, ready }
  })
}
