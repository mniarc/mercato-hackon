import type { PageRouteOverridesMap } from '@open-mercato/shared/modules/overrides'

export const agencyPortalTaskRoutes: PageRouteOverridesMap = {
  '/frontend/[orgSlug]/portal/tasks': {
    load: async () => (await import('./components/AgencyTasksPage.client')).default,
  },
  '/frontend/[orgSlug]/portal/tasks/[id]': {
    load: async () => (await import('./components/AgencyTaskPage.client')).default,
  },
}
