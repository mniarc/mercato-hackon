export const features = [
  { id: 'agency_research.view', title: 'View audit and research documents', module: 'agency_research' },
  {
    id: 'agency_research.manage',
    title: 'Run audit and research for an order',
    module: 'agency_research',
    dependsOn: ['agency_research.view'],
  },
  {
    id: 'agency_research.portal.brief.view',
    title: 'Read own brief in the customer portal',
    module: 'agency_research',
  },
  {
    id: 'agency_research.portal.documents.view',
    title: 'Read own strategy, tone of voice, plan, post and package in the customer portal',
    module: 'agency_research',
  },
  {
    id: 'agency_research.documents.view',
    title: 'View stored research documents, versions and sources',
    module: 'agency_research',
    dependsOn: ['agency_research.view'],
  },
]

export default features
