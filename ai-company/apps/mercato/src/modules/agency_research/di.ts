import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AGENCY_RESEARCH_SERVICE, createAgencyResearchService } from './lib/researchService'

export function register(container: AppContainer): void {
  container.register({
    [AGENCY_RESEARCH_SERVICE]: asFunction(() => createAgencyResearchService(container)).scoped(),
  })
}
