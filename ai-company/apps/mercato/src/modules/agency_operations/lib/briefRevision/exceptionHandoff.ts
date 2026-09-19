import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { exceptionEvidence } from '../researchException/handoff'
import { BRIEF_REVISION_RESULT_KEY, briefRevisionActivityResultSchema } from './contracts'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'), tenantId: z.uuid(), organizationId: z.uuid(),
}) })

export function createBriefRevisionResearchExceptionHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const { workflowInstance } = contextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const source = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    if (!source) throw new Error('[internal] Brief revision exception requires the originating native workflow')
    const saved = z.object({ result: briefRevisionActivityResultSchema }).parse(source.context[BRIEF_REVISION_RESULT_KEY]).result
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: source.id, caseId: saved.orderRef, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Brief revision exception is outside the originating case submission')
    if (!('escalationVersionId' in saved) || !saved.escalationVersionId) return { kind: 'none' as const }
    const original = clientSubmissionRequestSchema.parse(submission.original).reviewResponse
    if (saved.submissionId !== submission.id || !original || original.kind !== 'message' || original.versionId !== saved.previousBriefVersionId) {
      throw new Error('[internal] Brief revision exception does not belong to the original brief response')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Brief revision exception case is outside the submission scope')
    const exception = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getExceptionReview(scope, agencyCase.id, saved.escalationVersionId)
    if (!exception || exception.orderRef !== agencyCase.id || exception.versionId !== saved.escalationVersionId
      || !exception.isCurrent || exception.data.resolution.state !== 'open' || exception.documentStatus !== 'blocked' || exception.versionStatus !== 'blocked') {
      throw new Error('[internal] Brief revision exception must be the current open blocked version')
    }
    if (!saved.documentVersionIds.includes(exception.versionId) || !saved.taskRunIds.includes(exception.taskRunId)) {
      throw new Error('[internal] Brief revision exception is not an output of the saved revision result')
    }
    return exceptionEvidence(agencyCase, source.id, exception)
  }
}
