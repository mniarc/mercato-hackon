import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { readBriefReview } from '../briefReview/read'
import { versionLabel } from '../research/envelope'
import { acceptBriefInputSchema, briefAcceptanceRecordSchema, type BriefAcceptanceReceipt } from './contracts'

function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }

export async function acceptBrief(container: AppContainer, rawInput: unknown): Promise<BriefAcceptanceReceipt> {
  const { context, request } = acceptBriefInputSchema.parse(rawInput)
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  const rbac = container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService')
  if (!await rbac.userHasAllFeatures(context.userId, ['agency_research.manage'], scope)) {
    throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  }
  return container.resolve<EntityManager>('em').fork().transactional(async (em) => {
    const document = await findOneWithDecryption(em, AgencyResearchDocument, {
      ...scope, id: request.documentId, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const version = document && await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...scope, id: request.versionId, documentId: document.id, orderRef: request.orderRef, templateId: 'WZR-BRIEF',
    }, undefined, scope)
    if (!document || !version) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    if (!Array.isArray(version.approvalRecords)) conflict()
    const source = { kind: 'agency_brief_acceptance' as const, ...request.source }
    const previous = version.approvalRecords.map((entry) => briefAcceptanceRecordSchema.safeParse(entry))
      .find((entry) => entry.success && entry.data.source.submissionId === source.submissionId)
    if (previous?.success) {
      const saved = previous.data
      if (saved.person !== request.customerUserId || saved.documentVersionId !== version.id
        || saved.version !== versionLabel(version.versionNo) || !isDeepStrictEqual(saved.source, source)) conflict()
      return { status: 'accepted', orderRef: request.orderRef, documentId: document.id, versionId: version.id,
        version: saved.version, acceptedAt: saved.at, customerUserId: saved.person, source: saved.source, replayed: true }
    }
    if (document.currentVersionId !== version.id || document.status !== 'ready_for_review'
      || version.status === 'approved' || version.status === 'blocked') conflict()
    const review = await readBriefReview(em, scope, request.orderRef, version.id)
    if (!review || !review.isCurrent || review.documentId !== document.id || !review.clientViewMd?.trim()
      || review.qa.state !== 'assessed' || review.qa.status !== 'done' || review.qa.verdict !== 'ready_for_approval') conflict()
    const accepted = briefAcceptanceRecordSchema.parse({
      person: request.customerUserId, at: new Date().toISOString(), scope: 'brief',
      version: versionLabel(version.versionNo), documentVersionId: version.id, source,
    })
    version.approvalRecords = [...version.approvalRecords, accepted]
    version.status = 'approved'
    document.status = 'approved'
    document.updatedAt = new Date(accepted.at)
    await em.flush()
    return { status: 'accepted', orderRef: request.orderRef, documentId: document.id, versionId: version.id,
      version: accepted.version, acceptedAt: accepted.at, customerUserId: accepted.person, source, replayed: false }
  })
}
