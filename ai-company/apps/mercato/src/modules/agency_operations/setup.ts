import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['agency_operations.*'],
    admin: ['agency_operations.*'],
    employee: ['agency_operations.cases.view'],
  },
}

export default setup
