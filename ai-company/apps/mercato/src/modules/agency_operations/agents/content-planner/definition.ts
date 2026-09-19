import type { DefineAgentInput } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { outputSchema } from './contract'
import { systemPrompt } from './prompt'

export const agentDefinition = {
  id: 'agency_operations.content_planner',
  moduleId: 'agency_operations',
  label: 'Content planner',
  description: 'Disabled scaffold for a source-grounded content plan; no workflow or persistence activation.',
  instructions: systemPrompt,
  agentType: 'researcher',
  tools: [],
  subAgents: [],
  allowedActions: [],
  result: { kind: 'research', schema: outputSchema },
} satisfies DefineAgentInput
