import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { eskalacjaDataSchema, type EskalacjaData } from '../../data/schemas/eskalacja'
import { versionLabel } from '../research/envelope'

/** Staff-only projection; caller establishes the owning case/customer. */
export type ResearchExceptionProjection = {
  orderRef: string
  documentId: string
  versionId: string
  version: string
  templateId: 'WZR-ESKALACJA'
  isCurrent: boolean
  documentStatus: string
  versionStatus: string
  taskRunId: string
  data: EskalacjaData
}

export async function readResearchException(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  orderRef: string,
  versionId: string,
): Promise<ResearchExceptionProjection | null> {
  const document = await findOneWithDecryption(em, AgencyResearchDocument, {
    ...scope, orderRef, templateId: 'WZR-ESKALACJA', deletedAt: null,
  }, undefined, scope)
  if (!document) return null
  const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...scope, id: versionId, documentId: document.id, orderRef, templateId: 'WZR-ESKALACJA',
  }, undefined, scope)
  if (!version) return null
  return {
    orderRef, documentId: document.id, versionId: version.id, version: versionLabel(version.versionNo),
    templateId: 'WZR-ESKALACJA', isCurrent: document.currentVersionId === version.id,
    documentStatus: document.status, versionStatus: version.status, taskRunId: version.taskRunId,
    data: eskalacjaDataSchema.parse(version.data),
  }
}
