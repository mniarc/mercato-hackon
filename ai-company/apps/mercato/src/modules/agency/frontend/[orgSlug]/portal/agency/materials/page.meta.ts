import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  title: 'Materials',
  titleKey: 'agency.materials.title',
  nav: { label: 'Materials', labelKey: 'agency.materials.title', group: 'main', order: 20, icon: 'upload' },
}

export default metadata
