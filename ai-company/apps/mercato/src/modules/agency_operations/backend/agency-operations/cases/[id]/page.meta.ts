export const metadata = {
  requireAuth: true,
  requireFeatures: ['agency_operations.cases.view'],
  pageTitle: 'Agency case',
  pageTitleKey: 'agencyOperations.cases.detail.entityLabel',
  pageGroup: 'Agency operations',
  pageGroupKey: 'agencyOperations.cases.nav.group',
  navHidden: true,
  breadcrumb: [
    {
      label: 'Agency cases',
      labelKey: 'agencyOperations.cases.list.title',
      href: '/backend/agency-operations/cases',
    },
  ],
}
