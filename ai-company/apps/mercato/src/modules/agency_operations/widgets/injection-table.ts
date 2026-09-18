import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

export const injectionTable: ModuleInjectionTable = {
  'workflows.task.detail:context': [{ widgetId: 'agency_operations.injection.attention-context', priority: 40 }],
}

export default injectionTable
