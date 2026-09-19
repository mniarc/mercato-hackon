// Bootstrap loads DI and CLI separately from generated agent registration.
// Importing either must not evaluate the registration entry point again.
jest.mock('../ai-agents', () => {
  throw new Error('research registration must only be loaded by the native agent registry')
})
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent', () => ({
  getAgentEntry: jest.fn(),
  ensureAgentsLoaded: jest.fn(),
}))
jest.mock('@open-mercato/web-research', () => ({ assertPublicUrl: jest.fn() }))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('ai', () => ({ generateText: jest.fn(), Output: {} }))

it('loads CLI and DI without eagerly registering research agents', async () => {
  const cli = await import('../cli')
  const di = await import('../di')
  expect(cli.default.map((command) => command.command)).toEqual(['run', 'status', 'escalations'])
  expect(typeof di.register).toBe('function')
})

it('exposes the service by the name other modules resolve, with a duck-typed run/status contract', async () => {
  const { AGENCY_RESEARCH_SERVICE, createAgencyResearchService } = await import('../lib/researchService')
  expect(AGENCY_RESEARCH_SERVICE).toBe('agencyResearchService')
  const service = createAgencyResearchService({ resolve: () => ({}) })
  expect(typeof service.run).toBe('function')
  expect(typeof service.status).toBe('function')
  await expect(service.run({ context: { tenantId: '', organizationId: '', userId: '' }, request: { orderRef: 'x', order: {} as never } })).rejects.toThrow(/explicit tenant/)
})

it('disables only the competing ToV writer through the native app override contract', () => {
  const previous = { enterprise: process.env.OM_ENABLE_ENTERPRISE_MODULES, agents: process.env.OM_ENABLE_ENTERPRISE_MODULES_AGENTS }
  process.env.OM_ENABLE_ENTERPRISE_MODULES = 'true'
  process.env.OM_ENABLE_ENTERPRISE_MODULES_AGENTS = 'true'
  try {
    jest.isolateModules(() => {
      const { enabledModules } = require('../../../modules') as typeof import('../../../modules')
      const { applyAgentOverrideMap } = require('@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-overrides') as typeof import('@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-overrides')
      const overrides = enabledModules.find((entry) => entry.id === 'agency_research')?.overrides?.ai?.agents
      expect(overrides).toEqual({ 'agency_research.tov_writer': null })
      const original = [{ id: 'agency_research.tov_writer' }, { id: 'agency_research.strategy_qa' }, { id: 'agency_tov.brand_synthesizer' }]
      expect(applyAgentOverrideMap(original as never, overrides as never).map((agent) => agent.id))
        .toEqual(['agency_research.strategy_qa', 'agency_tov.brand_synthesizer'])
      expect(original[0].id).toBe('agency_research.tov_writer')
    })
  } finally {
    if (previous.enterprise === undefined) delete process.env.OM_ENABLE_ENTERPRISE_MODULES
    else process.env.OM_ENABLE_ENTERPRISE_MODULES = previous.enterprise
    if (previous.agents === undefined) delete process.env.OM_ENABLE_ENTERPRISE_MODULES_AGENTS
    else process.env.OM_ENABLE_ENTERPRISE_MODULES_AGENTS = previous.agents
  }
})
