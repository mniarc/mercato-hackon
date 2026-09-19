/** @jest-environment node */
import { z } from 'zod'
import * as definitions from '..'
import { aiAgents } from '../../ai-agents'

test('exports only the five agency-owned worker roles without competing research or production scaffolds', () => {
  const ids = Object.values(definitions).map((definition) => definition.id).sort()
  expect(new Set(ids).size).toBe(5)
  expect(ids).toEqual([
    'change_impact', 'client_communication', 'client_triage', 'sales_advisor', 'scope_assessment',
  ].map((name) => `agency_operations.${name}`).sort())
  expect(aiAgents).toEqual([])
})

test.each(Object.values(definitions).map((definition) => [definition.id, definition] as const))(
  '%s declares native research output, no effects, editable instructions and shared model config',
  (_id, definition) => {
    expect(definition).toMatchObject({
      moduleId: 'agency_operations', agentType: 'researcher', result: { kind: 'research' },
      tools: [], subAgents: [], allowedActions: [],
    })
    expect(definition).not.toHaveProperty('defaultModel')
    expect(definition).not.toHaveProperty('defaultProvider')
    const schema = definition.result.schema as z.ZodType
    expect(schema.safeParse({}).success).toBe(false)
    expect(z.toJSONSchema(schema)).toHaveProperty('$schema')
    for (const heading of ['ROLE', 'SCOPE', 'DATA', 'TOOLS', 'ATTACHMENTS', 'MUTATION POLICY', 'RESPONSE STYLE']) {
      expect(definition.instructions).toContain(`${heading}\n`)
    }
  },
)
