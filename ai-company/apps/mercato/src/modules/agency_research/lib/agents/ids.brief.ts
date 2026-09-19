// F09 — brief (4.1) and brief QA (4.2). Pure identifiers.
export const RESEARCH_BRIEF_WRITER_AGENT_ID = 'agency_research.brief_writer'
export const RESEARCH_BRIEF_QA_AGENT_ID = 'agency_research.brief_qa'

export const briefAgentTiers = {
  [RESEARCH_BRIEF_WRITER_AGENT_ID]: 'synthesis',
  [RESEARCH_BRIEF_QA_AGENT_ID]: 'qa',
} as const
