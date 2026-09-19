import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { agentDefinition as clientTriage } from './agents/client-triage/definition'
import { isClientTriageEnabled } from './agents/client-triage/configuration'
import { agentDefinition as salesAdvisor } from './agents/sales-advisor/definition'

export const aiAgents: AiAgentDefinition[] = isClientTriageEnabled() ? [clientTriage, salesAdvisor].map((definition) => ({
  ...defineAgent(definition),
  requiredFeatures: ['agent_orchestrator.agents.run'],
  untrustedInput: true,
  allowRuntimeOverride: false,
})) : []
export default aiAgents
