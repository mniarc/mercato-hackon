// F07 — communication audit (3.3): the maps, then the voice audit and the gaps/assets as separate agents. Pure identifiers.
export const RESEARCH_AUDIT_MAPPER_AGENT_ID = 'agency_research.audit_mapper'
export const RESEARCH_AUDIT_VOICE_AGENT_ID = 'agency_research.audit_voice'
export const RESEARCH_AUDIT_GAPS_AGENT_ID = 'agency_research.audit_gaps_assets'

export const auditAgentTiers = {
  [RESEARCH_AUDIT_MAPPER_AGENT_ID]: 'synthesis',
  [RESEARCH_AUDIT_VOICE_AGENT_ID]: 'synthesis',
  [RESEARCH_AUDIT_GAPS_AGENT_ID]: 'synthesis',
} as const
