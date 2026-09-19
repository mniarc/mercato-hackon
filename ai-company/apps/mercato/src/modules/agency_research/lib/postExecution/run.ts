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
import { claimPostExecution, savedPostExecution } from './claim'
import { postExecutionRequestSchema, type PostExecutionRequest, type PostExecutionResult, type PostExecutionOutcome } from './contracts'

export type RunPostExecutionOptions = Omit<RunStrategyExecutionOptions, 'request'> & { request: PostExecutionRequest }

/** 7.1–7.3 only: a reviewed draft is neither customer acceptance nor publication consent. */
export async function runPostExecution(opts: RunPostExecutionOptions): Promise<PostExecutionResult> {
  const request = postExecutionRequestSchema.parse(opts.request)
  const { em, scope } = opts
  const { orderRef } = request
  const saved = await savedPostExecution(em, scope, request)
  if (saved) return saved
  const postQaRepairAttempts = limits.content.postRepairAttempts
  const claim = await claimPostExecution(em, scope, request, opts.models, postQaRepairAttempts)
  if ('existing' in claim) return claim.existing
  const { ready, summary } = claim
  const taskRunIds = [claim.activationTaskRunId]
  const documentVersionIds: string[] = []
  const agentRunIds = opts.agentRunIds ?? []
  const onEvent = opts.onEvent ?? (() => {})
  const ledger = createLedger({ maxPln: request.maxCostPln, onEvent })
  const postOutputs: NonNullable<StepContext['postOutputs']> = { post: null }
  const activation = await findOneWithDecryption(em, AgencyResearchTaskRun, { ...scope, orderRef, id: claim.activationTaskRunId, stepId: '7.1' }, undefined, scope)
  if (!activation) throw new Error('[internal] post activation record is missing')
  const persist = async (outcome: PostExecutionOutcome) => {
    await finishTaskRun(em, activation, { status: outcome.status === 'completed' ? 'done' : 'paused_budget',
      summary: { ...summary, executionResult: outcome }, agentRunIds, cost: ledger.snapshot() })
    return outcome
  }
  const ctx: StepContext = {
    em, scope, orderRef, order: ready.order,
    orderVersion: { document_id: ready.orderInput.document_id, version: ready.orderInput.version, status: ready.orderInput.status },
    runAgent: opts.runAgent, runner: opts.runner, models: opts.models, ledger, cache: opts.cache, onEvent,
    log: opts.log ?? (() => {}), agentRunIds, taskRunIds, documentVersionIds,
    fetchPage: async () => { throw new Error('[internal] post execution cannot fetch research sources') },
    repairFindings: [], attempt: 1, postInputs: { instruction: ready.instruction, tov: ready.tov }, postOutputs, postQaRepairAttempts,
  }
  const result = (status: 'completed' | 'paused_budget'): PostExecutionOutcome => ({
    status, orderRef, instructionVersionId: request.instructionVersionId, selectionSubmissionId: request.selectionSubmissionId,
    taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total,
    postVersionId: postOutputs.post?.versionId ?? null, qaTaskRunId: null, qaVerdict: null, readyForReview: false,
  })
  try {
    await runPostStep(ctx)
    const qa = await runPostQaLoop(ctx, { postStep: runPostStep })
    const review = qa.postVersionId ? await readPostReview(em, scope, orderRef, qa.postVersionId) : null
    const readyForReview = Boolean(review?.isCurrent && !review.simulationFlag && review.versionStatus === 'ready_for_review'
      && review.documentStatus === 'ready_for_review' && review.qa.state === 'assessed'
      && review.qa.taskRunId === qa.taskRunId && review.qa.verdict === 'pass_for_draft')
    return await persist({ ...result('completed'), postVersionId: qa.postVersionId, qaTaskRunId: qa.taskRunId,
      qaVerdict: qa.verdict, readyForReview, ...(qa.escalationVersionId ? { escalationVersionId: qa.escalationVersionId } : {}) })
  } catch (error) {
    getTelemetryRuntime()?.reportError(error, { module: 'agency_research', code: 'agency_research.post_execution_failed' })
    if (error instanceof BudgetPausedError) {
      const paused = await findOneWithDecryption(em, AgencyResearchTaskRun, {
        ...scope, orderRef, id: { $in: taskRunIds }, status: 'paused_budget',
      }, { orderBy: { createdAt: 'desc' } }, scope)
      if (!paused) throw new Error('[internal] Post budget pause requires its persisted task evidence')
      const escalation = await openEscalation(ctx, {
        code: 'budget_exhausted', triggerStep: paused.stepId,
        summary: `Post production paused during ${paused.stepId}: ${error.snapshot.total.toFixed(2)} PLN spent of ${error.snapshot.cap} PLN; next call estimated ${error.nextEstimatePln.toFixed(2)} PLN.`,
        evidence: [{ ref: paused.id, fact: 'Persisted budget-paused task; its pinned inputs and configured cap remain unchanged.' }],
        blockedSteps: [paused.stepId, '7.4', '8.1'],
        decisionQuestion: 'Who will own this budget block while authorized producer recovery remains unavailable?',
        allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: 'The reason and who must act.', permittedNextStep: 'none' }],
        resumeStep: paused.stepId,
      }, z.array(inputVersionSchema).parse(paused.inputVersions))
      return persist({ ...result('paused_budget'), escalationVersionId: escalation.versionId })
    }
    await finishTaskRun(em, activation, { status: 'failed', summary, agentRunIds, cost: ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
