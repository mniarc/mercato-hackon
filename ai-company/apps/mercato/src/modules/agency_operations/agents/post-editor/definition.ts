import type { DefineAgentInput } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { outputSchema } from './contract'
import { systemPrompt } from './prompt'

export const agentDefinition = {
  id: 'agency_operations.post_editor',
  moduleId: 'agency_operations',
  label: 'Post editor',
  description: 'Disabled scaffold for version-bound editorial QA and evidence-return recommendations.',
  instructions: systemPrompt,
  agentType: 'researcher',
  tools: [],
  subAgents: [],
  allowedActions: [],
  result: { kind: 'research', schema: outputSchema },
} satisfies DefineAgentInput
