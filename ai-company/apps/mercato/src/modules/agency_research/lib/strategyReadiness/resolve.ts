import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema, type TemplateId } from '../../data/schemas/envelope'
import { briefAcceptanceRecordSchema } from '../briefAcceptance/contracts'
import { documentIdFor, versionLabel } from '../research/envelope'
import type { ResearchScope } from '../store'
import { strategyReadinessRequestSchema, type StrategyReadiness, type StrategyReadinessReason, type StrategyDocumentReference } from './contracts'

const analysisTemplates: TemplateId[] = ['WZR-ZRODLA', 'WZR-AUDYT', 'WZR-KONKURENCJA', 'WZR-USTALENIA']
// These are the analysis inputs actually read and pinned by runBriefStep.
const briefAnalysisTemplates: TemplateId[] = ['WZR-ZRODLA', 'WZR-AUDYT', 'WZR-USTALENIA']
const inputsSchema = z.array(inputVersionSchema)
const freezeSummarySchema = z.object({ frozen: z.literal(true), set_hash: z.string().min(1), qa_task_run_id: z.uuid() })
const qaSchema = z.object({ verdict: z.literal('ready') })

/** Readiness only: no model invocation, document mutation, acceptance or strategy creation. */
export async function resolveStrategyReadiness(em: EntityManager, scope: ResearchScope, rawInput: unknown): Promise<StrategyReadiness> {
  const input = strategyReadinessRequestSchema.parse(rawInput)
  const where = { tenantId: scope.tenantId, organizationId: scope.organizationId, orderRef: input.orderRef }
  const notReady = (reason: StrategyReadinessReason, templateId?: string): StrategyReadiness => ({
    status: 'not_ready', orderRef: input.orderRef, reason, ...(templateId ? { templateId } : {}),
  })
  if (!input.process) return notReady('missing_process_configuration')

  const brief = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...where, id: input.briefVersionId, templateId: 'WZR-BRIEF',
  }, undefined, scope)
  if (!brief) return notReady('brief_not_found')
  const briefDocument = await findOneWithDecryption(em, AgencyResearchDocument, {
    ...where, id: brief.documentId, templateId: 'WZR-BRIEF', deletedAt: null,
  }, undefined, scope)
  if (!briefDocument) return notReady('brief_not_found')
  if (briefDocument.currentVersionId !== brief.id) return notReady('brief_not_current')
  if (briefDocument.status !== 'approved' || brief.status !== 'approved' || brief.simulationFlag) return notReady('brief_not_approved')
  const acceptance = (Array.isArray(brief.approvalRecords) ? brief.approvalRecords : [])
    .map((record) => briefAcceptanceRecordSchema.safeParse(record))
    .find((record) => record.success && record.data.documentVersionId === brief.id
      && record.data.version === versionLabel(brief.versionNo)
      && record.data.source.submissionId === input.acceptanceSubmissionId)
  if (!acceptance?.success) return notReady('acceptance_not_found')

  // Read the persisted freeze, never reconstruct a package from whatever happens
  // to be latest now. A newer unsuccessful freeze cannot fall back to an older one.
  const frozen = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...where, stepId: '3.8',
  }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
  if (!frozen) return notReady('frozen_analysis_not_found')
  const summary = freezeSummarySchema.safeParse(frozen.summary)
  const pinned = inputsSchema.safeParse(frozen.inputVersions)
  if (frozen.status !== 'done' || !summary.success || !pinned.success) return notReady('frozen_analysis_invalid')
  const qa = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...where, id: summary.data.qa_task_run_id, stepId: '3.7',
  }, undefined, scope)
  if (!qa || qa.status !== 'done' || !qaSchema.safeParse(qa.qaResult).success) return notReady('analysis_qa_not_ready')
  const qaInputs = inputsSchema.safeParse(qa.inputVersions)
  if (!qaInputs.success) return notReady('analysis_qa_versions_mismatch')

  const documents: StrategyDocumentReference[] = []
  for (const templateId of analysisTemplates) {
    const documentRef = documentIdFor(templateId, input.orderRef)
    const versions = pinned.data.filter((version) => version.document_id === documentRef)
    if (versions.length !== 1) return notReady('frozen_analysis_invalid', templateId)
    const pin = versions[0]
    const checked = qaInputs.data.filter((version) => version.document_id === documentRef)
    if (checked.length !== 1 || checked[0].version !== pin.version) return notReady('analysis_qa_versions_mismatch', templateId)
    const document = await findOneWithDecryption(em, AgencyResearchDocument, {
      ...where, templateId, deletedAt: null,
    }, undefined, scope)
    if (!document) return notReady('analysis_version_not_found', templateId)
    // The public envelope uses N.0 while persistence uses versionNo. Refuse an
    // unsupported label rather than silently resolving a different/latest row.
    const match = /^([1-9]\d*)\.0$/.exec(pin.version)
    if (!match) return notReady('frozen_analysis_invalid', templateId)
    const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, documentId: document.id, templateId, versionNo: Number(match[1]),
    }, undefined, scope)
    if (!version) return notReady('analysis_version_not_found', templateId)
    if (document.currentVersionId !== version.id) return notReady('analysis_not_current', templateId)
    if (!['ready_for_review', 'approved'].includes(document.status)
      || !['ready_for_review', 'approved'].includes(version.status) || version.simulationFlag) return notReady('analysis_requires_review', templateId)
    documents.push({ documentId: document.id, versionId: version.id, documentRef, version: pin.version, templateId })
  }
  const briefInputs = inputsSchema.safeParse(brief.inputVersions)
  if (!briefInputs.success) return notReady('brief_dependencies_mismatch')
  for (const templateId of briefAnalysisTemplates) {
    const reference = documents.find((document) => document.templateId === templateId)!
    const pins = briefInputs.data.filter((pin) => pin.document_id === reference.documentRef)
    if (pins.length !== 1 || pins[0].version !== reference.version) return notReady('brief_dependencies_mismatch', templateId)
  }
  return {
    status: 'ready', orderRef: input.orderRef,
    brief: { documentId: brief.documentId, versionId: brief.id, documentRef: documentIdFor('WZR-BRIEF', input.orderRef), version: versionLabel(brief.versionNo), templateId: 'WZR-BRIEF' },
    acceptance: acceptance.data,
    analysis: { freezeTaskRunId: frozen.id, qaTaskRunId: qa.id, setHash: summary.data.set_hash, documents },
    process: input.process,
  }
}
