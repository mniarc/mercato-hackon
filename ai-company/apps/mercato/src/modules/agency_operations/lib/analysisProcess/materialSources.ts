import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { ResearchMaterialSource } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from '../contracts/clientMaterialIntake'

/** Saved client material only; the primary purchase receipt is never research evidence. */
export async function loadCaseMaterialSources(
  container: AppContainer,
  scope: { tenantId: string; organizationId: string },
  caseId: string,
  userId: string,
): Promise<ResearchMaterialSource[]> {
  const em = container.resolve<EntityManager>('em')
  const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: caseId, deletedAt: null }, undefined, scope)
  if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
  const submissions = await findWithDecryption(em, AgencyClientSubmission, {
    ...scope, caseId, customerEntityId: agencyCase.customerEntityId, channel: 'portal', deletedAt: null,
  }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
  const attachments = container.resolve<AttachmentService>('attachmentService')
  const seen = new Set<string>()
  const sources: ResearchMaterialSource[] = []
  for (const submission of submissions) {
    const reference = z.uuid().safeParse(submission.original.materialAttachmentId)
    if (!reference.success || reference.data === agencyCase.materialAttachmentId || seen.has(reference.data)) continue
    const material = await attachments.readScoped({
      attachmentId: reference.data, auth: { sub: userId, tenantId: scope.tenantId, orgId: scope.organizationId },
      expectedOwner: { entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: caseId },
      expectedAssignment: { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: caseId },
      expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, requirePrivatePartition: true,
    })
    seen.add(reference.data)
    sources.push({ attachmentId: reference.data, submissionId: submission.id,
      fileName: material.fileName, submittedAt: submission.createdAt.toISOString(),
      text: material.extractedText?.trim() ? material.extractedText : null })
  }
  return sources
}
