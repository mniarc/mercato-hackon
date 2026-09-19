import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { postDataSchema } from '../../data/schemas/post'
import { contentHashOf } from '../research/publication'
import { readPostAcceptance } from '../postAcceptance/read'
import { readPublicationTarget } from './read'
import { publicationConsentRecordSchema, recordPublicationConsentInputSchema, samePublicationDestination, type PublicationConsentResult } from './contracts'

/** Trusted caller proves the separate explicit choice on the actual completed customer task; never model output. */
export async function recordPublicationConsent(manager: EntityManager, rawInput: unknown): Promise<PublicationConsentResult> {
  const { context, request } = recordPublicationConsentInputSchema.parse(rawInput)
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  return manager.transactional<PublicationConsentResult>(async (em) => {
    const where = { ...scope, orderRef: request.orderRef }
    const brief = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-BRIEF', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, id: request.documentId, templateId: 'WZR-POST', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const version = document && await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...where, id: request.versionId, documentId: document.id, templateId: 'WZR-POST' }, undefined, scope)
    if (!brief || !document || !version) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    const source = { kind: 'agency_publication_consent' as const, ...request.source }
    const records = Array.isArray(version.approvalRecords) ? version.approvalRecords : []
    const previous = records.map((raw) => publicationConsentRecordSchema.safeParse(raw)).find((saved) => saved.success && saved.data.source.submissionId === source.submissionId)
    if (previous?.success) {
      const saved = previous.data
      if (saved.person !== request.customerUserId || saved.at !== request.decidedAt || saved.documentId !== document.id || saved.documentVersionId !== version.id
        || !isDeepStrictEqual(saved.source, source) || !isDeepStrictEqual(saved.destination, request.destination)) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
      return { status: 'recorded', record: saved, replayed: true }
    }
    if (document.currentVersionId !== version.id) return { status: 'not_ready', reason: 'post_not_current' }
    const target = await readPublicationTarget(em, scope, request.orderRef)
    if (!target || !samePublicationDestination(target, request.destination)) return { status: 'not_ready', reason: 'target_changed' }
    const accepted = await readPostAcceptance(em, scope, { orderRef: request.orderRef, postVersionId: version.id })
    if (accepted.status !== 'ready' || !accepted.receipt || accepted.receipt.person !== request.customerUserId
      || !isDeepStrictEqual(accepted.receipt.source, { kind: 'agency_post_acceptance', ...request.source })) return { status: 'not_ready', reason: 'content_approval_missing' }
    const post = postDataSchema.pick({ text: true, links_and_mentions: true }).parse(version.data)
    const saved = publicationConsentRecordSchema.parse({ person: request.customerUserId, at: request.decidedAt, scope: 'post_publication',
      documentId: document.id, documentVersionId: version.id, version: accepted.post.version,
      contentHash: contentHashOf(post), destination: request.destination, source })
    version.approvalRecords = [...records, saved]
    await em.flush()
    return { status: 'recorded', record: saved, replayed: false }
  })
}
