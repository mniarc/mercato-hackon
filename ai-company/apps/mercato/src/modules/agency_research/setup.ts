import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['agency_research.*'],
    admin: ['agency_research.*'],
    employee: ['agency_research.view', 'agency_research.documents.view'],
  },
}

export default setup
