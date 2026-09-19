import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { exceptionEvidence } from '../researchException/handoff'
import { readSavedMaterialRevision } from './saved'

export function createMaterialRevisionResearchExceptionHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown) => {
    const { scope, workflow, agencyCase, result } = await readSavedMaterialRevision(container, rawContext)
    if (!('escalationVersionId' in result) || !result.escalationVersionId) return { kind: 'none' as const }
    const exception = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getExceptionReview(scope, agencyCase.id, result.escalationVersionId)
    if (!exception || exception.orderRef !== agencyCase.id || exception.versionId !== result.escalationVersionId
      || !exception.isCurrent || exception.data.resolution.state !== 'open' || exception.documentStatus !== 'blocked' || exception.versionStatus !== 'blocked') {
      throw new Error('[internal] Material revision exception must be the current open blocked version')
    }
    if (!result.documentVersionIds.includes(exception.versionId) || !result.taskRunIds.includes(exception.taskRunId)) {
      throw new Error('[internal] Material revision exception is not an output of the saved revision')
    }
    return exceptionEvidence(agencyCase, workflow.id, exception)
  }
}
