import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.tasks.view'],
  titleKey: 'agency.demo.title',
  navHidden: true,
}

export default metadata
