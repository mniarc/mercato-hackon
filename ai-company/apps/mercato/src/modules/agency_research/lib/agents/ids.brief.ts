// F09 — brief (4.1, one agent per section group) and brief QA (4.2). Pure identifiers.
export const RESEARCH_BRIEF_OFFER_AGENT_ID = 'agency_research.brief_writer.offer_audience_direction'
export const RESEARCH_BRIEF_PROMISE_VOICE_AGENT_ID = 'agency_research.brief_writer.promise_voice'
export const RESEARCH_BRIEF_CHANNEL_AGENT_ID = 'agency_research.brief_writer.channel_success_assets'
export const RESEARCH_BRIEF_QA_AGENT_ID = 'agency_research.brief_qa'

/** The writer agent per KLI-BRIEF section group (`input.section`). */
export const BRIEF_SECTION_AGENT_IDS = {
  offer_audience_direction: RESEARCH_BRIEF_OFFER_AGENT_ID,
  promise_voice: RESEARCH_BRIEF_PROMISE_VOICE_AGENT_ID,
  channel_success_assets: RESEARCH_BRIEF_CHANNEL_AGENT_ID,
} as const

export const briefAgentTiers = {
  [RESEARCH_BRIEF_OFFER_AGENT_ID]: 'synthesis',
  [RESEARCH_BRIEF_PROMISE_VOICE_AGENT_ID]: 'synthesis',
  [RESEARCH_BRIEF_CHANNEL_AGENT_ID]: 'synthesis',
  [RESEARCH_BRIEF_QA_AGENT_ID]: 'qa',
} as const
