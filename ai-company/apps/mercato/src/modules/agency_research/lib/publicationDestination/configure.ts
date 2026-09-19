import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { orderDataSchema, orderFactsOf } from '../../data/schemas/zamowienie'
import { konfigPublikacjiDataSchema } from '../../data/schemas/konfigPublikacji'
import { buildPublicationConfig } from '../research/publication'
import { renderKonfigPublikacji } from '../research/render/konfigPublikacji'
import { documentIdFor, versionLabel } from '../research/envelope'
import { finishTaskRun, saveDocumentVersion, startTaskRun } from '../store'
import { configurePublicationDestinationInputSchema, type PublicationDestinationResult } from './contracts'

/** Trusted native-channel metadata only; no validation call, consent or publication. */
export async function configurePublicationDestination(manager: EntityManager, rawInput: unknown): Promise<PublicationDestinationResult> {
  const { context, request } = configurePublicationDestinationInputSchema.parse(rawInput)
  const { orderRef } = request
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  const where = { ...scope, orderRef, deletedAt: null }
  const notReady = (reason: 'order_not_ready' | 'configuration_invalid'): PublicationDestinationResult => ({ status: 'not_ready', orderRef, canSend: false, reason })
  return manager.transactional(async (em): Promise<PublicationDestinationResult> => {
    // Same short lock used by consent and 7.7 preparation; no network under it.
    const brief = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-BRIEF' }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!brief) return notReady('order_not_ready')
    const orderDocument = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-ZAMOWIENIE' }, undefined, scope)
    const orderRow = orderDocument?.currentVersionId ? await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...scope, orderRef, documentId: orderDocument.id, id: orderDocument.currentVersionId, templateId: 'WZR-ZAMOWIENIE',
    }, undefined, scope) : null
    const parsed = orderDataSchema.safeParse(orderRow?.data)
    if (!orderRow || !parsed.success) return notReady('order_not_ready')
    const order = orderFactsOf(parsed.data)
    const built = buildPublicationConfig({ order: { ...order, officialSocialPlatform: 'Discord', officialSocialUrl: null },
      connectionRef: `communication_channels:${request.nativeChannelId}:credentials:${request.credentialsRef}` }, order.outputLanguage)
    const blockers = built.blockers.filter((blocker) => blocker.startsWith('NOT_VALIDATED:'))
    const data = konfigPublikacjiDataSchema.parse({ ...built.data,
      destination_identity: { account_or_workspace_id_or_null: request.accountId, channel_or_page_id_or_null: request.channelId,
        display_name: request.displayName, public_url_or_null: null },
      brand_binding: { brand_name: order.brand, binding_basis: order.outputLanguage === 'pl'
        ? 'Jawna konfiguracja celu demonstracyjnego przez pracownika; nie zmienia zakresu ani zgód klienta.'
        : 'Explicit staff demo destination configuration; no purchased-scope or client-consent change.', confirmation_ref_or_null: null },
      readiness: { ...built.data.readiness, state: 'not_ready', blockers },
    })
    const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-KONFIG-PUBLIKACJI' }, undefined, scope)
    const current = document?.currentVersionId ? await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...scope, orderRef, documentId: document.id, id: document.currentVersionId, templateId: 'WZR-KONFIG-PUBLIKACJI',
    }, undefined, scope) : null
    if (document && (!current || !konfigPublikacjiDataSchema.safeParse(current.data).success)) return notReady('configuration_invalid')
    const result = (configVersionId: string, replayed: boolean): PublicationDestinationResult => ({
      status: 'configured', orderRef, configVersionId, target: { configVersionId, platform: 'Discord',
        accountId: request.accountId, channelId: request.channelId, displayName: request.displayName },
      readiness: 'not_verified', canSend: false, replayed,
    })
    if (current && isDeepStrictEqual(current.data, data)) return result(current.id, true)
    const inputVersions = [{ document_id: documentIdFor('WZR-ZAMOWIENIE', orderRef), version: versionLabel(orderRow.versionNo), status: orderRow.status }]
    const run = await startTaskRun(em, scope, { orderRef, brand: order.brand, stepId: '8.2', attempt: 1, runner: 'system', models: {}, inputVersions })
    const issues = blockers.map((detail) => ({ code: 'PUBLICATION_ACCESS_UNVERIFIED', severity: 'blocking_publication' as const, detail, path: 'connection_validation' }))
    const saved = await saveDocumentVersion(em, scope, { orderRef, brand: order.brand, templateId: 'WZR-KONFIG-PUBLIKACJI', status: 'blocked',
      inputVersions, data, issues, taskRunId: run.id,
      renderedMd: renderKonfigPublikacji({ outputLanguage: order.outputLanguage, brand: order.brand, data, issues }),
    })
    const outcome = result(saved.version.id, false)
    await finishTaskRun(em, run, { status: 'done', outputVersionId: saved.version.id,
      summary: { configuredBy: context.userId, nativeChannelId: request.nativeChannelId, destination: outcome, externalCheckPerformed: false } })
    return outcome
  })
}
