jest.mock('../../nativeTriageProvider', () => ({ startNativeTriageProvider: jest.fn() }))
jest.mock('../intelligence', () => ({ createProductionJourneyIntelligence: jest.fn() }))
import { readJourneyMode, startJourneyIntelligence } from '../mode'
import { startNativeTriageProvider } from '../../nativeTriageProvider'
import { createProductionJourneyIntelligence } from '../intelligence'

const fixture = { NODE_ENV: 'test', AGENCY_TEST_NATIVE_TRIAGE: '1', OPENROUTER_BASE_URL: 'http://127.0.0.1:5003/v1',
  OPENROUTER_API_KEY: 'agency-triage-fixture-only', OM_AI_MODEL: 'openrouter/agency-triage-fixture' }
const live = { NODE_ENV: 'test', AGENCY_JOURNEY_INTELLIGENCE: 'live', AGENCY_ALLOW_LIVE: '1',
  AGENCY_JOURNEY_POLICY_FILE: 'approved.json', AGENCY_JOURNEY_CLIENT_INPUT_FILE: 'client.json',
  OM_AI_PROVIDER: 'openrouter', OM_AI_MODEL: 'openrouter/explicit-model', OPENROUTER_API_KEY: 'private-test-value' }
beforeEach(() => jest.clearAllMocks())
it('defaults to the exact unpaid tuple and never accepts a paid fallback', () => {
  expect(readJourneyMode(fixture)).toBe('fixture')
  expect(() => readJourneyMode({ ...fixture, OPENROUTER_BASE_URL: 'https://provider.example/v1' })).toThrow('unpaid')
})
it('requires live opt-in, budget policy and original client choices independently of source fixtures', () => {
  expect(readJourneyMode({ ...live, AGENCY_TEST_RESEARCH_FIXTURE_DIR: 'sources' })).toBe('live')
  expect(() => readJourneyMode({ ...live, AGENCY_ALLOW_LIVE: undefined })).toThrow('opt-in')
  expect(() => readJourneyMode({ ...live, AGENCY_JOURNEY_POLICY_FILE: undefined })).toThrow('policy')
  expect(() => readJourneyMode({ ...live, AGENCY_TEST_NATIVE_TRIAGE: '1' })).toThrow('without fixture')
})
it('does not construct or start canned intelligence in live mode', async () => {
  const selected = await startJourneyIntelligence('unused', 'live')
  expect(createProductionJourneyIntelligence).not.toHaveBeenCalled()
  expect(startNativeTriageProvider).not.toHaveBeenCalled()
  expect(selected.baseUrl).toBeNull()
  expect(selected.intelligence.mode).toBe('live')
  expect(selected.intelligence.calls).toEqual([])
  await selected.close()
})
it('tags fixture intelligence without replacing its real call journal or provider', async () => {
  const calls: string[] = []
  const resolveStructured = jest.fn()
  const close = jest.fn(async () => undefined)
  jest.mocked(createProductionJourneyIntelligence).mockReturnValue({ calls, resolveStructured } as unknown as ReturnType<typeof createProductionJourneyIntelligence>)
  jest.mocked(startNativeTriageProvider).mockResolvedValue({ baseUrl: 'http://127.0.0.1:5003/v1', close } as Awaited<ReturnType<typeof startNativeTriageProvider>>)
  const selected = await startJourneyIntelligence('fixture-root', 'fixture')
  expect(selected.intelligence.mode).toBe('fixture')
  expect(selected.intelligence.calls).toBe(calls)
  calls.push('agency_research.post_author', 'agency_research.post_editor')
  expect(selected.intelligence.calls).toEqual(['agency_research.post_author', 'agency_research.post_editor'])
  expect(startNativeTriageProvider).toHaveBeenCalledWith(5003, { resolveStructured })
  await selected.close()
  expect(close).toHaveBeenCalledTimes(1)
})
