import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService, type ResearchMaterialSource } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, type AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from '../contracts/clientMaterialIntake'
import type { MaterialContext } from './input'

export async function loadSubmissionMaterial(container: AppContainer, submission: AgencyClientSubmission): Promise<ResearchMaterialSource | null> {
  const original = clientSubmissionRequestSchema.parse(submission.original)
  if (!original.materialAttachmentId || !submission.workflowInstanceId) return null
  const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
  const em = container.resolve<EntityManager>('em')
  const agencyCase = await findOneWithDecryption(em, AgencyCase, {
    ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
  }, undefined, scope)
  if (!agencyCase) throw new Error('[internal] Material revision case is outside the submission scope')
  if (original.materialAttachmentId === agencyCase.materialAttachmentId) return null
  const workflow = await findOneWithDecryption(em, WorkflowInstance, {
    ...scope, id: submission.workflowInstanceId, workflowId: 'agency_operations.client-submission.native.v1', deletedAt: null,
  }, undefined, scope)
  if (!workflow) throw new Error('[internal] Material revision requires its native submission workflow')
  const userId = await resolveWorkflowPrincipalUserId(em, workflow)
  if (!userId) throw new Error('[internal] Material revision requires a native execution principal')
  const material = await container.resolve<AttachmentService>('attachmentService').readScoped({
    attachmentId: original.materialAttachmentId,
    auth: { sub: userId, tenantId: scope.tenantId, orgId: scope.organizationId },
    expectedOwner: { entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: submission.caseId },
    expectedAssignment: { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: submission.caseId },
    expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, requirePrivatePartition: true,
  })
  return { attachmentId: original.materialAttachmentId, submissionId: submission.id,
    fileName: material.fileName, submittedAt: submission.createdAt.toISOString(),
    text: material.extractedText?.trim() ? material.extractedText : null }
}

export async function prepareMaterialContext(container: AppContainer, submission: AgencyClientSubmission): Promise<MaterialContext | undefined> {
  const material = await loadSubmissionMaterial(container, submission)
  if (!material) return undefined
  const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
  const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
  const status = await research.status(scope, submission.caseId)
  const current = status.documents.find((document) => document.templateId === 'WZR-BRIEF')
  const review = current?.versionId ? await research.getBriefReview(scope, submission.caseId, current.versionId) : null
  const downstream = status.documents.some((document) => ['WZR-STRATEGIA', 'WZR-TOV', 'WZR-PLAN', 'WZR-POST'].includes(document.templateId) && document.versionId)
  const state = downstream || review?.documentStatus === 'approved' || review?.versionStatus === 'approved'
    ? 'impact_review_required'
    : !material.text ? 'material_unreadable'
    : review?.isCurrent && review.documentStatus === 'ready_for_review' && review.versionStatus === 'ready_for_review'
      ? 'eligible' : 'brief_not_reviewable'
  return { material, brief: review ? { versionId: review.versionId, clientViewMd: review.clientViewMd } : null, state }
}
