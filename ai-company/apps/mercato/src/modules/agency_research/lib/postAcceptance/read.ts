import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocumentVersion } from '../../data/entities'
import { readPostReview } from '../postReview/read'
import { postAcceptanceRequestSchema, postAcceptanceRecordSchema, type PostAcceptance, type PostAcceptanceRecord } from './contracts'

/** Content-only consent on the current exact QA-ready post; no publication permission. */
export async function readPostAcceptance(em: EntityManager, scope: { tenantId: string; organizationId: string }, rawInput: unknown): Promise<PostAcceptance> {
  const { orderRef, postVersionId } = postAcceptanceRequestSchema.parse(rawInput)
  const unavailable = (reason: Extract<PostAcceptance, { status: 'not_ready' }>['reason']): PostAcceptance => ({ status: 'not_ready', orderRef, reason })
  const post = await readPostReview(em, scope, orderRef, postVersionId)
  if (!post) return unavailable('post_not_found')
  if (!post.isCurrent) return unavailable('post_not_current')
  if (post.simulationFlag || !post.clientViewMd?.trim()
    || !['ready_for_review', 'approved'].includes(post.documentStatus)
    || !['ready_for_review', 'approved'].includes(post.versionStatus)) return unavailable('post_not_reviewable')
  if (post.qa.state !== 'assessed' || post.qa.status !== 'done' || post.qa.verdict !== 'pass_for_draft') return unavailable('post_qa_not_ready')
  const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...scope, orderRef, id: postVersionId, documentId: post.documentId, templateId: 'WZR-POST',
  }, undefined, scope)
  if (!version) return unavailable('post_not_found')
  let receipt: PostAcceptanceRecord | null = null
  for (const raw of Array.isArray(version.approvalRecords) ? [...version.approvalRecords].reverse() : []) {
    const saved = postAcceptanceRecordSchema.safeParse(raw)
    if (saved.success && saved.data.documentId === post.documentId && saved.data.documentVersionId === post.versionId
      && saved.data.version === post.version) { receipt = saved.data; break }
  }
  if ((post.documentStatus === 'approved' || post.versionStatus === 'approved') && !receipt) return unavailable('approval_record_missing')
  return { status: 'ready', orderRef, post, receipt }
}
