import type { DefineAgentInput } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { outputSchema } from './contract'
import { systemPrompt } from './prompt'

export const agentDefinition = {
  id: 'agency_operations.post_copywriter',
  moduleId: 'agency_operations',
  label: 'Post copywriter',
  description: 'Disabled scaffold for one proposed post; no workflow or persistence activation.',
  instructions: systemPrompt,
  agentType: 'researcher',
  tools: [],
  subAgents: [],
  allowedActions: [],
  result: { kind: 'research', schema: outputSchema },
} satisfies DefineAgentInput
