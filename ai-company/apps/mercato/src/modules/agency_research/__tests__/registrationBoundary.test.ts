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
