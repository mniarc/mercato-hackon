import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { agentDefinition as clientTriage } from './agents/client-triage/definition'
import { isClientTriageEnabled } from './agents/client-triage/configuration'

export const aiAgents: AiAgentDefinition[] = isClientTriageEnabled() ? [{
  ...defineAgent(clientTriage),
  requiredFeatures: ['agent_orchestrator.agents.run'],
  untrustedInput: true,
  allowRuntimeOverride: false,
}] : []
export default aiAgents
