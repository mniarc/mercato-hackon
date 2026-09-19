/** @jest-environment node */
import { defaultModels } from '../lib/researchService'

jest.mock('@open-mercato/web-research', () => ({ assertPublicUrl: jest.fn() }))

const modelKeys = [
  'OM_AI_MODEL', 'OM_AI_AGENCY_RESEARCH_MODEL', 'AGENCY_RESEARCH_AI_MODEL',
  'OM_AGENCY_RESEARCH_MODEL_EXTRACT', 'OM_AGENCY_RESEARCH_MODEL_SYNTHESIS', 'OM_AGENCY_RESEARCH_MODEL_QA',
]

afterEach(() => jest.restoreAllMocks())

it.each([
  {
    name: 'shared model for every tier',
    env: { OM_AI_MODEL: 'openrouter/example/shared' },
    expected: { extract: 'openrouter/example/shared', synthesis: 'openrouter/example/shared', qa: 'openrouter/example/shared' },
  },
  {
    name: 'intentional per-tier overrides',
    env: {
      OM_AI_MODEL: 'openrouter/example/shared',
      OM_AGENCY_RESEARCH_MODEL_EXTRACT: 'openrouter/example/extract',
      OM_AGENCY_RESEARCH_MODEL_SYNTHESIS: 'openrouter/example/synthesis',
      OM_AGENCY_RESEARCH_MODEL_QA: 'openrouter/example/qa',
    },
    expected: { extract: 'openrouter/example/extract', synthesis: 'openrouter/example/synthesis', qa: 'openrouter/example/qa' },
  },
  {
    name: 'QA inheritance from an intentional extraction tier',
    env: { OM_AI_MODEL: 'openrouter/example/shared', OM_AGENCY_RESEARCH_MODEL_EXTRACT: 'openrouter/example/extract' },
    expected: { extract: 'openrouter/example/extract', synthesis: 'openrouter/example/shared', qa: 'openrouter/example/extract' },
  },
  {
    name: 'original models when no shared setting exists',
    env: {},
    expected: { extract: 'openrouter/anthropic/claude-haiku-4.5', synthesis: 'openrouter/anthropic/claude-sonnet-5', qa: 'openrouter/anthropic/claude-haiku-4.5' },
  },
  {
    name: 'original models for a blank shared setting',
    env: { OM_AI_MODEL: '  ' },
    expected: { extract: 'openrouter/anthropic/claude-haiku-4.5', synthesis: 'openrouter/anthropic/claude-sonnet-5', qa: 'openrouter/anthropic/claude-haiku-4.5' },
  },
])('uses $name for definitions and estimation defaults', ({ env, expected }) => {
  const environment = { ...process.env }
  for (const key of modelKeys) delete environment[key]
  Object.assign(environment, env)
  jest.replaceProperty(process, 'env', environment)
  jest.isolateModules(() => {
    const { MODEL_EXTRACT, MODEL_SYNTHESIS, MODEL_QA } = jest.requireActual<typeof import('../lib/agents/shared')>('../lib/agents/shared')
    expect({ extract: MODEL_EXTRACT, synthesis: MODEL_SYNTHESIS, qa: MODEL_QA }).toEqual(expected)
  })
  expect(defaultModels(environment)).toEqual({
    extract: expected.extract.replace(/^openrouter\//, ''),
    synthesis: expected.synthesis.replace(/^openrouter\//, ''),
    qa: expected.qa.replace(/^openrouter\//, ''),
  })
})

it.each(['OM_AI_AGENCY_RESEARCH_MODEL', 'AGENCY_RESEARCH_AI_MODEL'])('estimates the intentional native module override %s ahead of tier defaults', (key) => {
  expect(defaultModels({
    OM_AI_MODEL: 'openrouter/example/shared',
    OM_AGENCY_RESEARCH_MODEL_EXTRACT: 'openrouter/example/extract',
    OM_AGENCY_RESEARCH_MODEL_SYNTHESIS: 'openrouter/example/synthesis',
    OM_AGENCY_RESEARCH_MODEL_QA: 'openrouter/example/qa',
    [key]: 'openrouter/example/module',
  })).toEqual({ extract: 'example/module', synthesis: 'example/module', qa: 'example/module' })
})
