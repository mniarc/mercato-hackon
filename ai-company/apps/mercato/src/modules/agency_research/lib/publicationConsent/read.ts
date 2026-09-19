import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { konfigPublikacjiDataSchema } from '../../data/schemas/konfigPublikacji'
import { postDataSchema } from '../../data/schemas/post'
import { contentHashOf } from '../research/publication'
import { postAcceptanceRequestSchema } from '../postAcceptance/contracts'
import type { PublicationConsentCheck } from '../../data/schemas/zleceniePublikacji'
import { publicationConsentRecordSchema, publicationTargetSchema, samePublicationDestination, publicationDestinationKey, type PublicationConsent, type PublicationTarget } from './contracts'

type Scope = { tenantId: string; organizationId: string }
export async function readPublicationTarget(em: EntityManager, scope: Scope, orderRef: string): Promise<PublicationTarget | null> {
  const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef, templateId: 'WZR-KONFIG-PUBLIKACJI', deletedAt: null }, undefined, scope)
  if (!document?.currentVersionId) return null
  const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, orderRef, documentId: document.id, id: document.currentVersionId, templateId: 'WZR-KONFIG-PUBLIKACJI' }, undefined, scope)
  const config = konfigPublikacjiDataSchema.safeParse(version?.data)
  if (!version || !config.success || config.data.platform.platform === 'unknown') return null
  const parsed = publicationTargetSchema.safeParse({ configVersionId: version.id, platform: config.data.platform.platform,
    accountId: config.data.destination_identity.account_or_workspace_id_or_null,
    channelId: config.data.destination_identity.channel_or_page_id_or_null, displayName: config.data.destination_identity.display_name })
  return parsed.success ? parsed.data : null
}

/** Caller proves case/customer access; only exact persisted version and current destination may reuse consent. */
export async function readPublicationConsent(em: EntityManager, scope: Scope, rawInput: unknown): Promise<PublicationConsent> {
  const { orderRef, postVersionId } = postAcceptanceRequestSchema.parse(rawInput)
  const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef, templateId: 'WZR-POST', deletedAt: null }, undefined, scope)
  const version = document && await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, orderRef, documentId: document.id, id: postVersionId, templateId: 'WZR-POST' }, undefined, scope)
  if (!document || !version) return { target: null, state: 'missing', record: null }
  const target = await readPublicationTarget(em, scope, orderRef)
  const post = postDataSchema.pick({ text: true, links_and_mentions: true }).safeParse(version.data)
  const records = (Array.isArray(version.approvalRecords) ? [...version.approvalRecords].reverse() : [])
    .map((raw) => publicationConsentRecordSchema.safeParse(raw))
    .flatMap((parsed) => parsed.success && parsed.data.documentId === document.id && parsed.data.documentVersionId === version.id ? [parsed.data] : [])
  const matching = records.find((saved) => target && samePublicationDestination(saved.destination, target)
    && document.currentVersionId === version.id && post.success && saved.contentHash === contentHashOf(post.data))
  return { target, state: matching ? 'valid' : records.length ? 'stale' : 'missing', record: matching ?? records[0] ?? null }
}

export function publicationConsentCheckOf(consent: PublicationConsent): PublicationConsentCheck {
  return { state: consent.state, consent_ref_or_null: consent.record ? `${consent.record.documentVersionId}:publication:${consent.record.source.submissionId}` : null,
    bound_content_hash_or_null: consent.record?.contentHash ?? null,
    bound_destination_or_null: consent.record ? publicationDestinationKey(consent.record.destination) : null }
}
