import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { adapterFor } from '../../data/adapters'
import { inputVersionSchema, type InputVersion, type DocumentIssue } from '../../data/schemas/envelope'
import { postDataSchema } from '../../data/schemas/post'
import { orderDataSchema, orderFactsOf } from '../../data/schemas/zamowienie'
import { konfigPublikacjiDataSchema } from '../../data/schemas/konfigPublikacji'
import { zleceniePostuDataSchema } from '../../data/schemas/zleceniePostu'
import { readPostAcceptance } from '../postAcceptance/read'
import { readPublicationConsent, publicationConsentCheckOf } from '../publicationConsent/read'
import { documentIdFor, versionLabel } from '../research/envelope'
import { buildPublicationConfig, buildPublicationOrder } from '../research/publication'
import { renderKonfigPublikacji } from '../research/render/konfigPublikacji'
import { renderZleceniePublikacji } from '../research/render/zleceniePublikacji'
import { startTaskRun, finishTaskRun, saveDocumentVersion } from '../store'
import { preparePublicationInputSchema, publicationPreparationPreparedSchema, type PublicationPreparationResult } from './contracts'

/** Deterministic 7.7 preparation only. No adapter execution, reservation, or fabricated attempt. */
export async function preparePublication(manager: EntityManager, rawInput: unknown): Promise<PublicationPreparationResult> {
  const { context, request } = preparePublicationInputSchema.parse(rawInput)
  const { orderRef, postVersionId, acceptanceSubmissionId } = request
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  const where = { ...scope, orderRef }
  const notReady = (reason: Extract<PublicationPreparationResult, { status: 'not_ready' }>['reason']): PublicationPreparationResult => ({ status: 'not_ready', orderRef, reason })
  return manager.transactional<PublicationPreparationResult>(async (em) => {
    const brief = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-BRIEF', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!brief) return notReady('pinned_input_missing')
    const accepted = await readPostAcceptance(em, scope, { orderRef, postVersionId })
    if (accepted.status === 'not_ready') return accepted
    const receipt = accepted.receipt
    if (!receipt || accepted.post.documentStatus !== 'approved' || accepted.post.versionStatus !== 'approved') return notReady('acceptance_missing')
    if (receipt.source.submissionId !== acceptanceSubmissionId) return notReady('acceptance_superseded')
    const postRow = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, id: postVersionId, documentId: accepted.post.documentId, templateId: 'WZR-POST',
    }, undefined, scope)
    if (!postRow) return notReady('post_not_found')
    const post = postDataSchema.safeParse(postRow.data)
    const pins = z.array(inputVersionSchema).safeParse(postRow.inputVersions)
    if (!post.success || !pins.success) return notReady('pinned_input_invalid')
    const loadPin = async (templateId: 'WZR-ZAMOWIENIE' | 'WZR-ZLECENIE-POSTU') => {
      const matching = pins.data.filter((pin) => pin.document_id === documentIdFor(templateId, orderRef))
      if (matching.length !== 1 || !/^[1-9]\d*\.0$/.test(matching[0].version)) return null
      return findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...where, templateId, versionNo: Number(matching[0].version.split('.')[0]) }, undefined, scope)
    }
    const orderRow = await loadPin('WZR-ZAMOWIENIE')
    const instructionRow = await loadPin('WZR-ZLECENIE-POSTU')
    if (!orderRow || !instructionRow) return notReady('pinned_input_missing')
    const orderData = orderDataSchema.safeParse(orderRow.data)
    const instruction = z.object({ delivery_constraints: zleceniePostuDataSchema.shape.delivery_constraints.pick({ cta_publication_readiness: true }) }).safeParse(instructionRow.data)
    if (!orderData.success || !instruction.success) return notReady('pinned_input_invalid')
    const order = orderFactsOf(orderData.data)
    const lang = order.outputLanguage
    const pin = (row: AgencyResearchDocumentVersion): InputVersion => ({ document_id: documentIdFor(row.templateId as 'WZR-POST', orderRef), version: versionLabel(row.versionNo), status: row.status })
    const inputVersions = [pin(postRow), pin(orderRow), pin(instructionRow)]
    // Preserve an existing configured destination; never replace it with a guessed profile URL.
    const configDocument = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-KONFIG-PUBLIKACJI', deletedAt: null }, undefined, scope)
    let configRow = configDocument?.currentVersionId ? await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...where, id: configDocument.currentVersionId, documentId: configDocument.id, templateId: 'WZR-KONFIG-PUBLIKACJI',
    }, undefined, scope) : null
    if (configDocument && !configRow) return notReady('pinned_input_missing')
    const existingConfig = configRow ? konfigPublikacjiDataSchema.safeParse(configRow.data) : null
    if (existingConfig && !existingConfig.success) return notReady('pinned_input_invalid')
    const builtConfig = existingConfig?.success ? { data: existingConfig.data, blockers: existingConfig.data.readiness.blockers } : buildPublicationConfig({ order }, lang)
    let consent = await readPublicationConsent(em, scope, { orderRef, postVersionId })
    const preparationInputs = { configVersionId: configRow?.id ?? null, publicationConsent: consent }
    const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...where, stepId: '7.7' }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
    const previous = runs.find((run) => {
      const summary = run.summary as Record<string, unknown> | null
      return summary?.postVersionId === postVersionId && summary?.acceptanceSubmissionId === acceptanceSubmissionId
        && isDeepStrictEqual(summary.preparationInputs, preparationInputs)
    })
    if (previous) {
      const saved = publicationPreparationPreparedSchema.safeParse((previous.summary as Record<string, unknown>).preparationResult)
      if (previous.status === 'done' && saved.success && saved.data.orderRef === orderRef && saved.data.taskRunId === previous.id
        && saved.data.postVersionId === postVersionId && saved.data.acceptanceSubmissionId === acceptanceSubmissionId
        && saved.data.configVersionId === configRow?.id && saved.data.instructionVersionId === previous.outputVersionId) return { ...saved.data, replayed: true }
      return notReady('saved_preparation_incomplete')
    }
    const run = await startTaskRun(em, scope, { orderRef, brand: order.brand, stepId: '7.7', attempt: 1, runner: 'system', models: {}, inputVersions })
    if (!configRow) {
      const configIssues: DocumentIssue[] = builtConfig.blockers.map((blocker) => ({ code: 'PUBLICATION_CONFIG_MISSING', severity: 'blocking_publication', detail: blocker, path: 'readiness.blockers' }))
      const savedConfig = await saveDocumentVersion(em, scope, { orderRef, brand: order.brand, templateId: 'WZR-KONFIG-PUBLIKACJI',
        status: builtConfig.data.readiness.state === 'ready' ? 'ready_for_review' : 'blocked', inputVersions: [pin(orderRow)],
        data: builtConfig.data as unknown as Record<string, unknown>, issues: configIssues,
        renderedMd: renderKonfigPublikacji({ outputLanguage: lang, brand: order.brand, data: builtConfig.data, issues: configIssues }), taskRunId: run.id,
      })
      configRow = savedConfig.version
      // The newly persisted config is part of replay identity, including its
      // real target (if any). Never cache the pre-configuration consent read.
      consent = await readPublicationConsent(em, scope, { orderRef, postVersionId })
    }
    preparationInputs.configVersionId = configRow.id
    preparationInputs.publicationConsent = consent
    const configPin = pin(configRow)
    const { person, at, scope: approvalScope, version } = receipt
    const built = buildPublicationOrder({ orderRef, post: post.data,
      postVersion: { documentId: documentIdFor('WZR-POST', orderRef), version: accepted.post.version, status: 'approved', isCurrent: true,
        approvalRecords: [{ person, at, scope: approvalScope, version }] },
      config: builtConfig.data, configVersion: configPin, adapter: adapterFor(builtConfig.data.platform.platform),
      publicationConsent: publicationConsentCheckOf(consent),
      ctaPublicationReadiness: instruction.data.delivery_constraints.cta_publication_readiness,
    }, lang)
    const issues: DocumentIssue[] = built.data.preflight.check_results.filter((check) => check.result !== 'pass')
      .map((check) => ({ code: `PREFLIGHT_${check.gate.toUpperCase()}`, severity: 'blocking_publication', detail: check.detail ?? check.result, path: `preflight.check_results.${check.gate}` }))
    run.inputVersions = [...inputVersions, configPin]
    const saved = await saveDocumentVersion(em, scope, { orderRef, brand: order.brand, templateId: 'WZR-ZLECENIE-PUBLIKACJI', status: 'blocked',
      inputVersions: run.inputVersions as InputVersion[], data: built.data as unknown as Record<string, unknown>, issues,
      renderedMd: renderZleceniePublikacji({ outputLanguage: lang, brand: order.brand, data: built.data, issues }), taskRunId: run.id,
    })
    const result = publicationPreparationPreparedSchema.parse({ status: 'prepared', orderRef, postVersionId, acceptanceSubmissionId,
      taskRunId: run.id, instructionVersionId: saved.version.id, configVersionId: configRow.id, contentHash: built.contentHash,
      contentApproval: built.data.content_approval_check.state, publicationConsent: built.data.publication_consent_check.state,
      canSend: false, missingGates: built.data.preflight.check_results.filter((check) => check.result !== 'pass').map((check) => check.gate), replayed: false,
    })
    await finishTaskRun(em, run, { status: 'done', outputVersionId: saved.version.id,
      summary: { postVersionId, acceptanceSubmissionId, acceptance: receipt, preparationInputs, preparationResult: result },
    })
    return result
  })
}
