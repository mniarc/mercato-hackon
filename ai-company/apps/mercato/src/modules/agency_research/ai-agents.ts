import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { auditAgents } from './lib/agents/audit'
import { briefAgents } from './lib/agents/brief'
import { briefAnswerAgent } from './lib/briefRevision/agent'
import { competitorsAgents } from './lib/agents/competitors'
import { findingsAgents } from './lib/agents/findings'
import { sourcesAgents } from './lib/agents/sources'
import { strategyAgents } from './lib/agents/strategy'
import { planAgents } from './lib/agents/plan'
import { postAgents } from './lib/agents/post'

export * from './lib/agentIds'

// The audit-and-research agents (P3 steps 3.2 → 3.7, P4 steps 4.1 → 4.2) are
// RESEARCHERS with NO tools, driven map → reduce by `lib/research/steps/*`; the
// production agents (P5 strategy/ToV, P6 plan, P7 post/editor) follow the same
// contract, and P8 publication documents and P9 package are code only. Each
// reads one bounded input and returns one SECTION of a document — never a whole
// document, never the envelope. Ids are minted by code; every quote is checked
// verbatim against the stored page by the gate. Definitions live per phase under
// `lib/agents/`; this file is the registration entry point the generator scans.

export const aiAgents: AiAgentDefinition[] = [...sourcesAgents, ...auditAgents, ...competitorsAgents, ...findingsAgents, ...briefAgents, briefAnswerAgent, ...strategyAgents, ...planAgents, ...postAgents]

export default aiAgents
