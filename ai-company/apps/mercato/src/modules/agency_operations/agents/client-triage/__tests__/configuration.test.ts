/** @jest-environment node */
import { CLIENT_TRIAGE_ENABLED_ENV, CLIENT_TRIAGE_FIXTURE_ENVIRONMENT, isClientTriageEnabled } from '../configuration'

const fixture = { ...CLIENT_TRIAGE_FIXTURE_ENVIRONMENT, [CLIENT_TRIAGE_ENABLED_ENV]: 'true' }

test('keeps ordinary development disabled without requiring fixture configuration', () => {
  expect(isClientTriageEnabled({})).toBe(false)
  expect(isClientTriageEnabled({ [CLIENT_TRIAGE_ENABLED_ENV]: 'false', OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1' })).toBe(false)
})

test('activation alone cannot authorize paid execution with unsupported native task limits', () => {
  expect(() => isClientTriageEnabled({ [CLIENT_TRIAGE_ENABLED_ENV]: 'true' }))
    .toThrow('required versioned task limits are not supported by the native execution contract')
})

test('accepts the explicit fully constrained localhost intelligence fixture', () => {
  expect(isClientTriageEnabled(fixture)).toBe(true)
})

test('rejects missing or changed fixture settings, including the higher-priority module endpoint', () => {
  for (const key of Object.keys(CLIENT_TRIAGE_FIXTURE_ENVIRONMENT)) {
    for (const value of [undefined, 'unexpected']) {
      expect(() => isClientTriageEnabled({ ...fixture, [key]: value })).toThrow(`check ${key}.`)
    }
  }
  expect(() => isClientTriageEnabled({ ...fixture, AGENCY_OPERATIONS_AI_BASE_URL: 'https://openrouter.ai/api/v1' }))
    .toThrow('check AGENCY_OPERATIONS_AI_BASE_URL.')
})
