import { z } from 'zod'
import type { ReadSpecialistTov, SpecialistTovDocument } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema, type InputVersion } from '../../data/schemas/envelope'
import { orderDataSchema, orderFactsOf } from '../../data/schemas/zamowienie'
import { limits } from '../../data/templates'
import { documentIdFor, versionLabel } from '../research/envelope'
import { openEscalation } from '../research/escalate'
import { BudgetPausedError, createLedger } from '../research/ledger'
import type { StepContext, StrategyExecutionInput } from '../research/steps/context'
import { runPlanStep } from '../research/steps/plan'
import { runPlanQaLoop } from '../research/steps/planQa'
import { finishTaskRun } from '../store'
import type { RunStrategyExecutionOptions } from '../strategyExecution/run'
import { readPlanningReadiness } from '../planningReadiness/read'
import { planningExecutionRequestSchema, type PlanningExecutionRequest, type PlanningExecutionResult, type PlanningExecutionOutcome } from './contracts'
import { claimPlanningExecution, savedPlanningExecution } from './claim'
import { specialistTovInput } from '../research/steps/tovInput'

export type RunPlanningExecutionOptions = Omit<RunStrategyExecutionOptions, 'request'> & { request: PlanningExecutionRequest; readSpecialistTov?: ReadSpecialistTov }
const pin = ({ document_id, version, status, specialistTov }: InputVersion): InputVersion => ({
  document_id, version, status, ...(specialistTov ? { specialistTov } : {}),
})

/** Only 6.1–6.3. Customer choice/acceptance and production are separate continuations. */
export async function runPlanningExecution(opts: RunPlanningExecutionOptions): Promise<PlanningExecutionResult> {
  const request = planningExecutionRequestSchema.parse(opts.request)
  const { em, scope } = opts
  const { orderRef } = request
  const saved = await savedPlanningExecution(em, scope, request)
  if (saved) return saved
  const { maxCostPln: _budget, ...readinessRequest } = request
  const readiness = opts.readSpecialistTov
    ? await readPlanningReadiness(em, scope, readinessRequest, opts.readSpecialistTov)
    : await readPlanningReadiness(em, scope, readinessRequest)
  if (readiness.status === 'not_ready') return readiness
  const where = { ...scope, orderRef }
  const accepted = readiness.accepted
  const strategyRow = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...where, id: request.strategyVersionId, documentId: accepted.pair.strategy.documentId, templateId: 'WZR-STRATEGIA',
  }, undefined, scope)
  const specialistReference = accepted.pair.tov.specialistReference
  const specialistTov: SpecialistTovDocument | null = specialistReference && opts.readSpecialistTov
    ? await opts.readSpecialistTov(scope, specialistReference)
    : null
  const tovRow = specialistReference ? null : await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...where, id: request.tovVersionId, documentId: accepted.pair.tov.documentId, templateId: 'WZR-TOV',
  }, undefined, scope)
  if (!strategyRow || (specialistReference
    ? !specialistTov || !specialistTov.isCurrent || specialistTov.documentId !== specialistReference.documentId
      || specialistTov.versionId !== specialistReference.versionId || specialistTov.version !== specialistReference.version
    : !tovRow)) return { status: 'not_ready', orderRef, reason: 'pinned_input_missing' }
  const inputs = z.array(inputVersionSchema).safeParse(strategyRow.inputVersions)
  if (!inputs.success) return { status: 'not_ready', orderRef, reason: 'pinned_input_invalid' }
  const snapshot = (row: AgencyResearchDocumentVersion): StrategyExecutionInput => ({
    document_id: documentIdFor(row.templateId as 'WZR-STRATEGIA', orderRef), version: versionLabel(row.versionNo),
    status: row.status, versionId: row.id, data: row.data,
  })
  const loadPinned = async (templateId: 'WZR-BRIEF' | 'WZR-ZRODLA' | 'WZR-KONKURENCJA' | 'WZR-ZAMOWIENIE') => {
    const matches = inputs.data.filter((input) => input.document_id === documentIdFor(templateId, orderRef))
    if (matches.length !== 1 || !/^[1-9]\d*\.0$/.test(matches[0].version)) return null
    const row = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, templateId, versionNo: Number(matches[0].version.split('.')[0]),
    }, undefined, scope)
    return row && !row.simulationFlag ? snapshot(row) : null
  }
  const brief = await loadPinned('WZR-BRIEF')
  if (!brief || brief.versionId !== accepted.brief.versionId) return { status: 'not_ready', orderRef, reason: 'pinned_input_missing', templateId: 'WZR-BRIEF' }
  const zrodla = await loadPinned('WZR-ZRODLA')
  if (!zrodla) return { status: 'not_ready', orderRef, reason: 'pinned_input_missing', templateId: 'WZR-ZRODLA' }
  const konkurencja = await loadPinned('WZR-KONKURENCJA')
  if (!konkurencja) return { status: 'not_ready', orderRef, reason: 'pinned_input_missing', templateId: 'WZR-KONKURENCJA' }
  const orderInput = await loadPinned('WZR-ZAMOWIENIE')
  if (!orderInput) return { status: 'not_ready', orderRef, reason: 'order_version_missing' }
  const parsedOrder = orderDataSchema.safeParse(orderInput.data)
  if (!parsedOrder.success) return { status: 'not_ready', orderRef, reason: 'pinned_input_invalid', templateId: 'WZR-ZAMOWIENIE' }
  const topicCount = parsedOrder.data.product_selection.result_limits?.topics
  if (topicCount === undefined || topicCount <= 0) return { status: 'not_ready', orderRef, reason: 'topic_count_missing' }
  const order = orderFactsOf(parsedOrder.data)
  const strategy = snapshot(strategyRow)
  const tov = specialistTov ? specialistTovInput(specialistTov) : snapshot(tovRow!)
  const planningInputs = { strategy, tov, brief, zrodla, konkurencja }
  const planningOutputs: NonNullable<StepContext['planningOutputs']> = { plan: null }
  const planningQaRepairAttempts = limits.generation.qaRepairAttemptsPerRun
  const summary = {
    process: request.process, strategyVersionId: request.strategyVersionId, tovVersionId: request.tovVersionId,
    ...(specialistReference ? { specialistTov: specialistReference } : {}),
    briefVersionId: brief.versionId, pairQaTaskRunId: accepted.qaTaskRunId,
    acceptanceSubmissionIds: [accepted.acceptances.strategy!.source.submissionId, accepted.acceptances.tov!.source.submissionId],
    limits: { maxCostPln: request.maxCostPln, qaRepairAttemptsPerRun: planningQaRepairAttempts, topics: topicCount },
    steps: ['6.2', '6.3'],
  }
  const claim = await claimPlanningExecution(em, scope, request, {
    orderRef, brand: order.brand, stepId: '6.1', attempt: 1, runner: 'system', models: opts.models,
    inputVersions: [pin(orderInput), ...Object.values(planningInputs).map(pin)],
  }, summary)
  if ('existing' in claim) return claim.existing
  const taskRunIds = [claim.activationTaskRunId]
  const documentVersionIds: string[] = []
  const agentRunIds = opts.agentRunIds ?? []
  const onEvent = opts.onEvent ?? (() => {})
  const ledger = createLedger({ maxPln: request.maxCostPln, onEvent })
  const activation = await findOneWithDecryption(em, AgencyResearchTaskRun, { ...where, id: claim.activationTaskRunId, stepId: '6.1' }, undefined, scope)
  if (!activation) throw new Error('[internal] planning activation record is missing')
  const persist = async (outcome: PlanningExecutionOutcome) => {
    await finishTaskRun(em, activation, { status: outcome.status === 'completed' ? 'done' : 'paused_budget',
      summary: { ...summary, executionResult: outcome }, agentRunIds, cost: ledger.snapshot() })
    return outcome
  }
  const ctx: StepContext = {
    ...(specialistTov ? { specialistTov } : {}),
    em, scope, orderRef, order, orderVersion: pin(orderInput), runAgent: opts.runAgent, runner: opts.runner,
    models: opts.models, ledger, cache: opts.cache, onEvent, log: opts.log ?? (() => {}), agentRunIds, taskRunIds, documentVersionIds,
    fetchPage: async () => { throw new Error('[internal] planning execution cannot fetch research sources') },
    repairFindings: [], attempt: 1, planningInputs, planningOutputs, planningQaRepairAttempts,
  }
  const result = (status: 'completed' | 'paused_budget'): PlanningExecutionOutcome => ({
    status, orderRef, strategyVersionId: strategy.versionId, tovVersionId: tov.versionId,
    taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total,
    planVersionId: planningOutputs.plan?.versionId ?? null, qaTaskRunId: null, qaVerdict: null, readyForApproval: false,
  })
  try {
    await runPlanStep(ctx)
    const qa = await runPlanQaLoop(ctx, { planStep: runPlanStep })
    const escalation = qa.verdict === 'needs_agent_fix' ? await openEscalation(ctx, {
      code: 'qa_exhausted',
      summary: `Q-P still fails after ${qa.repairs} repair attempt(s) (STD-LIMITY qa_repair_attempts_per_run = ${planningQaRepairAttempts}).`,
      triggerStep: '6.3',
      evidence: [
        { ref: qa.taskRunId, fact: `6.3 task run, verdict ${qa.verdict}` },
        ...(qa.planVersionId ? [{ ref: qa.planVersionId, fact: 'Exact plan version checked by 6.3' }] : []),
        ...qa.findings.filter((finding) => finding.severity === 'blocking').slice(0, 10)
          .map((finding) => ({ ref: finding.path, fact: `${finding.code}: ${finding.gap}` })),
      ],
      blockedSteps: ['6.4'],
      decisionQuestion: 'Why must this plan remain blocked, and who must act on the recorded QA findings?',
      allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: 'The reason the plan cannot proceed and who must act.', permittedNextStep: 'none' }],
      resumeStep: '6.2',
    }, [...Object.values(planningInputs).map(pin), ...(planningOutputs.plan ? [pin(planningOutputs.plan)] : [])]) : null
    return await persist({ ...result('completed'), planVersionId: qa.planVersionId, qaTaskRunId: qa.taskRunId,
      qaVerdict: qa.verdict, readyForApproval: qa.readyForApproval,
      ...(escalation ? { escalationVersionId: escalation.versionId } : {}) })
  } catch (error) {
    getTelemetryRuntime()?.reportError(error, { module: 'agency_research', code: 'agency_research.planning_execution_failed' })
    if (error instanceof BudgetPausedError) {
      const paused = await findOneWithDecryption(em, AgencyResearchTaskRun, {
        ...where, id: { $in: taskRunIds }, status: 'paused_budget',
      }, { orderBy: { createdAt: 'desc' } }, scope)
      if (!paused) throw new Error('[internal] Planning budget pause requires its persisted task evidence')
      const escalation = await openEscalation(ctx, {
        code: 'budget_exhausted', triggerStep: paused.stepId,
        summary: `Planning paused during ${paused.stepId}: ${error.snapshot.total.toFixed(2)} PLN spent of ${error.snapshot.cap} PLN; next call estimated ${error.nextEstimatePln.toFixed(2)} PLN.`,
        evidence: [{ ref: paused.id, fact: 'Persisted budget-paused task; its pinned inputs and configured cap remain unchanged.' }],
        blockedSteps: [paused.stepId, '6.4'],
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
