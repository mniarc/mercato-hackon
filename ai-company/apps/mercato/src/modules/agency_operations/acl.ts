export const features = [
  {
    id: 'agency_operations.cases.escalate',
    title: 'Escalate agency cases to employees',
    module: 'agency_operations',
    dependsOn: ['agency_operations.cases.view', 'customers.companies.view'],
  },
  {
    id: 'agency_operations.cases.view',
    title: 'View agency cases',
    module: 'agency_operations',
    dependsOn: ['workflows.instances.view'],
  },
]

export default features
