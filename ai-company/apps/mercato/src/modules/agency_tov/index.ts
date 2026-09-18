import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'agency_tov',
  title: 'AI Agency — tone of voice',
  version: '0.1.0',
  description:
    'Brand-language department of the AI marketing agency: tone-of-voice research agents that read a LinkedIn post corpus in batches and produce the KLI-TOV document.',
  author: 'Open Mercato hackathon team',
  license: 'MIT',
  requires: ['agent_orchestrator'],
}

export default metadata
