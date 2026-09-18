import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AGENCY_TOV_RESEARCH_SERVICE, createAgencyTovResearchService } from './lib/researchService'

export function register(container: AppContainer): void {
  container.register({
    [AGENCY_TOV_RESEARCH_SERVICE]: asFunction(() => createAgencyTovResearchService(container)).scoped(),
  })
}
