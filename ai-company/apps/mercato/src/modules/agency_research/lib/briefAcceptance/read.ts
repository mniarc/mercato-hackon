import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { versionLabel } from '../research/envelope'
import { briefAcceptanceRecordSchema, type BriefAcceptanceProjection } from './contracts'

export async function readBriefAcceptance(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  orderRef: string,
  versionId: string,
): Promise<BriefAcceptanceProjection | null> {
  const document = await findOneWithDecryption(em, AgencyResearchDocument, {
    ...scope, orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
  }, undefined, scope)
  if (!document) return null
  const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...scope, id: versionId, documentId: document.id, orderRef, templateId: 'WZR-BRIEF',
  }, undefined, scope)
  if (!version || version.status !== 'approved' || !Array.isArray(version.approvalRecords)) return null
  for (const entry of [...version.approvalRecords].reverse()) {
    const parsed = briefAcceptanceRecordSchema.safeParse(entry)
    if (!parsed.success || parsed.data.documentVersionId !== version.id || parsed.data.version !== versionLabel(version.versionNo)) continue
    const saved = parsed.data
    return { status: 'accepted', orderRef, documentId: document.id, versionId: version.id,
      version: saved.version, acceptedAt: saved.at, customerUserId: saved.person, source: saved.source }
  }
  return null
}
