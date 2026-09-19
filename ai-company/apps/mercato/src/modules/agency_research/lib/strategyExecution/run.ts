import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema, type InputVersion } from '../../data/schemas/envelope'
import { orderDataSchema, orderFactsOf } from '../../data/schemas/zamowienie'
import { limits } from '../../data/templates'
import { documentIdFor, versionLabel } from '../research/envelope'
import { BudgetPausedError, createLedger, type LedgerEvent } from '../research/ledger'
import type { ModelSet, PipelineCache, PipelineEvent, ResearchAgentRunner } from '../research/pipeline'
import type { StepContext, StrategyExecutionInput } from '../research/steps/context'
import { runStrategyStep } from '../research/steps/strategy'
import { runTovStep } from '../research/steps/tov'
import { runStrategyQaLoop } from '../research/steps/strategyQa'
import { finishTaskRun, type ResearchScope } from '../store'
import { resolveStrategyReadiness, type StrategyDocumentReference } from '../strategyReadiness'
import { strategyExecutionRequestSchema, type StrategyExecutionRequest, type StrategyExecutionResult, type StrategyExecutionOutcome } from './contracts'
import { claimStrategyExecution, savedStrategyExecution } from './claim'

export type RunStrategyExecutionOptions = {
  em: EntityManager
  scope: ResearchScope
  request: StrategyExecutionRequest
  runAgent: ResearchAgentRunner
  runner: string
  models: ModelSet
  agentRunIds?: string[]
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent | LedgerEvent) => void
  log?: (message: string) => void
}

const pin = ({ document_id, version, status }: InputVersion): InputVersion => ({ document_id, version, status })

export async function runStrategyExecution(opts: RunStrategyExecutionOptions): Promise<StrategyExecutionResult> {
  const request = strategyExecutionRequestSchema.parse(opts.request)
  const { em, scope } = opts
  const { orderRef } = request
  const saved = await savedStrategyExecution(em, scope, request)
  if (saved) return saved
  const readiness = await resolveStrategyReadiness(em, scope, request)
  if (readiness.status === 'not_ready') return readiness
  const where = { ...scope, orderRef }
  const load = async (reference: StrategyDocumentReference): Promise<StrategyExecutionInput | null> => {
    const row = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, id: reference.versionId, documentId: reference.documentId, templateId: reference.templateId,
    }, undefined, scope)
    if (!row || versionLabel(row.versionNo) !== reference.version) return null
    return { document_id: reference.documentRef, version: reference.version, status: row.status, versionId: row.id, data: row.data }
  }
  const brief = await load(readiness.brief)
  if (!brief) return { status: 'not_ready', orderRef, reason: 'pinned_input_missing', templateId: 'WZR-BRIEF' }
  const analysis = new Map<string, StrategyExecutionInput>()
  for (const reference of readiness.analysis.documents) {
    const snapshot = await load(reference)
    if (!snapshot) return { status: 'not_ready', orderRef, reason: 'pinned_input_missing', templateId: reference.templateId }
    analysis.set(reference.templateId, snapshot)
  }
  const zrodla = analysis.get('WZR-ZRODLA')
  const audyt = analysis.get('WZR-AUDYT')
  const konkurencja = analysis.get('WZR-KONKURENCJA')
  const ustalenia = analysis.get('WZR-USTALENIA')
  if (!zrodla || !audyt || !konkurencja || !ustalenia) return { status: 'not_ready', orderRef, reason: 'pinned_input_missing' }

  const freeze = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...where, id: readiness.analysis.freezeTaskRunId, stepId: '3.8', status: 'done',
  }, undefined, scope)
  const freezeInputs = z.array(inputVersionSchema).safeParse(freeze?.inputVersions)
  const orderPins = freezeInputs.success
    ? freezeInputs.data.filter((input) => input.document_id === documentIdFor('WZR-ZAMOWIENIE', orderRef))
    : []
  const orderPin = orderPins.length === 1 ? orderPins[0] : null
  const versionNo = orderPin && /^\d+\.0$/.test(orderPin.version) ? Number(orderPin.version.split('.')[0]) : null
  if (!versionNo) return { status: 'not_ready', orderRef, reason: 'order_version_missing' }
  const orderRow = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...where, templateId: 'WZR-ZAMOWIENIE', versionNo,
  }, undefined, scope)
  if (!orderRow) return { status: 'not_ready', orderRef, reason: 'order_version_missing' }
  const order = orderFactsOf(orderDataSchema.parse(orderRow.data))
  const orderVersion: InputVersion = {
    document_id: documentIdFor('WZR-ZAMOWIENIE', orderRef), version: versionLabel(orderRow.versionNo), status: orderRow.status,
  }

  const onEvent = opts.onEvent ?? (() => {})
  const taskRunIds: string[] = []
  const documentVersionIds: string[] = []
  const agentRunIds = opts.agentRunIds ?? []
  const strategyOutputs: NonNullable<StepContext['strategyOutputs']> = { strategy: null, tov: null }
  const strategyQaRepairAttempts = limits.generation.qaRepairAttemptsPerRun
  const inputVersions = [orderVersion, ...[brief, zrodla, audyt, konkurencja, ustalenia].map(pin)]
  const summary = {
    process: readiness.process,
    briefVersionId: readiness.brief.versionId,
    acceptanceSubmissionId: readiness.acceptance.source.submissionId,
    freezeTaskRunId: readiness.analysis.freezeTaskRunId,
    analysisQaTaskRunId: readiness.analysis.qaTaskRunId,
    analysisSetHash: readiness.analysis.setHash,
    limits: { maxCostPln: request.maxCostPln, qaRepairAttemptsPerRun: strategyQaRepairAttempts },
    steps: ['5.2', '5.3', '5.4'],
  }
  const claim = await claimStrategyExecution(em, scope, request, {
    orderRef, brand: order.brand, stepId: '5.1', attempt: 1, runner: 'system', models: opts.models, inputVersions,
  }, summary)
  if ('existing' in claim) return claim.existing
  taskRunIds.push(claim.activationTaskRunId)
  const ledger = createLedger({ maxPln: request.maxCostPln, onEvent })
  const activation = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...where, id: claim.activationTaskRunId, stepId: '5.1',
  }, undefined, scope)
  if (!activation) throw new Error('[internal] strategy activation record is missing')
  const persistResult = async (outcome: StrategyExecutionOutcome): Promise<StrategyExecutionOutcome> => {
    await finishTaskRun(em, activation, {
      status: outcome.status === 'completed' ? 'done' : 'paused_budget',
      summary: { ...summary, executionResult: outcome }, agentRunIds, cost: ledger.snapshot(),
    })
    return outcome
  }
  const ctx: StepContext = {
    em, scope, orderRef, order, orderVersion,
    runAgent: opts.runAgent, runner: opts.runner, models: opts.models, ledger,
    cache: opts.cache, onEvent, log: opts.log ?? (() => {}),
    agentRunIds, taskRunIds, documentVersionIds,
    fetchPage: async () => { throw new Error('[internal] strategy execution cannot fetch research sources') },
    repairFindings: [], attempt: 1,
    strategyInputs: { brief, zrodla, audyt, konkurencja, ustalenia },
    strategyOutputs, strategyQaRepairAttempts,
  }
  const result = (status: 'completed' | 'paused_budget'): Extract<StrategyExecutionResult, { taskRunIds: string[] }> => ({
    status, orderRef, taskRunIds, documentVersionIds, agentRunIds, spentPln: ledger.snapshot().total,
    strategyVersionId: strategyOutputs.strategy?.versionId ?? null,
    tovVersionId: strategyOutputs.tov?.versionId ?? null,
    qaTaskRunId: null, qaVerdict: null,
  })
  try {
    await runStrategyStep(ctx)
    await runTovStep(ctx)
    const qa = await runStrategyQaLoop(ctx, { strategyStep: runStrategyStep, tovStep: runTovStep })
    return await persistResult({
      ...result('completed'), strategyVersionId: qa.strategyVersionId, tovVersionId: qa.tovVersionId,
      qaTaskRunId: qa.taskRunId, qaVerdict: qa.verdict,
      ...(qa.escalationVersionId ? { escalationVersionId: qa.escalationVersionId } : {}),
    })
  } catch (error) {
    getTelemetryRuntime()?.reportError(error, { module: 'agency_research', code: 'agency_research.strategy_execution_failed' })
    if (error instanceof BudgetPausedError) return persistResult(result('paused_budget'))
    await finishTaskRun(em, activation, {
      status: 'failed', summary, agentRunIds, cost: ledger.snapshot(),
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
