// P6 — content plan (6.2) and plan QA (6.3, Q-P). Selection (6.5) and the post instruction (6.7) are code. Pure identifiers.
export const RESEARCH_PLAN_WRITER_AGENT_ID = 'agency_research.plan_writer'
export const RESEARCH_PLAN_QA_AGENT_ID = 'agency_research.plan_qa'

export const planAgentTiers = {
  [RESEARCH_PLAN_WRITER_AGENT_ID]: 'synthesis',
  [RESEARCH_PLAN_QA_AGENT_ID]: 'qa',
} as const
