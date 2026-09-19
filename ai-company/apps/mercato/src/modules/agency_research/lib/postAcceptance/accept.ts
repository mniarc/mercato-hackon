import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { versionLabel } from '../research/envelope'
import { acceptPostInputSchema, postAcceptanceRecordSchema, type PostAcceptanceReceipt } from './contracts'
import { readPostAcceptance } from './read'

function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }

/** Public wrapper owns RBAC; caller proves one explicit content-approval directive from G. */
export async function acceptPost(manager: EntityManager, rawInput: unknown): Promise<PostAcceptanceReceipt> {
  const { context, request } = acceptPostInputSchema.parse(rawInput)
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  return manager.transactional(async (em) => {
    // Match the brief-first order used by execution and the previous acceptance stages.
    const brief = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: request.orderRef, id: request.documentId, templateId: 'WZR-POST', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const version = document && await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, orderRef: request.orderRef, id: request.versionId, documentId: document.id, templateId: 'WZR-POST' }, undefined, scope)
    if (!brief || !document || !version) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    if (!Array.isArray(version.approvalRecords)) conflict()
    const source = { kind: 'agency_post_acceptance' as const, ...request.source }
    const previous = version.approvalRecords.map((raw) => postAcceptanceRecordSchema.safeParse(raw))
      .find((saved) => saved.success && saved.data.source.submissionId === source.submissionId)
    if (previous?.success) {
      const record = previous.data
      if (record.person !== request.customerUserId || record.documentId !== document.id || record.documentVersionId !== version.id
        || record.version !== versionLabel(version.versionNo) || !isDeepStrictEqual(record.source, source)) conflict()
      return { status: 'post_accepted', orderRef: request.orderRef, record, replayed: true }
    }
    const checked = await readPostAcceptance(em, scope, { orderRef: request.orderRef, postVersionId: request.versionId })
    if (checked.status !== 'ready' || checked.post.documentId !== document.id || checked.post.qa.state !== 'assessed') conflict()
    const record = postAcceptanceRecordSchema.parse({ person: request.customerUserId, at: new Date().toISOString(), scope: 'post_content',
      documentId: document.id, documentVersionId: version.id, version: checked.post.version, qaTaskRunId: checked.post.qa.taskRunId, source,
    })
    version.approvalRecords = [...version.approvalRecords, record]
    version.status = 'approved'; document.status = 'approved'; document.updatedAt = new Date(record.at)
    await em.flush()
    return { status: 'post_accepted', orderRef: request.orderRef, record, replayed: false }
  })
}
