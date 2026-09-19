import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * Agency module injection table. Renders the Studio Komunikacji client panel
 * on the portal dashboard in place of the generic example demo widgets.
 */
export const injectionTable: ModuleInjectionTable = {
  'portal:dashboard:sections': [
    { widgetId: 'agency.injection.portal-panel', priority: 100 },
  ],
}

export default injectionTable
