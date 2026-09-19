import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { auditAgents } from './lib/agents/audit'
import { briefAgents } from './lib/agents/brief'
import { competitorsAgents } from './lib/agents/competitors'
import { findingsAgents } from './lib/agents/findings'
import { sourcesAgents } from './lib/agents/sources'

export * from './lib/agentIds'

// The audit-and-research agents (P3 steps 3.2 → 3.7, P4 steps 4.1 → 4.2) are
// RESEARCHERS with NO tools, driven map → reduce by `lib/research/steps/*`. Each
// reads one bounded input and returns one SECTION of a document — never a whole
// document, never the envelope. Ids are minted by code; every quote is checked
// verbatim against the stored page by the gate. Definitions live per phase under
// `lib/agents/`; this file is the registration entry point the generator scans.

export const aiAgents: AiAgentDefinition[] = [...sourcesAgents, ...auditAgents, ...competitorsAgents, ...findingsAgents, ...briefAgents]

export default aiAgents
