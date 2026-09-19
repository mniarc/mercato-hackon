import type { DefineAgentInput } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { outputSchema } from './contract'
import { systemPrompt } from './prompt'

export const agentDefinition = {
  id: 'agency_operations.sales_advisor',
  moduleId: 'agency_operations',
  label: 'Sales advisor',
  description: 'Catalogue-grounded pre-purchase answers after G; execution requires an explicitly configured native sales-question workflow.',
  instructions: systemPrompt,
  agentType: 'researcher',
  tools: [],
  subAgents: [],
  allowedActions: [],
  loop: { maxSteps: 1 },
  result: { kind: 'research', schema: outputSchema },
} satisfies DefineAgentInput
