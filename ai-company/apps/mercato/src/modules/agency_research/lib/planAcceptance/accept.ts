import { isDeepStrictEqual } from 'node:util'
import type { ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { acceptPlanInputSchema, planAcceptanceRecordSchema, type PlanAcceptanceReceipt } from './contracts'
import { readPlanReview } from './read'

function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }

/** Server caller proves native task/customer binding and saved G disposition; public service owns RBAC. */
export async function acceptPlan(manager: EntityManager, rawInput: unknown, readSpecialistTov?: ReadSpecialistTov): Promise<PlanAcceptanceReceipt> {
  const { context, request } = acceptPlanInputSchema.parse(rawInput)
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  return manager.transactional(async (em) => {
    const brief = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: request.orderRef, id: request.documentId, templateId: 'WZR-PLAN', deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    const version = document && await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, orderRef: request.orderRef, id: request.versionId, documentId: document.id, templateId: 'WZR-PLAN' }, undefined, scope)
    if (!brief || !document || !version) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    if (!Array.isArray(version.approvalRecords)) conflict()
    const source = { kind: 'agency_plan_acceptance' as const, ...request.source }
    const previous = version.approvalRecords.map((raw) => planAcceptanceRecordSchema.safeParse(raw))
      .find((saved) => saved.success && saved.data.source.submissionId === source.submissionId)
    if (previous?.success) {
      const record = previous.data
      if (record.person !== request.customerUserId || record.documentId !== request.documentId || record.documentVersionId !== request.versionId
        || record.selectedTopicId !== request.selectedTopicId || !isDeepStrictEqual(record.source, source)) conflict()
      return { status: 'plan_accepted', orderRef: request.orderRef, record, replayed: true }
    }
    const reviewInput = { orderRef: request.orderRef, planVersionId: request.versionId }
    const review = readSpecialistTov
      ? await readPlanReview(em, scope, reviewInput, readSpecialistTov)
      : await readPlanReview(em, scope, reviewInput)
    if (review.status !== 'ready' || review.plan.documentId !== document.id || !review.topics.some((topic) => topic.topicId === request.selectedTopicId)) conflict()
    const record = planAcceptanceRecordSchema.parse({ person: request.customerUserId, at: new Date().toISOString(), scope: 'plan',
      version: review.plan.version, documentId: document.id, documentVersionId: version.id,
      approvePlan: true, selectedTopicId: request.selectedTopicId, briefVersionId: review.briefVersionId,
      strategyVersionId: review.strategyVersionId, tovVersionId: review.tovVersionId, qaTaskRunId: review.qaTaskRunId, source,
    })
    version.approvalRecords = [...version.approvalRecords, record]
    version.status = 'approved'; document.status = 'approved'; document.updatedAt = new Date(record.at)
    await em.flush()
    return { status: 'plan_accepted', orderRef: request.orderRef, record, replayed: false }
  })
}
