// F08 — findings map (3.6) and analysis QA (3.7). Pure identifiers.
export const RESEARCH_FIELD_MAPPER_AGENT_ID = 'agency_research.field_mapper'
export const RESEARCH_QUESTION_WRITER_AGENT_ID = 'agency_research.question_writer'
export const RESEARCH_READINESS_ASSESSOR_AGENT_ID = 'agency_research.readiness_assessor'
export const RESEARCH_QA_AGENT_ID = 'agency_research.research_qa'

export const findingsAgentTiers = {
  [RESEARCH_FIELD_MAPPER_AGENT_ID]: 'synthesis',
  [RESEARCH_QUESTION_WRITER_AGENT_ID]: 'synthesis',
  [RESEARCH_READINESS_ASSESSOR_AGENT_ID]: 'extract',
  [RESEARCH_QA_AGENT_ID]: 'qa',
} as const
