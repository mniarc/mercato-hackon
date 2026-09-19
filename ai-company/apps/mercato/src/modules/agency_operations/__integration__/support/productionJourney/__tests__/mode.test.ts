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
  await selected.close()
})
