// Bootstrap loads DI and CLI separately from generated agent registration.
// Importing either must not evaluate the registration entry point again.
jest.mock('../ai-agents', () => {
  throw new Error('ToV registration must only be loaded by the native agent registry')
})
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent', () => ({
  getAgentEntry: jest.fn(), ensureAgentsLoaded: jest.fn(),
}))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('ai', () => ({ generateText: jest.fn(), Output: {} }))

it('loads CLI and DI without eagerly registering ToV agents', async () => {
  const cli = await import('../cli')
  const di = await import('../di')
  expect(cli.default.map((command) => command.command)).toEqual(['run', 'import'])
  expect(typeof di.register).toBe('function')
})
