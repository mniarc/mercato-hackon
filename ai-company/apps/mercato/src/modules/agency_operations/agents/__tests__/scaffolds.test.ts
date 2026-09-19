/** @jest-environment node */
import { z } from 'zod'
import * as definitions from '..'
import { aiAgents } from '../../ai-agents'
import { outputSchema as qualityOutput } from '../quality-reviewer/contract'

test('exports the fifteen mapped worker roles without activating unfinished processes', () => {
  const ids = Object.values(definitions).map((definition) => definition.id).sort()
  expect(new Set(ids).size).toBe(15)
  expect(ids).toEqual([
    'brand_auditor', 'brief_author', 'change_impact', 'client_communication', 'client_triage',
    'content_planner', 'findings_analyst', 'market_researcher', 'post_copywriter', 'post_editor',
    'quality_reviewer', 'sales_advisor', 'scope_assessment', 'source_researcher', 'strategy_author',
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

test('quality review preserves stage-specific outcomes rather than a universal approval result', () => {
  const review = {
    reviewedRefs: [{ documentId: 'brief', version: 'v1' }], criteriaVersion: 'criteria-v1',
    findings: [], rationale: 'A client goal is still missing.',
  }
  expect(qualityOutput.safeParse({ ...review, stage: 'brief', recommendation: 'needs_client_data' }).success).toBe(true)
  expect(qualityOutput.safeParse({ ...review, stage: 'strategy_pair', recommendation: 'needs_client_data' }).success).toBe(false)
  expect(qualityOutput.safeParse({ ...review, stage: 'brief', recommendation: 'approved' }).success).toBe(false)
})
