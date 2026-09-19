import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  titleKey: 'agency.salesQuestions.title',
  nav: { label: 'Questions before purchase', labelKey: 'agency.salesQuestions.title', group: 'main', order: 25 },
}

export default metadata
