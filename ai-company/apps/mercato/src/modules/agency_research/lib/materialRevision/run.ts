import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchSource, AgencyResearchTaskRun } from '../../data/entities'
import { audytDataSchema } from '../../data/schemas/audyt'
import { konkurencjaDataSchema } from '../../data/schemas/konkurencja'
import { businessProfileSchema, zrodlaDataSchema } from '../../data/schemas/zrodla'
import { readinessOutputs, ustaleniaDataSchema } from '../../data/schemas/ustalenia'
import { inputVersionSchema, type InputVersion } from '../../data/schemas/envelope'
import { orderDataSchema, orderFactsOf } from '../../data/schemas/zamowienie'
import { fieldMapperResult, readinessAssessorResult, type FieldMapperInput, type ReadinessAssessorInput } from '../../data/agents/findings'
import { limits } from '../../data/templates'
import { RESEARCH_FIELD_MAPPER_AGENT_ID, RESEARCH_READINESS_ASSESSOR_AGENT_ID } from '../agentIds'
import { readBriefReview } from '../briefReview/read'
import { openEscalation } from '../research/escalate'
import { documentIdFor } from '../research/envelope'
import { BudgetPausedError, createLedger, type LedgerEvent } from '../research/ledger'
import { createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../research/pipeline'
import { renderZrodla } from '../research/render/zrodla'
import { renderUstalenia, renderUstaleniaClientView } from '../research/render/ustalenia'
import { findingsBankOf, gateFieldMap, gateReadiness, knownIdsOf, seededFieldRows } from '../research/steps/findings'
import { runQaLoop } from '../research/steps/qa'
import { runFreezeStep } from '../research/steps/freeze'
import { runBriefStep } from '../research/steps/brief'
import { runBriefQaLoop } from '../research/steps/briefQa'
import type { StepContext } from '../research/steps/context'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, saveSources, type ResearchScope } from '../store'
import { appendMaterialEvidence, applyMaterialField } from './append'
import { claimMaterialRevision, MATERIAL_REVISION_STEP, savedMaterialRevision } from './claim'
import { materialRevisionRequestSchema, type MaterialRevisionRequest, type MaterialRevisionOutcome, type MaterialRevisionResult } from './contracts'

export type RunMaterialRevisionOptions = {
  em: EntityManager; scope: ResearchScope; request: MaterialRevisionRequest; runAgent: ResearchAgentRunner; runner: string; models: ModelSet;
  agentRunIds?: string[]; cache?: PipelineCache; onEvent?: (event: PipelineEvent | LedgerEvent) => void; log?: (message: string) => void;
}
const pin = ({ document_id, version, status }: InputVersion): InputVersion => ({ document_id, version, status })

export async function runMaterialRevision(opts: RunMaterialRevisionOptions): Promise<MaterialRevisionResult> {
  const request = materialRevisionRequestSchema.parse(opts.request)
  const { em, scope } = opts
  const { orderRef } = request
  const unavailable = (reason: Extract<MaterialRevisionResult, { status: 'not_ready' }>['reason']): MaterialRevisionResult => ({ status: 'not_ready', orderRef, reason })
  const replay = await savedMaterialRevision(em, scope, request)
  if (replay) return replay
  const review = await readBriefReview(em, scope, orderRef, request.briefVersionId)
  if (!review?.isCurrent) return unavailable('brief_not_current')
  if (review.documentStatus !== 'ready_for_review' || review.qa.state !== 'assessed'
    || !['needs_client_data', 'ready_for_approval'].includes(review.qa.verdict)) return unavailable('brief_not_reviewable')
  const brief = await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, id: request.briefVersionId, orderRef, templateId: 'WZR-BRIEF' }, undefined, scope)
  const references = inputVersionSchema.array().safeParse(brief?.inputVersions)
  const findings = await currentInputVersion(em, scope, orderRef, 'WZR-USTALENIA')
  const sources = await currentInputVersion(em, scope, orderRef, 'WZR-ZRODLA')
  const audit = await currentInputVersion(em, scope, orderRef, 'WZR-AUDYT')
  const competitors = await currentInputVersion(em, scope, orderRef, 'WZR-KONKURENCJA')
  const orderInput = await currentInputVersion(em, scope, orderRef, 'WZR-ZAMOWIENIE')
  const sourceRun = await findOneWithDecryption(em, AgencyResearchTaskRun, { ...scope, orderRef, stepId: '3.2', status: 'done' }, { orderBy: { createdAt: 'desc' } }, scope)
  const profile = businessProfileSchema.safeParse((sourceRun?.summary as Record<string, unknown> | null)?.businessProfile)
  if (!brief || !references.success || !findings || !sources || !audit || !competitors || !orderInput || !profile.success) return unavailable('input_missing')
  if (brief.status === 'approved') return unavailable('brief_not_reviewable')
  for (const input of [findings, sources, audit, orderInput]) {
    if (!references.data.some((ref) => ref.document_id === input.document_id && ref.version === input.version)) return unavailable('input_changed')
  }
  const sourceData = zrodlaDataSchema.parse(sources.data)
  if (sourceData.sources.some((source) => source.url_or_file === `attachment://${request.material.attachmentId}`)) return unavailable('material_already_registered')
  const findingsData = ustaleniaDataSchema.parse(findings.data)
  if (!findingsData.field_map.some((field) => field.field_key === request.directive.briefField)) return unavailable('input_missing')
  const order = orderFactsOf(orderDataSchema.parse(orderInput.data))
  const inputVersions = [orderInput, findings, sources, audit, competitors].map(pin)
  const claim = await claimMaterialRevision(em, scope, request, { orderRef, brand: order.brand, stepId: MATERIAL_REVISION_STEP,
    attempt: 1, runner: opts.runner, models: opts.models, inputVersions: [...inputVersions, { document_id: documentIdFor('WZR-BRIEF', orderRef), version: review.version, status: brief.status }] })
  if ('existing' in claim) return claim.existing
  const activation = await findOneWithDecryption(em, AgencyResearchTaskRun, { ...scope, id: claim.activationTaskRunId, orderRef, stepId: MATERIAL_REVISION_STEP }, undefined, scope)
  if (!activation) throw new Error('[internal] material revision activation missing')
  const summary = activation.summary as Record<string, unknown>
  const onEvent = opts.onEvent ?? (() => {})
  const ledger = createLedger({ maxPln: request.maxCostPln, onEvent })
  const taskRunIds = [activation.id], documentVersionIds: string[] = [], agentRunIds = opts.agentRunIds ?? []
  const ctx: StepContext = { em, scope, orderRef, order, orderVersion: pin(orderInput), runAgent: opts.runAgent, runner: opts.runner,
    models: opts.models, ledger, cache: opts.cache, onEvent, log: opts.log ?? (() => {}), agentRunIds, taskRunIds, documentVersionIds,
    fetchPage: async () => { throw new Error('[internal] scoped material revision cannot crawl unrelated evidence') }, repairFindings: [], attempt: 1 }
  const outcome: MaterialRevisionOutcome = { status: 'completed', orderRef, submissionId: request.source.submissionId, previousBriefVersionId: request.briefVersionId,
    briefVersionId: null, sourcesVersionId: null, findingsVersionId: null, qaTaskRunId: null, qaVerdict: null, analysisQaTaskRunId: null, freezeTaskRunId: null,
    questions: review.questions.map((question) => ({ questionId: question.question_id, question: question.question })),
    taskRunIds, documentVersionIds, agentRunIds, spentPln: 0 }
  const persist = async () => {
    outcome.spentPln = ledger.snapshot().total
    await finishTaskRun(em, activation, { status: outcome.status === 'paused_budget' ? 'paused_budget' : 'done', outputVersionId: outcome.briefVersionId ?? outcome.sourcesVersionId,
      summary: { ...summary, executionResult: outcome }, agentRunIds, cost: ledger.snapshot() })
    return outcome
  }
  try {
    const step = createStepRunner({ runAgent: opts.runAgent, ledger, models: opts.models, cache: opts.cache, onEvent,
      groundingRetries: limits.generation.groundingRetries,
      timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
      stats: { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 } })
    const storedSources = await findWithDecryption(em, AgencyResearchSource, { ...scope, orderRef }, undefined, scope)
    const appended = await appendMaterialEvidence({ existing: sourceData, order, request, step, reservedSourceIds: storedSources.map((source) => source.sourceId) })
    let revised = findingsData
    if (appended.newFactIds.length) {
      const bank = findingsBankOf(order, order.outputLanguage, appended.data, audytDataSchema.parse(audit.data), konkurencjaDataSchema.parse(competitors.data))
      const seeded = seededFieldRows().filter((field) => field.field_key === request.directive.briefField)
      const mapped = await step({ step: MATERIAL_REVISION_STEP, agentId: RESEARCH_FIELD_MAPPER_AGENT_ID, label: 'material_target_field',
        input: { ...bank, seeded_rows: seeded, repair_findings: [{ path: request.directive.briefField, gap: request.directive.question, fix_hint: `Check new source ${appended.source.source_id}; preserve unrelated findings and client decisions.` }] } satisfies FieldMapperInput,
        parse: (raw) => ({ field_map: fieldMapperResult.parse(raw).data.field_map.map((field) => ({ ...field, priority: seeded[0].priority })) }),
        gate: (value) => { const gated = gateFieldMap(value.field_map, knownIdsOf(appended.data, audytDataSchema.parse(audit.data), konkurencjaDataSchema.parse(competitors.data)), seeded); return { ...gated, value: { field_map: gated.value } } } })
      revised = applyMaterialField(findingsData, mapped.value.field_map[0], request)
      const assessed = await step({ step: MATERIAL_REVISION_STEP, agentId: RESEARCH_READINESS_ASSESSOR_AGENT_ID, label: 'material_findings_readiness',
        input: { order: bank.order, outputLanguage: order.outputLanguage, coverage: bank.coverage, plan_capacity: bank.plan_capacity,
          field_map: revised.field_map, questions: revised.questions.filter((question) => !/^resolved/.test(question.state)).map((question) => ({ question_id: question.question_id, brief_field: question.brief_field, priority: question.priority })),
          evidence_requests: revised.evidence_requests.map((item) => ({ request_id: item.request_id, claim_supported: item.claim_supported })), outputs: [...readinessOutputs],
          gates: ['Uploaded evidence is not a client decision or permission.', 'Only the directed field was supplemented; prior client choices and unrelated findings remain unchanged.'] } satisfies ReadinessAssessorInput,
        parse: (raw) => readinessAssessorResult.parse(raw).data, gate: gateReadiness })
      revised.readiness = assessed.value.readiness
      revised.research_return = assessed.value.research_return
    }
    // Short publication transaction: verify the claimed foundation before writing;
    // model calls run outside it. Draft parent keeps the old brief unapprovable.
    await em.transactional(async (tx) => {
      const parent = await findOneWithDecryption(tx, AgencyResearchDocument, { ...scope, orderRef, templateId: 'WZR-BRIEF', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true }, scope)
      if (!parent || parent.currentVersionId !== request.briefVersionId || parent.status !== 'draft') throw new Error('[internal] material revision brief changed during execution')
      for (const [template, expected] of [['WZR-ZRODLA', sources], ['WZR-USTALENIA', findings], ['WZR-AUDYT', audit], ['WZR-KONKURENCJA', competitors], ['WZR-ZAMOWIENIE', orderInput]] as const) {
        if ((await currentInputVersion(tx, scope, orderRef, template))?.versionId !== expected.versionId) throw new Error('[internal] material revision foundation changed during execution')
      }
      await saveSources(tx, scope, orderRef, activation.id, [appended.source])
      if (!appended.newFactIds.length) {
        // A source attempt is durable, but it has not revised the brief's inputs.
        // Keep the original invitation usable and permit a new corrected upload.
        parent.status = 'ready_for_review'
        await tx.flush()
        return
      }
      const savedSources = await saveDocumentVersion(tx, scope, { orderRef, brand: order.brand, templateId: 'WZR-ZRODLA', status: 'ready_for_review', inputVersions,
        data: appended.data, issues: sources.issues ?? [], taskRunId: activation.id,
        renderedMd: renderZrodla({ brand: order.brand, data: appended.data, businessProfile: profile.data, issues: sources.issues ?? [], versionLabel: String(Number(sources.version.split('.')[0]) + 1) }) })
      outcome.sourcesVersionId = savedSources.version.id
      documentVersionIds.push(savedSources.version.id)
      if (appended.newFactIds.length) {
        const savedFindings = await saveDocumentVersion(tx, scope, { orderRef, brand: order.brand, templateId: 'WZR-USTALENIA', status: 'ready_for_review',
          inputVersions: [...inputVersions.filter((input) => input.document_id !== sources.document_id), pin(savedSources.envelope)],
          data: revised, issues: findings.issues ?? [], taskRunId: activation.id,
          renderedMd: renderUstalenia({ brand: order.brand, data: revised, issues: findings.issues ?? [] }), clientViewMd: renderUstaleniaClientView(revised) })
        outcome.findingsVersionId = savedFindings.version.id
        documentVersionIds.push(savedFindings.version.id)
      }
    })
    if (!appended.newFactIds.length) { outcome.status = 'needs_client_data'; return persist() }
    const analysisQa = await runQaLoop(ctx, { authorSteps: {} })
    outcome.analysisQaTaskRunId = analysisQa.taskRunId
    if (analysisQa.verdict !== 'ready') { outcome.status = 'analysis_blocked'; if (analysisQa.escalationVersionId) outcome.escalationVersionId = analysisQa.escalationVersionId; return persist() }
    outcome.freezeTaskRunId = (await runFreezeStep(ctx)).taskRunId
    await runBriefStep(ctx)
    const qa = await runBriefQaLoop(ctx, { briefStep: runBriefStep })
    outcome.briefVersionId = qa.briefVersionId; outcome.qaTaskRunId = qa.taskRunId; outcome.qaVerdict = qa.verdict
    if (qa.escalationVersionId) outcome.escalationVersionId = qa.escalationVersionId
    outcome.status = qa.verdict === 'needs_client_data' ? 'needs_client_data' : qa.verdict === 'needs_agent_fix' ? 'analysis_blocked' : 'completed'
    if (qa.briefVersionId) {
      const updatedReview = await readBriefReview(em, scope, orderRef, qa.briefVersionId)
      outcome.questions = updatedReview?.questions.map((question) => ({ questionId: question.question_id, question: question.question })) ?? outcome.questions
    }
    return persist()
  } catch (error) {
    if (error instanceof BudgetPausedError) {
      outcome.status = 'paused_budget'
      const escalation = await openEscalation(ctx, { code: 'budget_exhausted', triggerStep: MATERIAL_REVISION_STEP,
        summary: `Material revision paused: ${ledger.snapshot().total} PLN of ${request.maxCostPln} PLN.`,
        evidence: [{ ref: activation.id, fact: 'The exact material revision exhausted its authorized budget; the brief is not approved.' }],
        blockedSteps: ['4.5', '4.1', '4.2', '4.6'], decisionQuestion: 'Who owns the blocked material revision while authorized recovery is unavailable?',
        allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: 'The reason and who must act.', permittedNextStep: 'none' }], resumeStep: '4.5' }, inputVersions)
      outcome.escalationVersionId = escalation.versionId
      return persist()
    }
    await finishTaskRun(em, activation, { status: 'failed', summary, agentRunIds, cost: ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    return { status: 'execution_incomplete', orderRef, activationTaskRunId: activation.id, reason: 'failed' }
  }
}
