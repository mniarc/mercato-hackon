// Pure identifiers, aggregated per phase: importing a service or the CLI must not register agents.
import { auditAgentTiers } from './agents/ids.audit'
import { briefAgentTiers } from './agents/ids.brief'
import { competitorsAgentTiers } from './agents/ids.competitors'
import { findingsAgentTiers } from './agents/ids.findings'
import { sourcesAgentTiers } from './agents/ids.sources'

export * from './agents/ids.sources'
export * from './agents/ids.audit'
export * from './agents/ids.competitors'
export * from './agents/ids.findings'
export * from './agents/ids.brief'

export type ResearchAgentTier = 'extract' | 'synthesis' | 'qa'

/** Model tier per agent: map/extract and QA on the cheap model, syntheses on the strong one. */
export const RESEARCH_AGENT_TIERS: Record<string, ResearchAgentTier> = {
  ...sourcesAgentTiers,
  ...auditAgentTiers,
  ...competitorsAgentTiers,
  ...findingsAgentTiers,
  ...briefAgentTiers,
}
