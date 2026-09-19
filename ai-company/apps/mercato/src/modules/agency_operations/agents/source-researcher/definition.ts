import type { DefineAgentInput } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { outputSchema } from './contract'
import { systemPrompt } from './prompt'

export const agentDefinition = {
  id: 'agency_operations.source_researcher',
  moduleId: 'agency_operations',
  label: 'Source researcher',
  description: 'Disabled role scaffold; requires scoped workflow wiring and configured execution limits before activation.',
  instructions: systemPrompt,
  agentType: 'researcher',
  tools: [],
  subAgents: [],
  allowedActions: [],
  result: { kind: 'research', schema: outputSchema },
} satisfies DefineAgentInput
