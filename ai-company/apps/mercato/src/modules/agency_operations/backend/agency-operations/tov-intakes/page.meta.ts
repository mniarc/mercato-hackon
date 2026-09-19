export const metadata = {
  requireAuth: true,
  requireFeatures: ['agency_operations.cases.view', 'customers.companies.view', 'agency_tov.manage'],
  pageTitle: 'Tone-of-voice specialist',
  pageTitleKey: 'agencyOperations.tovIntake.title',
  pageGroup: 'Agency operations',
  pageGroupKey: 'agencyOperations.cases.nav.group',
  pageOrder: 120,
  icon: 'message-circle',
  breadcrumb: [
    { label: 'Tone-of-voice specialist', labelKey: 'agencyOperations.tovIntake.title' },
  ],
}
