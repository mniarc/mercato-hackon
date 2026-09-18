import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  title: 'My cases',
  titleKey: 'agency.cases.title',
  nav: { label: 'My cases', labelKey: 'agency.cases.title', group: 'main', order: 21, icon: 'folder' },
}

export default metadata
