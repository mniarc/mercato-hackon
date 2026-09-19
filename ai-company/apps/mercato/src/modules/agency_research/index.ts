import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'agency_research',
  title: 'AI Agency — audit and research',
  version: '0.1.0',
  description:
    'Audit department of the AI marketing agency: research agents that read the client\'s public sources into a cited source register (P3) and prepare the brief (P4), every claim traced to a stored source row.',
  author: 'Open Mercato hackathon team',
  license: 'MIT',
  requires: ['agent_orchestrator'],
}

export default metadata
