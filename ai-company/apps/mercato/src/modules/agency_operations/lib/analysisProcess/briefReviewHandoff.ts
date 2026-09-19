import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase } from '../../data/entities'
import { BRIEF_REVIEW_SERVICE, type BriefReviewService } from '../briefStrategyProcess/contracts'
import { analysisProcessResultSchema } from './contracts'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_WORKFLOW_ID } from './workflow'

const contextSchema = z.object({
  userId: z.uuid(),
  workflowInstance: z.object({
    id: z.uuid(), workflowId: z.literal(AGENCY_ANALYSIS_WORKFLOW_ID),
    tenantId: z.uuid(), organizationId: z.uuid(), context: z.record(z.string(), z.unknown()),
  }),
})

export function createAnalysisBriefReviewHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const context = contextSchema.parse(rawContext)
    const saved = z.object({ result: analysisProcessResultSchema })
      .parse(context.workflowInstance.context[AGENCY_ANALYSIS_RESULT_KEY] ?? context.workflowInstance.context.agencyAnalysisResult).result
    if (saved.requestedThrough !== '4.2' || saved.completedThrough !== '4.2'
      || !['ready_for_approval', 'needs_client_data'].includes(saved.briefQaVerdict ?? '')
      || saved.escalationVersionId) return { invitation: null, reason: 'brief_not_ready' }

    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const agencyCase = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyCase, {
      ...scope, id: saved.caseId, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Brief handoff case is outside the originating analysis workflow')
    const research = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).status(scope, agencyCase.id)
    const versionId = research.documents.find((document) => document.templateId === 'WZR-BRIEF')?.versionId
    if (!versionId || !saved.documentVersionIds.includes(versionId)) {
      throw new Error('[internal] Current brief is not an output of the saved analysis result')
    }
    const invitation = await container.resolve<BriefReviewService>(BRIEF_REVIEW_SERVICE).invite({
      ...scope, userId: context.userId, caseId: agencyCase.id, versionId,
    })
    return { invitation }
  }
}
