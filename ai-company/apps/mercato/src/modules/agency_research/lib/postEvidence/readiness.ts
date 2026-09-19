import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun, AgencyResearchSource } from '../../data/entities'
import { postEvidenceRequestSchema } from '../../data/agents/post'
import { inputVersionSchema } from '../../data/schemas/envelope'
import { postDataSchema } from '../../data/schemas/post'
import { zrodlaDataSchema } from '../../data/schemas/zrodla'
import { readPostExecutionInputs } from '../postExecution/readiness'
import { readPostReview } from '../postReview/read'
import { strategyProcessReferenceSchema } from '../strategyReadiness/contracts'
import { documentIdFor, versionLabel } from '../research/envelope'
import { normalizeForMatch } from '../research/util'
import type { CollectedSource } from '../research/fetch'
import type { ResearchScope } from '../store'
import type { RunPostEvidenceRequest } from './contracts'

const activationSchema = z.object({
  process: strategyProcessReferenceSchema, instructionVersionId: z.uuid(), selectionSubmissionId: z.uuid(),
  executionResult: z.object({ postVersionId: z.uuid().nullable(), qaTaskRunId: z.uuid().nullable() }),
})

/** No caller supplies claims, raw source text, URLs, selection or approved foundation versions. */
export async function readPostEvidenceInputs(em: EntityManager, scope: ResearchScope, request: RunPostEvidenceRequest) {
  const where = { ...scope, orderRef: request.orderRef }
  const notReady = (reason: string) => ({ status: 'not_ready' as const, orderRef: request.orderRef, reason })
  const parent = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-POST', deletedAt: null }, undefined, scope)
  if (!parent || parent.currentVersionId !== request.postVersionId || parent.status !== 'draft') return notReady('post_not_current_draft')
  const post = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...where, documentId: parent.id, id: request.postVersionId, templateId: 'WZR-POST',
  }, undefined, scope)
  const parsedPost = postDataSchema.safeParse(post?.data)
  if (!post || !parsedPost.success || post.simulationFlag || post.status !== 'draft') return notReady('post_not_current_draft')
  const review = await readPostReview(em, scope, request.orderRef, request.postVersionId)
  if (review?.qa.state !== 'assessed' || review.qa.taskRunId !== request.qaTaskRunId || review.qa.verdict === 'pass_for_draft') return notReady('qa_request_not_current')
  const qa = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...where, id: request.qaTaskRunId, stepId: '7.3', outputVersionId: post.id, status: 'to_fix',
  }, undefined, scope)
  const evidence = postEvidenceRequestSchema.safeParse((qa?.qaResult as Record<string, unknown> | null)?.evidenceRequest)
  if (!qa || !evidence.success || !normalizeForMatch(parsedPost.data.text).includes(normalizeForMatch(evidence.data.claim))) return notReady('saved_evidence_request_missing')
  const activations = await findWithDecryption(em, AgencyResearchTaskRun, {
    ...where, stepId: { $in: ['7.1', '7.5'] }, status: 'done',
  }, { orderBy: { createdAt: 'desc' } }, scope)
  const activation = activations.map((run) => activationSchema.safeParse(run.summary)).find((parsed) => parsed.success
    && parsed.data.instructionVersionId === request.instructionVersionId
    && parsed.data.executionResult.qaTaskRunId === qa.id && parsed.data.executionResult.postVersionId === post.id)
  if (!activation?.success) return notReady('post_production_binding_missing')
  const ready = await readPostExecutionInputs(em, scope, { orderRef: request.orderRef,
    instructionVersionId: request.instructionVersionId, selectionSubmissionId: activation.data.selectionSubmissionId,
    process: activation.data.process, maxCostPln: request.maxCostPln })
  if (ready.status === 'not_ready') return ready
  const pins = z.array(inputVersionSchema).safeParse(post.inputVersions)
  if (!pins.success || [ready.instruction, ready.tov].some((input) => !pins.data.some((pin) =>
    pin.document_id === input.document_id && pin.version === input.version))) return notReady('post_input_changed')
  const sourceParent = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-ZRODLA', deletedAt: null }, undefined, scope)
  const sourcesVersion = sourceParent?.currentVersionId ? await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...where, id: sourceParent.currentVersionId, templateId: 'WZR-ZRODLA',
  }, undefined, scope) : null
  const sourceData = zrodlaDataSchema.safeParse(sourcesVersion?.data)
  if (!sourceData.success) return notReady('source_register_missing')
  const rows = await findWithDecryption(em, AgencyResearchSource, {
    ...where, sourceId: { $in: evidence.data.sourceRefs },
  }, undefined, scope)
  const sources: CollectedSource[] = []
  for (const sourceId of [...new Set(evidence.data.sourceRefs)]) {
    const row = rows.find((item) => item.sourceId === sourceId)
    const savedSource = sourceData.data.sources.find((item) => item.source_id === sourceId)
    if (!row || !savedSource || !row.contentMd || row.access === 'unavailable'
      || !['full', 'partial'].includes(row.access) || !['purchase_form', 'agent', 'client', 'corpus'].includes(row.origin)) return notReady('requested_source_unavailable')
    sources.push({ source_id: sourceId, url: row.url, publisher: row.publisher, kind: row.kind, channel: row.channel,
      origin: row.origin as CollectedSource['origin'], access: row.access as CollectedSource['access'],
      title: row.title, text: row.contentMd, bytes: row.bytes, retrieved_at: row.retrievedAt.toISOString(),
      published_at: row.publishedAt?.toISOString() ?? null, read_scope: row.readScope, limitation: row.limitation,
      source_visibility: savedSource.source_visibility })
  }
  return { ...ready, qa, evidence: evidence.data, sources, selectionSubmissionId: activation.data.selectionSubmissionId,
    previousPost: { document_id: documentIdFor('WZR-POST', request.orderRef), version: versionLabel(post.versionNo),
      versionId: post.id, status: post.status, data: parsedPost.data } }
}
