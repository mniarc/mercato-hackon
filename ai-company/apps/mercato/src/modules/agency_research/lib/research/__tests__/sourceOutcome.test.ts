/** @jest-environment node */
import { runSourcesStep } from '../steps/sources'
import { createLedger } from '../ledger'
import { InsufficientSourceEvidenceError } from '../sourceOutcome'

test('no readable evidence is a typed customer-data outcome, never invented agent content', async () => {
  const runAgent = jest.fn()
  await expect(runSourcesStep({
    order: { brand: 'Example', websiteUrl: 'https://example.test', market: 'PL', language: 'pl', outputLanguage: 'pl',
      officialSocialUrl: null, officialSocialPlatform: null, purchaseGoal: null, sku: 'test', topics: 7 },
    sources: [], runAgent, ledger: createLedger({ maxPln: 2 }), models: { extract: 'test', synthesis: 'test', qa: 'test' },
  })).rejects.toBeInstanceOf(InsufficientSourceEvidenceError)
  expect(runAgent).not.toHaveBeenCalled()
})
