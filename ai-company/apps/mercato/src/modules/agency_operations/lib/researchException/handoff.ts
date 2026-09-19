import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService, type ResearchExceptionProjection } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { analysisProcessResultSchema } from '../analysisProcess/contracts'
import { AGENCY_ANALYSIS_RESULT_KEY } from '../analysisProcess/workflow'
import { POST_EXECUTION_RESULT_KEY, postExecutionActivityResultSchema } from '../postExecution/contracts'

export { RESEARCH_EXCEPTION_HANDOFF_FUNCTION, POST_RESEARCH_EXCEPTION_HANDOFF_FUNCTION, RESEARCH_EXCEPTION_RESULT_KEY } from './contracts'

const contextSchema = z.object({
  workflowInstance: z.object({
    id: z.uuid(), workflowId: z.literal('agency_operations.analysis.v1'),
    tenantId: z.uuid(), organizationId: z.uuid(), context: z.record(z.string(), z.unknown()),
  }),
})

/** Read-only preparation; the native analysis step owns creation/deduplication of its USER_TASK. */
export function createResearchExceptionHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const { workflowInstance } = contextSchema.parse(rawContext)
    const saved = z.object({ result: analysisProcessResultSchema })
      .parse(workflowInstance.context[AGENCY_ANALYSIS_RESULT_KEY] ?? workflowInstance.context.agencyAnalysisResult).result
    if (!saved.escalationVersionId) return { kind: 'none' as const }
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const agencyCase = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyCase, {
      ...scope, id: saved.caseId, workflowInstanceId: workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Research exception is outside the originating case workflow')
    const exception = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
      .getExceptionReview(scope, agencyCase.id, saved.escalationVersionId)
    if (!exception || !exception.isCurrent || exception.data.resolution.state !== 'open'
      || exception.documentStatus !== 'blocked' || exception.versionStatus !== 'blocked') {
      throw new Error('[internal] Research exception must be the current open blocked version')
    }
    if (!saved.documentVersionIds.includes(exception.versionId) || !saved.taskRunIds.includes(exception.taskRunId)) {
      throw new Error('[internal] Research exception is not an output of the saved analysis result')
    }
    return exceptionEvidence(agencyCase, workflowInstance.id, exception)
  }
}

export function exceptionEvidence(agencyCase: AgencyCase, workflowInstanceId: string, exception: ResearchExceptionProjection) {
  return {
    kind: 'employee_exception' as const,
    caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId,
    sourceWorkflowInstanceId: workflowInstanceId, exception,
    evidenceText: JSON.stringify({
      source: { documentId: exception.documentId, versionId: exception.versionId, version: exception.version, taskRunId: exception.taskRunId },
      reason: exception.data.exception_type, evidence: exception.data.evidence, blocked: exception.data.hold,
      expectedDecision: exception.data.decision_question, producerResolutions: exception.data.allowed_resolutions, producerReturn: exception.data.resume,
    }, null, 2),
    continuation: 'unsupported' as const,
  }
}

const postContextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'), tenantId: z.uuid(), organizationId: z.uuid(),
}) })

export function createPostResearchExceptionHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const { workflowInstance } = postContextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const source = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    if (!source) throw new Error('[internal] Post exception requires the originating native workflow')
    const result = z.object({ result: postExecutionActivityResultSchema }).safeParse(source.context[POST_EXECUTION_RESULT_KEY] ?? source.context.agencyPostExecution)
    if (!result.success) return { kind: 'none' as const }
    const saved = result.data.result
    if ((saved.status !== 'completed' && saved.status !== 'paused_budget') || !saved.escalationVersionId) return { kind: 'none' as const }
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, id: saved.selectionSubmissionId, workflowInstanceId: source.id, caseId: saved.orderRef, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Post exception is outside the originating case selection')
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Post exception case is outside the submission scope')
    const exception = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getExceptionReview(scope, agencyCase.id, saved.escalationVersionId)
    if (!exception || exception.orderRef !== agencyCase.id || exception.versionId !== saved.escalationVersionId
      || !exception.isCurrent || exception.data.resolution.state !== 'open' || exception.documentStatus !== 'blocked' || exception.versionStatus !== 'blocked') {
      throw new Error('[internal] Post exception must be the current open blocked version')
    }
    if (!saved.documentVersionIds.includes(exception.versionId) || !saved.taskRunIds.includes(exception.taskRunId)) {
      throw new Error('[internal] Post exception is not an output of the saved post result')
    }
    return exceptionEvidence(agencyCase, source.id, exception)
  }
}
