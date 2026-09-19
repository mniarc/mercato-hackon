import type { DefineAgentInput } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { CLIENT_TRIAGE_AGENT_ID, outputSchema } from './contract'
import { systemPrompt } from './prompt'

export const agentDefinition = {
  id: CLIENT_TRIAGE_AGENT_ID,
  moduleId: 'agency_operations',
  label: 'Client submission triage',
  description: 'Disabled interpretation scaffold; bounded workflow activation and configuration required.',
  instructions: systemPrompt,
  agentType: 'researcher',
  tools: [],
  subAgents: [],
  allowedActions: [],
  result: { kind: 'research', schema: outputSchema },
} satisfies DefineAgentInput
