import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['agency_operations.*'],
    admin: ['agency_operations.*'],
    employee: [
      'agency_operations.cases.view', 'agency_operations.cases.escalate',
      'customers.companies.view', 'workflows.instances.view', 'workflows.view',
      'workflows.tasks.view', 'workflows.tasks.claim', 'workflows.tasks.complete',
      'agent_orchestrator.trace.view',
    ],
  },
}

export default setup
