// F07 — competitors (3.4–3.5): selection, then one card and one channel observation per company, then the synthesis. Pure identifiers.
export const RESEARCH_COMPETITOR_SELECTOR_AGENT_ID = 'agency_research.competitor_selector'
export const RESEARCH_COMPETITOR_CARD_AGENT_ID = 'agency_research.competitor_card'
export const RESEARCH_COMPETITOR_CHANNELS_AGENT_ID = 'agency_research.competitor_channels'
export const RESEARCH_COMPETITOR_SYNTHESIZER_AGENT_ID = 'agency_research.competitor_synthesizer'

export const competitorsAgentTiers = {
  [RESEARCH_COMPETITOR_SELECTOR_AGENT_ID]: 'extract',
  [RESEARCH_COMPETITOR_CARD_AGENT_ID]: 'synthesis',
  [RESEARCH_COMPETITOR_CHANNELS_AGENT_ID]: 'synthesis',
  [RESEARCH_COMPETITOR_SYNTHESIZER_AGENT_ID]: 'synthesis',
} as const
