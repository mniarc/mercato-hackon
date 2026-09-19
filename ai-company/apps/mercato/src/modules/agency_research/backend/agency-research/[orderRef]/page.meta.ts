export const metadata = {
  requireAuth: true,
  requireFeatures: ['agency_research.documents.view'],
  pageTitle: 'Research order',
  pageTitleKey: 'agencyResearch.orders.detail.title',
  pageGroup: 'Agency operations',
  pageGroupKey: 'agencyOperations.cases.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Research orders', labelKey: 'agencyResearch.orders.list.title', href: '/backend/agency-research' },
  ],
}
