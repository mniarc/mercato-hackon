import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { readinessAssessorResult, type ReadinessAssessorInput } from '../../data/agents/findings'
import { audytDataSchema } from '../../data/schemas/audyt'
import { konkurencjaDataSchema } from '../../data/schemas/konkurencja'
import { inputVersionSchema, type InputVersion } from '../../data/schemas/envelope'
import { readinessOutputs, ustaleniaDataSchema } from '../../data/schemas/ustalenia'
import { zrodlaDataSchema } from '../../data/schemas/zrodla'
import { orderDataSchema, orderFactsOf } from '../../data/schemas/zamowienie'
import { limits } from '../../data/templates'
import { readBriefReview } from '../briefReview/read'
import { RESEARCH_READINESS_ASSESSOR_AGENT_ID } from '../agentIds'
import { documentIdFor } from '../research/envelope'
import { openEscalation } from '../research/escalate'
import { BudgetPausedError, createLedger, type LedgerEvent } from '../research/ledger'
import { createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../research/pipeline'
import { runBriefStep } from '../research/steps/brief'
import { runBriefQaLoop } from '../research/steps/briefQa'
import { runFreezeStep } from '../research/steps/freeze'
import { findingsBankOf, gateReadiness } from '../research/steps/findings'
import { runQaLoop } from '../research/steps/qa'
import type { StepContext } from '../research/steps/context'
import { renderUstalenia, renderUstaleniaClientView } from '../research/render/ustalenia'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, type ResearchScope } from '../store'
import { applyBriefAnswers } from './applyAnswers'
import { BRIEF_ANSWER_AGENT_ID } from './ids'
import { BRIEF_REVISION_STEP, claimBriefRevision, savedBriefRevision } from './claim'
import { briefAnswerAgentResultSchema, briefRevisionRequestSchema, type BriefRevisionRequest, type BriefRevisionOutcome, type BriefRevisionResult } from './contracts'

export type RunBriefRevisionOptions = {
  em: EntityManager
  scope: ResearchScope
  request: BriefRevisionRequest
  runAgent: ResearchAgentRunner
  runner: string
  models: ModelSet
  agentRunIds?: string[]
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent | LedgerEvent) => void
  log?: (message: string) => void
}

const pin = ({ document_id, version, status }: InputVersion): InputVersion => ({ document_id, version, status })

export async function runBriefRevision(opts: RunBriefRevisionOptions): Promise<BriefRevisionResult> {
  const request = briefRevisionRequestSchema.parse(opts.request)
  const { em, scope } = opts
  const { orderRef } = request
  const notReady = (reason: Extract<BriefRevisionResult, { status: 'not_ready' }>['reason']): BriefRevisionResult => ({ status: 'not_ready', orderRef, reason })
  const replay = await savedBriefRevision(em, scope, request)
  if (replay) return replay
  const review = await readBriefReview(em, scope, orderRef, request.briefVersionId)
  if (!review?.isCurrent) return notReady('brief_not_current')
  if (review.documentStatus !== 'ready_for_review' || review.qa.state !== 'assessed'
    || !['needs_client_data', 'ready_for_approval'].includes(review.qa.verdict)) return notReady('brief_not_reviewable')
  const brief = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...scope, id: request.briefVersionId, orderRef, templateId: 'WZR-BRIEF',
  }, undefined, scope)
  const references = z.array(inputVersionSchema).safeParse(brief?.inputVersions)
  if (!brief || !references.success) return notReady('input_missing')
  const findings = await currentInputVersion(em, scope, orderRef, 'WZR-USTALENIA')
  const sources = await currentInputVersion(em, scope, orderRef, 'WZR-ZRODLA')
  const audit = await currentInputVersion(em, scope, orderRef, 'WZR-AUDYT')
  const competitors = await currentInputVersion(em, scope, orderRef, 'WZR-KONKURENCJA')
  const orderInput = await currentInputVersion(em, scope, orderRef, 'WZR-ZAMOWIENIE')
  if (!findings || !sources || !audit || !competitors || !orderInput) return notReady('input_missing')
  for (const input of [findings, sources, audit, orderInput]) {
    if (!references.data.some((reference) => reference.document_id === input.document_id && reference.version === input.version)) return notReady('input_changed')
  }
  const order = orderFactsOf(orderDataSchema.parse(orderInput.data))
  const findingsData = ustaleniaDataSchema.parse(findings.data)
  const inputVersions = [orderInput, findings, sources, audit, competitors].map(pin)
  const claim = await claimBriefRevision(em, scope, request, {
    orderRef, brand: order.brand, stepId: BRIEF_REVISION_STEP, attempt: 1,
    runner: opts.runner, models: opts.models,
    inputVersions: [...inputVersions, { document_id: documentIdFor('WZR-BRIEF', orderRef), version: review.version, status: brief.status }],
  })
  if ('existing' in claim) return claim.existing
  const activation = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, id: claim.activationTaskRunId, orderRef, stepId: BRIEF_REVISION_STEP,
  }, undefined, scope)
  if (!activation) throw new Error('[internal] brief revision activation is missing')
  const summary = activation.summary as Record<string, unknown>
  const onEvent = opts.onEvent ?? (() => {})
  const ledger = createLedger({ maxPln: request.maxCostPln, onEvent })
  const taskRunIds = [activation.id]
  const documentVersionIds: string[] = []
  const agentRunIds = opts.agentRunIds ?? []
  const ctx: StepContext = {
    em, scope, orderRef, order, orderVersion: pin(orderInput), runAgent: opts.runAgent,
    runner: opts.runner, models: opts.models, ledger, cache: opts.cache, onEvent,
    log: opts.log ?? (() => {}), agentRunIds, taskRunIds, documentVersionIds,
    fetchPage: async () => { throw new Error('[internal] client-answer revision cannot fetch new evidence') },
    repairFindings: [], attempt: 1,
  }
  const outcome: BriefRevisionOutcome = {
    status: 'completed', orderRef, submissionId: request.source.submissionId,
    previousBriefVersionId: request.briefVersionId, briefVersionId: null, findingsVersionId: null,
    qaTaskRunId: null, qaVerdict: null, analysisQaTaskRunId: null, freezeTaskRunId: null,
    answeredQuestionIds: [], unresolvedQuestionIds: review.questions.map((question) => question.question_id),
    questions: review.questions.map((question) => ({ questionId: question.question_id, question: question.question })),
    taskRunIds, documentVersionIds, agentRunIds, spentPln: 0,
  }
  const persist = async (): Promise<BriefRevisionOutcome> => {
    outcome.spentPln = ledger.snapshot().total
    await finishTaskRun(em, activation, {
      status: outcome.status === 'paused_budget' ? 'paused_budget' : 'done',
      outputVersionId: outcome.findingsVersionId,
      summary: { ...summary, executionResult: outcome }, agentRunIds, cost: ledger.snapshot(),
    })
    return outcome
  }
  try {
    const step = createStepRunner({
      runAgent: opts.runAgent, ledger, models: opts.models, cache: opts.cache, onEvent,
      groundingRetries: limits.generation.groundingRetries,
      timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
      stats: { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 },
    })
    const mapped = await step({
      step: BRIEF_REVISION_STEP, agentId: BRIEF_ANSWER_AGENT_ID, label: 'brief_client_answers',
      input: { outputLanguage: order.outputLanguage, originalText: request.originalText, questions: review.questions },
      parse: (raw) => applyBriefAnswers({
        findings: findingsData, invitedQuestionIds: review.questions.map((question) => question.question_id),
        request, proposal: briefAnswerAgentResultSchema.parse(raw).data,
      }),
      gate: (value) => ({ value, issues: [], kept: value.answeredQuestionIds.length, dropped: 0 }),
    })
    outcome.answeredQuestionIds = mapped.value.answeredQuestionIds
    outcome.unresolvedQuestionIds = mapped.value.unresolvedQuestionIds
    outcome.questions = review.questions.filter((question) => outcome.unresolvedQuestionIds.includes(question.question_id))
      .map((question) => ({ questionId: question.question_id, question: question.question }))
    if (!outcome.answeredQuestionIds.length) {
      outcome.status = 'needs_client_data'
      return persist()
    }
    const bank = findingsBankOf(order, order.outputLanguage, zrodlaDataSchema.parse(sources.data), audytDataSchema.parse(audit.data), konkurencjaDataSchema.parse(competitors.data))
    const assessed = await step({
      step: BRIEF_REVISION_STEP, agentId: RESEARCH_READINESS_ASSESSOR_AGENT_ID, label: 'revised_findings_readiness',
      input: {
        order: bank.order, outputLanguage: order.outputLanguage, coverage: bank.coverage, plan_capacity: bank.plan_capacity,
        field_map: mapped.value.data.field_map,
        questions: mapped.value.data.questions.filter((question) => !/^resolved/.test(question.state))
          .map((question) => ({ question_id: question.question_id, brief_field: question.brief_field, priority: question.priority })),
        evidence_requests: mapped.value.data.evidence_requests.map((item) => ({ request_id: item.request_id, claim_supported: item.claim_supported })),
        outputs: [...readinessOutputs],
        gates: [
          'Q-R: sources with access scope, atomic facts with limits, offer and purchase situations, language sample, comparison to 3 companies, gaps assigned to brief fields.',
          'Q-FREEZE: priority and audience agreed, promises and proof rights settled, UVP candidates with mechanism and comparison limits, no critical fact gap, plan capacity of 12 distinct supported angles, voice preferences confirmed or explicitly proposed, CTA draft readiness with an explicit limit.',
        ],
      } satisfies ReadinessAssessorInput,
      parse: (raw) => readinessAssessorResult.parse(raw).data,
      gate: gateReadiness,
    })
    mapped.value.data.readiness = assessed.value.readiness
    const currentBrief = await currentInputVersion(em, scope, orderRef, 'WZR-BRIEF')
    const currentFindings = await currentInputVersion(em, scope, orderRef, 'WZR-USTALENIA')
    if (currentBrief?.versionId !== request.briefVersionId || currentFindings?.versionId !== findings.versionId) throw new Error('[internal] brief revision inputs changed while interpreting the response')
    for (const [template, expected] of [['WZR-ZRODLA', sources], ['WZR-AUDYT', audit], ['WZR-KONKURENCJA', competitors], ['WZR-ZAMOWIENIE', orderInput]] as const) {
      if ((await currentInputVersion(em, scope, orderRef, template))?.versionId !== expected.versionId) throw new Error('[internal] brief revision evidence changed while interpreting the response')
    }
    const saved = await saveDocumentVersion(em, scope, {
      orderRef, brand: order.brand, templateId: 'WZR-USTALENIA', status: 'ready_for_review',
      inputVersions: [...inputVersions, { document_id: documentIdFor('WZR-BRIEF', orderRef), version: review.version, status: brief.status }],
      data: mapped.value.data, issues: [], taskRunId: activation.id,
      renderedMd: renderUstalenia({ brand: order.brand, data: mapped.value.data, issues: [] }),
      clientViewMd: renderUstaleniaClientView(mapped.value.data),
    })
    outcome.findingsVersionId = saved.version.id
    documentVersionIds.push(saved.version.id)
    activation.outputVersionId = saved.version.id
    activation.summary = { ...summary, answeredQuestionIds: outcome.answeredQuestionIds, findingsVersionId: saved.version.id }
    await em.flush()
    const analysisQa = await runQaLoop(ctx, { authorSteps: {} })
    outcome.analysisQaTaskRunId = analysisQa.taskRunId
    if (analysisQa.verdict !== 'ready') {
      outcome.status = 'analysis_blocked'
      if (analysisQa.escalationVersionId) outcome.escalationVersionId = analysisQa.escalationVersionId
      return persist()
    }
    const freeze = await runFreezeStep(ctx)
    outcome.freezeTaskRunId = freeze.taskRunId
    await runBriefStep(ctx)
    const qa = await runBriefQaLoop(ctx, { briefStep: runBriefStep })
    outcome.briefVersionId = qa.briefVersionId
    outcome.qaTaskRunId = qa.taskRunId
    outcome.qaVerdict = qa.verdict
    if (qa.escalationVersionId) outcome.escalationVersionId = qa.escalationVersionId
    return persist()
  } catch (error) {
    if (error instanceof BudgetPausedError) {
      outcome.status = 'paused_budget'
      await finishTaskRun(em, activation, { status: 'paused_budget', agentRunIds, cost: ledger.snapshot() })
      const paused = await findOneWithDecryption(em, AgencyResearchTaskRun, {
        ...scope, orderRef, id: { $in: taskRunIds }, status: 'paused_budget',
      }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope) ?? activation
      const escalation = await openEscalation(ctx, {
        code: 'budget_exhausted', triggerStep: paused.stepId,
        summary: `Brief revision paused during ${paused.stepId}: ${error.snapshot.total.toFixed(2)} PLN spent of ${error.snapshot.cap} PLN.`,
        evidence: [{ ref: paused.id, fact: 'Persisted budget-paused task; source response, saved versions and authorized cap remain unchanged.' }],
        blockedSteps: [paused.stepId, '4.2', '4.6', '5.1'],
        decisionQuestion: 'Who will own this budget block while authorized producer recovery remains unavailable?',
        allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: 'The reason and who must act.', permittedNextStep: 'none' }],
        resumeStep: paused.stepId,
      }, z.array(inputVersionSchema).parse(paused.inputVersions))
      outcome.escalationVersionId = escalation.versionId
      return persist()
    }
    getTelemetryRuntime()?.reportError(error, { module: 'agency_research', code: 'agency_research.brief_revision_failed' })
    await finishTaskRun(em, activation, {
      status: 'failed', summary: activation.summary, agentRunIds, cost: ledger.snapshot(),
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
