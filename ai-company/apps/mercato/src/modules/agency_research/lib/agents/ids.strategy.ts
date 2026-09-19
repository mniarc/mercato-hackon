// P5 — strategy (5.2, one agent per section group), tone of voice (5.3) and their QA (5.4, Q-S). Pure identifiers.
export const RESEARCH_STRATEGY_CHOICE_AGENT_ID = 'agency_research.strategy_writer.choice_tension_uvp'
export const RESEARCH_STRATEGY_PROOF_AGENT_ID = 'agency_research.strategy_writer.proof_messages'
export const RESEARCH_STRATEGY_PILLARS_AGENT_ID = 'agency_research.strategy_writer.pillars_channel_boundaries'
export const RESEARCH_TOV_WRITER_AGENT_ID = 'agency_research.tov_writer'
export const RESEARCH_STRATEGY_QA_AGENT_ID = 'agency_research.strategy_qa'

/** The writer agent per KLI-STRATEGIA section group (`input.section`). */
export const STRATEGY_SECTION_AGENT_IDS = {
  choice_tension_uvp: RESEARCH_STRATEGY_CHOICE_AGENT_ID,
  proof_messages: RESEARCH_STRATEGY_PROOF_AGENT_ID,
  pillars_channel_boundaries: RESEARCH_STRATEGY_PILLARS_AGENT_ID,
} as const

export const strategyAgentTiers = {
  [RESEARCH_STRATEGY_CHOICE_AGENT_ID]: 'synthesis',
  [RESEARCH_STRATEGY_PROOF_AGENT_ID]: 'synthesis',
  [RESEARCH_STRATEGY_PILLARS_AGENT_ID]: 'synthesis',
  [RESEARCH_TOV_WRITER_AGENT_ID]: 'synthesis',
  [RESEARCH_STRATEGY_QA_AGENT_ID]: 'qa',
} as const
