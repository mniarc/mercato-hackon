import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  title: 'Oferta',
  nav: {
    label: 'Oferta',
    group: 'main',
    order: 10,
    icon: 'sparkles',
  },
}

export default metadata
