// P7 — post author (7.2) and the independent editor (7.3, Q-T). Pure identifiers.
export const RESEARCH_POST_AUTHOR_AGENT_ID = 'agency_research.post_author'
export const RESEARCH_POST_EDITOR_AGENT_ID = 'agency_research.post_editor'

export const postAgentTiers = {
  [RESEARCH_POST_AUTHOR_AGENT_ID]: 'synthesis',
  [RESEARCH_POST_EDITOR_AGENT_ID]: 'qa',
} as const
