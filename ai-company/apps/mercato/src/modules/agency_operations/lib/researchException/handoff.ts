import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase } from '../../data/entities'
import { analysisProcessResultSchema } from '../analysisProcess/contracts'
import { AGENCY_ANALYSIS_RESULT_KEY } from '../analysisProcess/workflow'

export { RESEARCH_EXCEPTION_HANDOFF_FUNCTION, RESEARCH_EXCEPTION_RESULT_KEY } from './contracts'

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
      .parse(workflowInstance.context[AGENCY_ANALYSIS_RESULT_KEY]).result
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
    return {
      kind: 'employee_exception' as const,
      caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId,
      sourceWorkflowInstanceId: workflowInstance.id,
      exception,
      // Preserve exact source references and actor-owned options as evidence, not executable permissions.
      evidenceText: JSON.stringify({
        source: { documentId: exception.documentId, versionId: exception.versionId, version: exception.version, taskRunId: exception.taskRunId },
        reason: exception.data.exception_type,
        evidence: exception.data.evidence,
        blocked: exception.data.hold,
        expectedDecision: exception.data.decision_question,
        producerResolutions: exception.data.allowed_resolutions,
        producerReturn: exception.data.resume,
      }, null, 2),
      continuation: 'unsupported' as const,
    }
  }
}
