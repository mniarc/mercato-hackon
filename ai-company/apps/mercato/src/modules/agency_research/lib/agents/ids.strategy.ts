// P5 — strategy (5.2), tone of voice (5.3) and their QA (5.4, Q-S). Pure identifiers.
export const RESEARCH_STRATEGY_WRITER_AGENT_ID = 'agency_research.strategy_writer'
export const RESEARCH_TOV_WRITER_AGENT_ID = 'agency_research.tov_writer'
export const RESEARCH_STRATEGY_QA_AGENT_ID = 'agency_research.strategy_qa'

export const strategyAgentTiers = {
  [RESEARCH_STRATEGY_WRITER_AGENT_ID]: 'synthesis',
  [RESEARCH_TOV_WRITER_AGENT_ID]: 'synthesis',
  [RESEARCH_STRATEGY_QA_AGENT_ID]: 'qa',
} as const
