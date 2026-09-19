import { z } from 'zod'
import type { ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema, type InputVersion, type TemplateId } from '../../data/schemas/envelope'
import { planDataSchema } from '../../data/schemas/plan'
import { briefDataSchema } from '../../data/schemas/brief'
import { strategiaDataSchema } from '../../data/schemas/strategia'
import { zrodlaDataSchema } from '../../data/schemas/zrodla'
import { orderDataSchema, orderFactsOf } from '../../data/schemas/zamowienie'
import { readPlanAcceptance } from '../planAcceptance/read'
import { documentIdFor, versionLabel } from '../research/envelope'
import { assemblePostInstruction } from '../research/steps/postInstruction'
import { parseDownstreamTov, specialistTovInput } from '../research/steps/tovInput'
import type { StrategyExecutionInput } from '../research/steps/context'
import { renderZleceniePostu } from '../research/render/zleceniePostu'
import { startTaskRun, finishTaskRun, saveDocumentVersion, type ResearchScope } from '../store'
import { postInstructionExecutionRequestSchema, postInstructionReadySchema,
  type PostInstructionExecutionRequest, type PostInstructionExecutionResult } from './contracts'

export type RunPostInstructionExecutionOptions = {
  em: EntityManager
  scope: ResearchScope
  request: PostInstructionExecutionRequest
  readSpecialistTov?: ReadSpecialistTov
}

export async function runPostInstructionExecution(opts: RunPostInstructionExecutionOptions): Promise<PostInstructionExecutionResult> {
  const request = postInstructionExecutionRequestSchema.parse(opts.request)
  const { scope } = opts
  const { orderRef, planVersionId } = request
  const where = { ...scope, orderRef }
  const notReady = (reason: Extract<PostInstructionExecutionResult, { status: 'not_ready' }>['reason'], templateId?: string): PostInstructionExecutionResult => ({
    status: 'not_ready', orderRef, reason, ...(templateId ? { templateId } : {}),
  })
  return opts.em.transactional<PostInstructionExecutionResult>(async (em) => {
    const briefDocument = await findOneWithDecryption(em, AgencyResearchDocument, {
      ...where, templateId: 'WZR-BRIEF', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!briefDocument) return notReady('brief_not_found')
    const accepted = opts.readSpecialistTov
      ? await readPlanAcceptance(em, scope, { orderRef, planVersionId }, opts.readSpecialistTov)
      : await readPlanAcceptance(em, scope, { orderRef, planVersionId })
    if (accepted.status === 'not_ready') return accepted
    const receipt = accepted.receipt
    if (!receipt || accepted.plan.documentStatus !== 'approved' || accepted.plan.versionStatus !== 'approved') return notReady('selection_missing')
    if (request.selectionSubmissionId && request.selectionSubmissionId !== receipt.source.submissionId) return notReady('selection_superseded')
    const planRow = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, id: planVersionId, documentId: accepted.plan.documentId, templateId: 'WZR-PLAN',
    }, undefined, scope)
    if (!planRow) return notReady('plan_not_found')
    const plan = planDataSchema.safeParse(planRow.data)
    const pins = z.array(inputVersionSchema).safeParse(planRow.inputVersions)
    if (!plan.success || !pins.success) return notReady('plan_invalid')
    if (!plan.data.topics.some((topic) => topic.topic_id === receipt.selectedTopicId)) return notReady('selected_topic_missing')
    const dependencies = new Map<TemplateId, AgencyResearchDocumentVersion>()
    const expectedClientIds: Partial<Record<TemplateId, string>> = {
      'WZR-BRIEF': accepted.briefVersionId, 'WZR-STRATEGIA': accepted.strategyVersionId,
    }
    for (const templateId of ['WZR-ZAMOWIENIE', 'WZR-BRIEF', 'WZR-STRATEGIA', 'WZR-ZRODLA', 'WZR-KONKURENCJA'] as const) {
      const matchingPins = pins.data.filter((pin) => pin.document_id === documentIdFor(templateId, orderRef))
      if (matchingPins.length !== 1 || !/^[1-9]\d*\.0$/.test(matchingPins[0].version)) return notReady('dependency_missing', templateId)
      const document = templateId === 'WZR-BRIEF' ? briefDocument : await findOneWithDecryption(em, AgencyResearchDocument, {
        ...where, templateId, deletedAt: null,
      }, undefined, scope)
      if (!document) return notReady('dependency_missing', templateId)
      const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
        ...where, documentId: document.id, templateId, versionNo: Number(matchingPins[0].version.split('.')[0]),
      }, undefined, scope)
      if (!version) return notReady('dependency_missing', templateId)
      if (document.currentVersionId !== version.id) return notReady('dependency_not_current', templateId)
      if (version.simulationFlag || ['needs_review', 'blocked'].includes(document.status) || ['needs_review', 'blocked'].includes(version.status)
        || (expectedClientIds[templateId] && (expectedClientIds[templateId] !== version.id || document.status !== 'approved' || version.status !== 'approved'))) {
        return notReady('dependency_requires_review', templateId)
      }
      dependencies.set(templateId, version)
    }
    const orderRow = dependencies.get('WZR-ZAMOWIENIE')!
    const briefRow = dependencies.get('WZR-BRIEF')!
    const strategyRow = dependencies.get('WZR-STRATEGIA')!
    const specialistTov = accepted.specialistTov && opts.readSpecialistTov
      ? await opts.readSpecialistTov(scope, accepted.specialistTov)
      : null
    const legacyTovPin = accepted.specialistTov ? null : pins.data.find((pin) => pin.document_id === documentIdFor('WZR-TOV', orderRef))
    const legacyTovDocument = legacyTovPin ? await findOneWithDecryption(em, AgencyResearchDocument, {
      ...where, templateId: 'WZR-TOV', deletedAt: null,
    }, undefined, scope) : null
    const tovRow = legacyTovDocument && legacyTovPin ? await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, documentId: legacyTovDocument.id, templateId: 'WZR-TOV', versionNo: Number(legacyTovPin.version.split('.')[0]),
    }, undefined, scope) : null
    if (accepted.specialistTov
      ? !specialistTov || !specialistTov.isCurrent || specialistTov.documentId !== accepted.specialistTov.documentId
        || specialistTov.versionId !== accepted.tovVersionId || specialistTov.version !== accepted.specialistTov.version
      : !legacyTovPin || !tovRow || !legacyTovDocument || legacyTovDocument.currentVersionId !== tovRow.id
        || tovRow.id !== accepted.tovVersionId || legacyTovDocument.status !== 'approved' || tovRow.status !== 'approved') {
      return notReady('dependency_requires_review', 'WZR-TOV')
    }
    const tovInput: StrategyExecutionInput = specialistTov ? specialistTovInput(specialistTov) : {
      document_id: documentIdFor('WZR-TOV', orderRef), version: versionLabel(tovRow!.versionNo), status: tovRow!.status,
      versionId: tovRow!.id, data: tovRow!.data,
    }
    const sourcesRow = dependencies.get('WZR-ZRODLA')!
    const orderData = orderDataSchema.safeParse(orderRow.data)
    const brief = briefDataSchema.safeParse(briefRow.data)
    const strategy = strategiaDataSchema.safeParse(strategyRow.data)
    const sources = zrodlaDataSchema.safeParse(sourcesRow.data)
    if (!orderData.success || !brief.success || !strategy.success || !sources.success) return notReady('dependency_invalid')
    const pin = (row: AgencyResearchDocumentVersion): InputVersion => ({
      document_id: documentIdFor(row.templateId as TemplateId, orderRef), version: versionLabel(row.versionNo), status: row.status,
    })
    const inputVersions = [pin(planRow), ...[...dependencies.values()].map(pin), {
      document_id: tovInput.document_id, version: tovInput.version, status: tovInput.status,
      ...(tovInput.specialistTov ? { specialistTov: tovInput.specialistTov } : {}),
    }]
    const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...where, stepId: '6.7' }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
    const previous = runs.find((run) => {
      const summary = run.summary as Record<string, unknown> | null
      return summary?.planVersionId === planVersionId && summary?.selectionSubmissionId === receipt.source.submissionId
        && summary?.selectedTopicId === receipt.selectedTopicId
    })
    if (previous?.outputVersionId) {
      const instruction = await findOneWithDecryption(em, AgencyResearchDocument, {
        ...where, templateId: 'WZR-ZLECENIE-POSTU', currentVersionId: previous.outputVersionId, deletedAt: null,
      }, undefined, scope)
      if (!instruction) return notReady('instruction_not_current')
      if (previous.status === 'to_fix' || instruction.status === 'blocked') {
        const blocked = z.object({ issueCodes: z.array(z.string()).optional() }).safeParse((previous.summary as Record<string, unknown>).result)
        return { status: 'not_ready', orderRef, reason: 'compiler_blocked', taskRunId: previous.id, instructionVersionId: previous.outputVersionId,
          ...(blocked.success && blocked.data.issueCodes ? { issueCodes: blocked.data.issueCodes } : {}) }
      }
      if (!['ready_for_review', 'approved'].includes(instruction.status)) return notReady('dependency_requires_review', 'WZR-ZLECENIE-POSTU')
      const replay = postInstructionReadySchema.safeParse((previous.summary as Record<string, unknown>).result)
      if (previous.status === 'done' && replay.success && replay.data.instructionVersionId === previous.outputVersionId
        && replay.data.instructionDocumentId === instruction.id) return { ...replay.data, replayed: true }
      return notReady('instruction_not_current')
    }

    const order = orderFactsOf(orderData.data)
    const compiled = assemblePostInstruction({
      order, outputLanguage: order.outputLanguage,
      plan: { ...plan.data, selected_topic: {
        topic_id: receipt.selectedTopicId, status: 'client_selected', decision_id: receipt.source.submissionId,
        decision_version: receipt.version, decision_text: null, real_approval: true,
      } },
      planVersion: pin(planRow), strategia: strategy.data, tov: parseDownstreamTov(tovInput),
      tovVersion: { document_id: tovInput.document_id, version: tovInput.version, status: tovInput.status,
        ...(tovInput.specialistTov ? { specialistTov: tovInput.specialistTov } : {}) },
      brief: brief.data, zrodla: sources.data,
    })
    const blocked = compiled.issues.filter((issue) => issue.severity === 'blocking')
    const task = await startTaskRun(em, scope, { orderRef, brand: order.brand, stepId: '6.7', attempt: 1, runner: 'system', models: {}, inputVersions })
    const saved = await saveDocumentVersion(em, scope, {
      orderRef, brand: order.brand, templateId: 'WZR-ZLECENIE-POSTU', status: blocked.length ? 'blocked' : 'ready_for_review',
      inputVersions, data: compiled.data as unknown as Record<string, unknown>, issues: compiled.issues,
      renderedMd: renderZleceniePostu({ outputLanguage: order.outputLanguage, brand: order.brand, data: compiled.data, issues: compiled.issues }),
      taskRunId: task.id, simulation: false,
    })
    const result: PostInstructionExecutionResult = blocked.length
      ? { status: 'not_ready', orderRef, reason: 'compiler_blocked', taskRunId: task.id, instructionVersionId: saved.version.id, issueCodes: blocked.map((issue) => issue.code) }
      : { status: 'ready', orderRef, planVersionId, selectedTopicId: receipt.selectedTopicId, selectionSubmissionId: receipt.source.submissionId,
          taskRunId: task.id, instructionDocumentId: saved.document.id, instructionVersionId: saved.version.id,
          instructionVersion: saved.envelope.version, replayed: false }
    await finishTaskRun(em, task, {
      status: blocked.length ? 'to_fix' : 'done', outputVersionId: saved.version.id,
      summary: { planVersionId, selectedTopicId: receipt.selectedTopicId, selectionSubmissionId: receipt.source.submissionId,
        selectionReceipt: receipt, inputVersions, result },
    })
    return result
  })
}
