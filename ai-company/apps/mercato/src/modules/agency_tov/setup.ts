import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['agency_tov.*'],
    admin: ['agency_tov.*'],
    employee: ['agency_tov.view'],
  },
}

export default setup
