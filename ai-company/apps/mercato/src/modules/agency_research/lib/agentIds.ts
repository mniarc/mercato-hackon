// Pure identifiers, aggregated per phase: importing a service or the CLI must not register agents.
import { auditAgentTiers } from './agents/ids.audit'
import { briefAgentTiers } from './agents/ids.brief'
import { competitorsAgentTiers } from './agents/ids.competitors'
import { findingsAgentTiers } from './agents/ids.findings'
import { sourcesAgentTiers } from './agents/ids.sources'
import { peopleAgentTiers } from './agents/ids.people'
import { strategyAgentTiers } from './agents/ids.strategy'
import { planAgentTiers } from './agents/ids.plan'
import { postAgentTiers } from './agents/ids.post'
import { reviewAgentTiers } from './agents/ids.review'

export * from './agents/ids.sources'
export * from './agents/ids.people'
export * from './agents/ids.audit'
export * from './agents/ids.competitors'
export * from './agents/ids.findings'
export * from './agents/ids.brief'
export * from './agents/ids.strategy'
export * from './agents/ids.plan'
export * from './agents/ids.post'
export * from './agents/ids.review'

export type ResearchAgentTier = 'extract' | 'synthesis' | 'qa'

/** Model tier per agent: map/extract and QA on the cheap model, syntheses on the strong one. */
export const RESEARCH_AGENT_TIERS: Record<string, ResearchAgentTier> = {
  ...sourcesAgentTiers,
  ...peopleAgentTiers,
  ...auditAgentTiers,
  ...competitorsAgentTiers,
  ...findingsAgentTiers,
  ...briefAgentTiers,
  ...strategyAgentTiers,
  ...planAgentTiers,
  ...postAgentTiers,
  ...reviewAgentTiers,
}
