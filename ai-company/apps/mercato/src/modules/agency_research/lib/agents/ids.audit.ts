// F07 — communication audit (3.3). Pure identifiers.
export const RESEARCH_AUDIT_MAPPER_AGENT_ID = 'agency_research.audit_mapper'
export const RESEARCH_AUDIT_VOICE_AGENT_ID = 'agency_research.audit_voice_and_gaps'

export const auditAgentTiers = {
  [RESEARCH_AUDIT_MAPPER_AGENT_ID]: 'synthesis',
  [RESEARCH_AUDIT_VOICE_AGENT_ID]: 'synthesis',
} as const
