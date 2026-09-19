import { z } from 'zod'
import type { ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema, type TemplateId } from '../../data/schemas/envelope'
import { orderDataSchema, orderFactsOf, type OrderFacts } from '../../data/schemas/zamowienie'
import { zleceniePostuDataSchema } from '../../data/schemas/zleceniePostu'
import { readPlanAcceptance } from '../planAcceptance/read'
import { postInstructionReadySchema } from '../postInstructionExecution/contracts'
import { documentIdFor, versionLabel } from '../research/envelope'
import type { StrategyExecutionInput } from '../research/steps/context'
import { parseDownstreamTov, specialistTovInput } from '../research/steps/tovInput'
import type { ResearchScope } from '../store'
import type { PostExecutionNotReady, PostExecutionRequest } from './contracts'

export type PostExecutionReady = {
  status: 'ready'; order: OrderFacts; orderInput: StrategyExecutionInput;
  instruction: StrategyExecutionInput; tov: StrategyExecutionInput;
  planVersionId: string; selectedTopicId: string; instructionTaskRunId: string;
}

export async function readPostExecutionInputs(em: EntityManager, scope: ResearchScope, request: PostExecutionRequest, readSpecialistTov?: ReadSpecialistTov): Promise<PostExecutionReady | PostExecutionNotReady> {
  const { orderRef, instructionVersionId, selectionSubmissionId } = request
  const where = { ...scope, orderRef }
  const notReady = (reason: string, templateId?: string): PostExecutionNotReady => ({ status: 'not_ready', orderRef, reason, ...(templateId ? { templateId } : {}) })
  const instructionDocument = await findOneWithDecryption(em, AgencyResearchDocument, {
    ...where, templateId: 'WZR-ZLECENIE-POSTU', deletedAt: null,
  }, undefined, scope)
  if (!instructionDocument || instructionDocument.currentVersionId !== instructionVersionId) return notReady('instruction_not_current')
  const instructionRow = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...where, id: instructionVersionId, documentId: instructionDocument.id, templateId: 'WZR-ZLECENIE-POSTU',
  }, undefined, scope)
  if (!instructionRow || instructionRow.simulationFlag || !['ready_for_review', 'approved'].includes(instructionRow.status)
    || !['ready_for_review', 'approved'].includes(instructionDocument.status)) return notReady('instruction_not_ready')
  const instruction = zleceniePostuDataSchema.safeParse(instructionRow.data)
  const pins = z.array(inputVersionSchema).safeParse(instructionRow.inputVersions)
  if (!instruction.success || !pins.success) return notReady('instruction_invalid')
  const compiler = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...where, stepId: '6.7', status: 'done', outputVersionId: instructionVersionId,
  }, undefined, scope)
  const compiled = postInstructionReadySchema.safeParse((compiler?.summary as Record<string, unknown> | null)?.result)
  if (!compiler || !compiled.success || compiled.data.taskRunId !== compiler.id
    || compiled.data.instructionDocumentId !== instructionDocument.id || compiled.data.instructionVersionId !== instructionVersionId
    || compiled.data.orderRef !== orderRef || compiled.data.selectionSubmissionId !== selectionSubmissionId) return notReady('instruction_selection_missing')
  const acceptanceInput = { orderRef, planVersionId: compiled.data.planVersionId }
  const accepted = readSpecialistTov
    ? await readPlanAcceptance(em, scope, acceptanceInput, readSpecialistTov)
    : await readPlanAcceptance(em, scope, acceptanceInput)
  if (accepted.status === 'not_ready') return accepted
  const receipt = accepted.receipt
  if (!receipt || accepted.plan.documentStatus !== 'approved' || accepted.plan.versionStatus !== 'approved') return notReady('selection_missing')
  if (receipt.source.submissionId !== selectionSubmissionId || receipt.selectedTopicId !== compiled.data.selectedTopicId) return notReady('selection_superseded')
  const selected = instruction.data.selected_item
  if (selected.selection_status !== 'client_selected' || selected.decision_id !== selectionSubmissionId
    || selected.topic_id !== receipt.selectedTopicId || selected.plan_id !== documentIdFor('WZR-PLAN', orderRef)
    || selected.plan_version !== accepted.plan.version) return notReady('instruction_selection_mismatch')

  const expectedIds: Partial<Record<TemplateId, string>> = {
    'WZR-PLAN': accepted.plan.versionId, 'WZR-BRIEF': accepted.briefVersionId,
    'WZR-STRATEGIA': accepted.strategyVersionId,
  }
  const snapshot = (row: AgencyResearchDocumentVersion): StrategyExecutionInput => ({
    document_id: documentIdFor(row.templateId as TemplateId, orderRef), version: versionLabel(row.versionNo),
    status: row.status, versionId: row.id, data: row.data,
  })
  const dependencies = new Map<TemplateId, StrategyExecutionInput>()
  for (const templateId of ['WZR-PLAN', 'WZR-ZAMOWIENIE', 'WZR-BRIEF', 'WZR-STRATEGIA', 'WZR-ZRODLA', 'WZR-KONKURENCJA'] as const) {
    const matches = pins.data.filter((pin) => pin.document_id === documentIdFor(templateId, orderRef))
    if (matches.length !== 1 || !/^[1-9]\d*\.0$/.test(matches[0].version)) return notReady('pinned_input_missing', templateId)
    const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId, deletedAt: null }, undefined, scope)
    if (!document) return notReady('pinned_input_missing', templateId)
    const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, documentId: document.id, templateId, versionNo: Number(matches[0].version.split('.')[0]),
    }, undefined, scope)
    if (!version || document.currentVersionId !== version.id) return notReady('pinned_input_not_current', templateId)
    if (version.simulationFlag || ['needs_review', 'blocked'].includes(document.status) || ['needs_review', 'blocked'].includes(version.status)
      || (expectedIds[templateId] && (expectedIds[templateId] !== version.id || document.status !== 'approved' || version.status !== 'approved'))) return notReady('pinned_input_not_accepted', templateId)
    dependencies.set(templateId, snapshot(version))
  }
  const orderInput = dependencies.get('WZR-ZAMOWIENIE')!
  const specialistTov = accepted.specialistTov && readSpecialistTov ? await readSpecialistTov(scope, accepted.specialistTov) : null
  let tov: StrategyExecutionInput | null = null
  if (accepted.specialistTov) {
    const pin = pins.data.find((input) => input.document_id === `agency_tov:${accepted.specialistTov!.documentId}`
      && input.version === accepted.specialistTov!.version && input.specialistTov?.versionId === accepted.specialistTov!.versionId)
    if (!pin || !specialistTov || !specialistTov.isCurrent || specialistTov.versionId !== accepted.tovVersionId) {
      return notReady('pinned_input_not_accepted', 'WZR-TOV')
    }
    tov = specialistTovInput(specialistTov)
  } else {
    const matches = pins.data.filter((pin) => pin.document_id === documentIdFor('WZR-TOV', orderRef))
    const document = matches.length === 1 ? await findOneWithDecryption(em, AgencyResearchDocument, {
      ...where, templateId: 'WZR-TOV', deletedAt: null,
    }, undefined, scope) : null
    const version = document && /^[1-9]\d*\.0$/.test(matches[0].version) ? await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, documentId: document.id, templateId: 'WZR-TOV', versionNo: Number(matches[0].version.split('.')[0]),
    }, undefined, scope) : null
    if (!document || !version || document.currentVersionId !== version.id || version.id !== accepted.tovVersionId
      || document.status !== 'approved' || version.status !== 'approved' || version.simulationFlag) return notReady('pinned_input_not_accepted', 'WZR-TOV')
    tov = snapshot(version)
  }
  const order = orderDataSchema.safeParse(orderInput.data)
  if (!order.success) return notReady('pinned_input_invalid')
  try { parseDownstreamTov(tov) } catch { return notReady('pinned_input_invalid') }
  if (instruction.data.voice_extract.tov_id !== tov.document_id || instruction.data.voice_extract.tov_version !== tov.version) return notReady('instruction_tov_mismatch')
  return { status: 'ready', order: orderFactsOf(order.data), orderInput, tov, instruction: snapshot(instructionRow),
    planVersionId: accepted.plan.versionId, selectedTopicId: receipt.selectedTopicId, instructionTaskRunId: compiler.id }
}
