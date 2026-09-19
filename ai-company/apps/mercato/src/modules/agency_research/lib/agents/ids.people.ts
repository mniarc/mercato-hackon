// Pure identifiers: importing a service or the CLI must not register agents.
export const RESEARCH_PEOPLE_FINDER_AGENT_ID = 'agency_research.people_finder'
export const RESEARCH_CHANNEL_SELECTOR_AGENT_ID = 'agency_research.channel_selector'

export const peopleAgentTiers = {
  [RESEARCH_PEOPLE_FINDER_AGENT_ID]: 'extract',
  [RESEARCH_CHANNEL_SELECTOR_AGENT_ID]: 'extract',
} as const
