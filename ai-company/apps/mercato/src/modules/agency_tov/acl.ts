export const features = [
  { id: 'agency_tov.view', title: 'View tone-of-voice research', module: 'agency_tov' },
  {
    id: 'agency_tov.manage',
    title: 'Run tone-of-voice research',
    module: 'agency_tov',
    dependsOn: ['agency_tov.view'],
  },
]

export default features
