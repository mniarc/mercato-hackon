// Pure identifiers: importing a service or the CLI must not register agents.
// Prompt v2 roles 37–39 (Rafał): a run auditor and two explicitly synthetic clients
// for rehearsals without a real client. None of them decides, approves or publishes.
export const RESEARCH_LIVE_AUDITOR_AGENT_ID = 'agency_research.live_auditor'
export const RESEARCH_SYNTHETIC_ONBOARDING_AGENT_ID = 'agency_research.synthetic_client.onboarding'
export const RESEARCH_SYNTHETIC_REVIEW_AGENT_ID = 'agency_research.synthetic_client.review'

export const reviewAgentTiers = {
  [RESEARCH_LIVE_AUDITOR_AGENT_ID]: 'qa',
  [RESEARCH_SYNTHETIC_ONBOARDING_AGENT_ID]: 'synthesis',
  [RESEARCH_SYNTHETIC_REVIEW_AGENT_ID]: 'synthesis',
} as const
