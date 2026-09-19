import type { DefineAgentInput } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { outputSchema } from './contract'
import { systemPrompt } from './prompt'

export const agentDefinition = {
  id: 'agency_operations.findings_analyst',
  moduleId: 'agency_operations',
  label: 'Findings analyst',
  description: 'Disabled role scaffold; requires scoped workflow wiring and configured execution limits before activation.',
  instructions: systemPrompt,
  agentType: 'researcher',
  tools: [],
  subAgents: [],
  allowedActions: [],
  result: { kind: 'research', schema: outputSchema },
} satisfies DefineAgentInput
