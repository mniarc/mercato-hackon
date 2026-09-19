import { LockMode } from '@mikro-orm/core'
import type { ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../data/entities'
import type { PostEvidencePacket } from '../../data/agents/post'
import { limits } from '../../data/templates'
import { BudgetPausedError, createLedger } from '../research/ledger'
import { openEscalation } from '../research/escalate'
import { runSourcesStep, proofSourceVisibility } from '../research/steps/sources'
import { runPostQaLoop } from '../research/steps/postQa'
import { runPostStep } from '../research/steps/post'
import type { StepContext } from '../research/steps/context'
import { readPostReview } from '../postReview/read'
import { finishTaskRun, startTaskRun } from '../store'
import type { RunStrategyExecutionOptions } from '../strategyExecution/run'
import { runPostEvidenceRequestSchema, postEvidenceOutcomeSchema, type RunPostEvidenceRequest, type PostEvidenceResult, type PostEvidenceOutcome } from './contracts'
import { readPostEvidenceInputs } from './readiness'

export type RunPostEvidenceOptions = Omit<RunStrategyExecutionOptions, 'request'> & { request: RunPostEvidenceRequest; readSpecialistTov?: ReadSpecialistTov }
type Ready = Exclude<Awaited<ReturnType<typeof readPostEvidenceInputs>>, { status: 'not_ready' }>
type OriginalQa = Pick<AgencyResearchTaskRun, 'status' | 'inputVersions' | 'outputVersionId' | 'qaResult' | 'summary' | 'agentRunIds' | 'cost'> & { finishedAt: string | null }
type Claim = { existing: PostEvidenceResult } | { ready: Ready; sourceTaskId: string; originalQa: OriginalQa }

/** A separate, explicitly budgeted 3.2 return; never rebuild or advance approved foundations. */
export async function runPostEvidence(opts: RunPostEvidenceOptions): Promise<PostEvidenceResult> {
  const request = runPostEvidenceRequestSchema.parse(opts.request)
  const { em, scope } = opts
  const claim = await em.transactional<Claim>(async (transaction) => {
    await findOneWithDecryption(transaction, AgencyResearchDocument, {
      ...scope, orderRef: request.orderRef, templateId: 'WZR-POST', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const runs = await findWithDecryption(transaction, AgencyResearchTaskRun, {
      ...scope, orderRef: request.orderRef, stepId: '3.2',
    }, { orderBy: { createdAt: 'asc' } }, scope)
    const existing = runs.find((run) => {
      const saved = run.summary as Record<string, unknown> | null
      return saved?.kind === 'post_evidence' && saved.qaTaskRunId === request.qaTaskRunId
    })
    if (existing) {
      const summary = existing.summary as Record<string, unknown>
      if (summary.postVersionId !== request.postVersionId || summary.instructionVersionId !== request.instructionVersionId) {
        throw new Error('[internal] Evidence return replay differs from its saved post/instruction')
      }
      const result = postEvidenceOutcomeSchema.safeParse(summary.executionResult)
      if (result.success && result.data.evidenceTaskRunId === existing.id
        && result.data.requestedQaTaskRunId === request.qaTaskRunId && result.data.requestedPostVersionId === request.postVersionId
        && result.data.orderRef === request.orderRef
        && ((existing.status === 'done' && result.data.status === 'completed') || (existing.status === 'paused_budget' && result.data.status === 'paused_budget'))) {
        return { existing: result.data }
      }
      return { existing: { status: 'execution_incomplete', orderRef: request.orderRef, activationTaskRunId: existing.id,
        reason: existing.status === 'running' ? 'in_progress_or_interrupted' : existing.status === 'failed' ? 'failed' : 'result_unavailable' } as const }
    }
    const ready = await readPostEvidenceInputs(transaction, scope, request, opts.readSpecialistTov)
    if (ready.status === 'not_ready') return { existing: ready }
    const pin = ({ document_id, version, status, specialistTov }: typeof ready.instruction) => ({
      document_id, version, status, ...(specialistTov ? { specialistTov } : {}),
    })
    const sourceTask = await startTaskRun(transaction, scope, { orderRef: request.orderRef, brand: ready.order.brand,
      stepId: '3.2', attempt: 1, runner: opts.runner, models: opts.models,
      inputVersions: [ready.orderInput, ready.previousPost, ready.instruction, ready.tov].map(pin) })
    const originalQa = { status: ready.qa.status, inputVersions: ready.qa.inputVersions,
      outputVersionId: ready.qa.outputVersionId, qaResult: ready.qa.qaResult, summary: ready.qa.summary,
      agentRunIds: ready.qa.agentRunIds, cost: ready.qa.cost, finishedAt: ready.qa.finishedAt?.toISOString() ?? null }
    sourceTask.summary = { kind: 'post_evidence', qaTaskRunId: ready.qa.id, postVersionId: request.postVersionId,
      instructionVersionId: request.instructionVersionId, request: ready.evidence, returnStep: '7.3',
      limits: { maxCostPln: request.maxCostPln }, originalQa }
    ready.qa.summary = { ...(ready.qa.summary as Record<string, unknown> | null ?? {}),
      evidenceContinuation: { sourceTaskRunId: sourceTask.id, originalQa } }
    await transaction.flush()
    return { ready, sourceTaskId: sourceTask.id, originalQa }
  })
  if ('existing' in claim) return claim.existing
  const { ready, sourceTaskId, originalQa } = claim
  const sourceTask = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef: request.orderRef, id: sourceTaskId, stepId: '3.2',
  }, undefined, scope)
  const qaTask = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef: request.orderRef, id: request.qaTaskRunId, stepId: '7.3',
  }, undefined, scope)
  if (!sourceTask || !qaTask) throw new Error('[internal] Persisted evidence/QA task disappeared after activation')
  ready.qa = qaTask
  const taskRunIds = [sourceTask.id]
  const documentVersionIds: string[] = []
  const agentRunIds = opts.agentRunIds ?? []
  const ledger = createLedger({ maxPln: request.maxCostPln, onEvent: opts.onEvent })
  const ctx: StepContext = {
    em, scope, orderRef: request.orderRef, order: ready.order, orderVersion: ready.orderInput,
    runner: opts.runner, runAgent: opts.runAgent, models: opts.models, ledger, cache: opts.cache,
    onEvent: opts.onEvent ?? (() => {}), log: opts.log ?? (() => {}),
    agentRunIds, taskRunIds, documentVersionIds, repairFindings: [], attempt: 1,
    fetchPage: async () => { throw new Error('[internal] Targeted evidence uses only the saved source corpus') },
    postInputs: { instruction: ready.instruction, tov: ready.tov }, postOutputs: { post: ready.previousPost },
    postQaRepairAttempts: limits.content.postRepairAttempts,
  }
  const outcome = (status: 'completed' | 'paused_budget'): PostEvidenceOutcome => ({
    status, orderRef: request.orderRef, instructionVersionId: request.instructionVersionId,
    selectionSubmissionId: ready.selectionSubmissionId, requestedPostVersionId: request.postVersionId,
    requestedQaTaskRunId: request.qaTaskRunId, evidenceTaskRunId: sourceTask.id,
    postVersionId: ctx.postOutputs?.post?.versionId ?? request.postVersionId,
    qaTaskRunId: request.qaTaskRunId, qaVerdict: null, readyForReview: false,
    taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total,
  })
  const persist = async (result: PostEvidenceOutcome) => {
    await finishTaskRun(em, sourceTask, { status: result.status === 'completed' ? 'done' : 'paused_budget',
      summary: { ...(sourceTask.summary as Record<string, unknown>), executionResult: result },
      agentRunIds, cost: ledger.snapshot() })
    return result
  }
  try {
    const extracted = await runSourcesStep({ order: ready.order, sources: ready.sources,
      runAgent: opts.runAgent, models: opts.models, ledger, cache: opts.cache, onEvent: opts.onEvent })
    const packet: PostEvidencePacket = { request: ready.evidence, sourceTaskRunId: sourceTask.id,
      facts: extracted.data.facts.map((fact) => ({ factId: `${sourceTask.id}:${fact.fact_id}`, claim: fact.claim,
        sourceRefs: fact.source_ids, quote: fact.locator.quote, limitation: fact.limitation,
        kind: fact.kind, useScope: fact.use_scope, sourceVisibility: proofSourceVisibility(fact.source_ids, extracted.data.sources) })) }
    // Evidence stays on the source task, not in a replacement WEW-ZRODLA/brief/instruction.
    sourceTask.summary = { ...(sourceTask.summary as Record<string, unknown>), evidence: packet, issues: extracted.issues }
    await em.flush()
    let qa: Awaited<ReturnType<typeof runPostQaLoop>>
    try {
      qa = await runPostQaLoop(ctx, { postStep: runPostStep, evidenceReturn: { task: ready.qa, packet } })
    } finally {
      // Same QA identity, retaining the first verdict and accounting even on a later pause/failure.
      const oldCost = originalQa.cost as { entries?: Array<{ costPln: number }>; total?: number } | null
      const newCost = ready.qa.cost as { entries?: Array<{ costPln: number }>; total?: number } | null
      if (oldCost && newCost && newCost !== oldCost) ready.qa.cost = { ...newCost,
        entries: [...(oldCost.entries ?? []), ...(newCost.entries ?? [])], total: (oldCost.total ?? 0) + (newCost.total ?? 0) }
      ready.qa.agentRunIds = [...new Set([...(Array.isArray(originalQa.agentRunIds) ? originalQa.agentRunIds as string[] : []),
        ...(Array.isArray(ready.qa.agentRunIds) ? ready.qa.agentRunIds as string[] : [])])]
      await em.flush()
    }
    const review = qa.postVersionId ? await readPostReview(em, scope, request.orderRef, qa.postVersionId) : null
    const readyForReview = Boolean(review?.isCurrent && !review.simulationFlag && review.documentStatus === 'ready_for_review'
      && review.versionStatus === 'ready_for_review' && review.qa.state === 'assessed'
      && review.qa.taskRunId === qa.taskRunId && review.qa.verdict === 'pass_for_draft')
    return persist({ ...outcome('completed'), postVersionId: qa.postVersionId, qaTaskRunId: qa.taskRunId,
      qaVerdict: qa.verdict, readyForReview, ...(qa.escalationVersionId ? { escalationVersionId: qa.escalationVersionId } : {}) })
  } catch (error) {
    if (error instanceof BudgetPausedError) {
      const escalation = await openEscalation(ctx, { code: 'budget_exhausted', triggerStep: '7.3',
        summary: 'The explicitly budgeted evidence return paused; the original QA request and approved foundations are retained.',
        evidence: [{ ref: sourceTask.id, fact: ready.evidence.question }, { ref: request.qaTaskRunId, fact: ready.evidence.claim },
          { ref: request.postVersionId, fact: 'Original post version awaiting evidence.' }],
        blockedSteps: ['7.4', '8.1'], resumeStep: '7.3',
        decisionQuestion: 'Who owns the explicit evidence budget block?',
        allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: 'The reason and responsible owner.', permittedNextStep: 'none' }],
      }, [ready.orderInput, ready.previousPost, ready.instruction, ready.tov])
      return persist({ ...outcome('paused_budget'), escalationVersionId: escalation.versionId })
    }
    getTelemetryRuntime()?.reportError(error, { module: 'agency_research', code: 'agency_research.post_evidence_failed' })
    await finishTaskRun(em, sourceTask, { status: 'failed', agentRunIds, cost: ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
