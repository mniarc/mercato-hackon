import { z } from 'zod'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema } from '../../data/schemas/envelope'
import { limits } from '../../data/templates'
import { readPostReview } from '../postReview/read'
import { BudgetPausedError, createLedger } from '../research/ledger'
import { openEscalation } from '../research/escalate'
import type { StepContext } from '../research/steps/context'
import { runPostStep } from '../research/steps/post'
import { runPostQaLoop } from '../research/steps/postQa'
import { finishTaskRun } from '../store'
import type { RunStrategyExecutionOptions } from '../strategyExecution/run'
import { POST_REVISION_STEP, claimPostRevision, savedPostRevision } from './claim'
import { postRevisionRequestSchema, type PostRevisionRequest, type PostRevisionResult, type PostRevisionOutcome } from './contracts'

export type RunPostRevisionOptions = Omit<RunStrategyExecutionOptions, 'request'> & { request: PostRevisionRequest }

/** Trusted G adapter authorizes this exact content-only directive and revision cap before invoking the native runner. */
export async function runPostRevision(opts: RunPostRevisionOptions): Promise<PostRevisionResult> {
  const request = postRevisionRequestSchema.parse(opts.request)
  const { em, scope } = opts
  const saved = await savedPostRevision(em, scope, request)
  if (saved) return saved
  const postQaRepairAttempts = limits.content.postRepairAttempts
  const claim = await claimPostRevision(em, scope, request, opts.models, postQaRepairAttempts)
  if ('existing' in claim) return claim.existing
  const { ready } = claim
  const activation = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef: request.orderRef, id: claim.activationTaskRunId, stepId: POST_REVISION_STEP,
  }, undefined, scope)
  if (!activation) throw new Error('[internal] Post revision activation record is missing')
  const summary = activation.summary as Record<string, unknown>
  const taskRunIds = [activation.id]
  const documentVersionIds: string[] = []
  const agentRunIds = opts.agentRunIds ?? []
  const onEvent = opts.onEvent ?? (() => {})
  const ledger = createLedger({ maxPln: request.maxCostPln, onEvent })
  const postOutputs: NonNullable<StepContext['postOutputs']> = { post: ready.previousPost }
  const ctx: StepContext = {
    em, scope, orderRef: request.orderRef, order: ready.order,
    orderVersion: { document_id: ready.orderInput.document_id, version: ready.orderInput.version, status: ready.orderInput.status },
    runAgent: opts.runAgent, runner: opts.runner, models: opts.models, ledger, cache: opts.cache, onEvent,
    log: opts.log ?? (() => {}), agentRunIds, taskRunIds, documentVersionIds,
    fetchPage: async () => { throw new Error('[internal] Post content revision cannot fetch new research') },
    repairFindings: [{ code: 'other', path: 'KLI-POST.text', severity: 'major', owner: 'client', fix_step: '7.2',
      gap: 'Saved client content-change directive for this exact post version.', fix_hint: request.originalText }],
    attempt: 1, postInputs: { instruction: ready.instruction, tov: ready.tov }, postOutputs, postQaRepairAttempts,
  }
  const result = (status: 'completed' | 'paused_budget'): PostRevisionOutcome => ({
    status, orderRef: request.orderRef, submissionId: request.source.submissionId,
    previousPostVersionId: request.postVersionId, instructionVersionId: ready.instruction.versionId,
    taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total,
    postVersionId: postOutputs.post?.versionId === request.postVersionId ? null : postOutputs.post?.versionId ?? null,
    qaTaskRunId: null, qaVerdict: null, readyForReview: false,
  })
  const persist = async (outcome: PostRevisionOutcome) => {
    await finishTaskRun(em, activation, { status: outcome.status === 'completed' ? 'done' : 'paused_budget',
      outputVersionId: outcome.postVersionId, summary: { ...summary, executionResult: outcome }, agentRunIds, cost: ledger.snapshot() })
    return outcome
  }
  try {
    await runPostStep(ctx)
    const qa = await runPostQaLoop(ctx, { postStep: runPostStep })
    const review = qa.postVersionId ? await readPostReview(em, scope, request.orderRef, qa.postVersionId) : null
    const readyForReview = Boolean(review?.isCurrent && !review.simulationFlag && review.documentStatus === 'ready_for_review'
      && review.versionStatus === 'ready_for_review' && review.qa.state === 'assessed'
      && review.qa.taskRunId === qa.taskRunId && review.qa.verdict === 'pass_for_draft')
    return await persist({ ...result('completed'), postVersionId: qa.postVersionId, qaTaskRunId: qa.taskRunId,
      qaVerdict: qa.verdict, readyForReview, ...(qa.escalationVersionId ? { escalationVersionId: qa.escalationVersionId } : {}) })
  } catch (error) {
    if (error instanceof BudgetPausedError) {
      const paused = await findOneWithDecryption(em, AgencyResearchTaskRun, {
        ...scope, orderRef: request.orderRef, id: { $in: taskRunIds }, status: 'paused_budget',
      }, { orderBy: { createdAt: 'desc' } }, scope)
      if (!paused) throw new Error('[internal] Post revision budget pause requires persisted task evidence')
      const escalation = await openEscalation(ctx, {
        code: 'budget_exhausted', triggerStep: paused.stepId,
        summary: `Post revision paused during ${paused.stepId}: ${error.snapshot.total.toFixed(2)} PLN spent of ${error.snapshot.cap} PLN; next call estimated ${error.nextEstimatePln.toFixed(2)} PLN.`,
        evidence: [{ ref: paused.id, fact: 'Saved revision task and configured cap; prior post and original client directive remain available.' }],
        blockedSteps: [paused.stepId, '7.4', '8.1'],
        decisionQuestion: 'Who will own this revision budget block while authorized producer recovery remains unavailable?',
        allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: 'The reason and who must act.', permittedNextStep: 'none' }],
        resumeStep: paused.stepId,
      }, z.array(inputVersionSchema).parse(paused.inputVersions))
      return persist({ ...result('paused_budget'), escalationVersionId: escalation.versionId })
    }
    getTelemetryRuntime()?.reportError(error, { module: 'agency_research', code: 'agency_research.post_revision_failed' })
    await finishTaskRun(em, activation, { status: 'failed', summary, agentRunIds, cost: ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
