// Pure identifiers: importing a service or the CLI must not register agents.
export const RESEARCH_PAGE_EXTRACTOR_AGENT_ID = 'agency_research.page_extractor'
export const RESEARCH_PROOF_BUILDER_AGENT_ID = 'agency_research.proof_builder'
export const RESEARCH_CONTENT_SEEDER_AGENT_ID = 'agency_research.content_seeder'
export const RESEARCH_CONFLICT_FINDER_AGENT_ID = 'agency_research.conflict_finder'
export const RESEARCH_COVERAGE_ASSESSOR_AGENT_ID = 'agency_research.coverage_assessor'
export const RESEARCH_QA_AGENT_ID = 'agency_research.research_qa'

/** Model tier per agent: map/extract and QA on the cheap model, syntheses on the strong one. */
export const RESEARCH_AGENT_TIERS = {
  [RESEARCH_PAGE_EXTRACTOR_AGENT_ID]: 'extract',
  [RESEARCH_PROOF_BUILDER_AGENT_ID]: 'synthesis',
  [RESEARCH_CONTENT_SEEDER_AGENT_ID]: 'synthesis',
  [RESEARCH_CONFLICT_FINDER_AGENT_ID]: 'extract',
  [RESEARCH_COVERAGE_ASSESSOR_AGENT_ID]: 'extract',
  [RESEARCH_QA_AGENT_ID]: 'qa',
} as const

export type ResearchAgentTier = (typeof RESEARCH_AGENT_TIERS)[keyof typeof RESEARCH_AGENT_TIERS]
