/** @jest-environment node */
import { CLIENT_TRIAGE_ENABLED_ENV, CLIENT_TRIAGE_MODE_ENV, CLIENT_TRIAGE_FIXTURE_ENVIRONMENT, isClientTriageEnabled, resolveClientTriageConfiguration } from '../configuration'

const fixture = { ...CLIENT_TRIAGE_FIXTURE_ENVIRONMENT, [CLIENT_TRIAGE_ENABLED_ENV]: 'true' }
const live = {
  [CLIENT_TRIAGE_MODE_ENV]: 'live', OM_AI_PROVIDER: 'openrouter', OM_AI_MODEL: 'openrouter/vendor/approved-model',
  OPENROUTER_API_KEY: 'test-only-not-a-real-provider-key', OM_AGENT_RUN_TIMEOUT_MS: '60000',
  OM_AGENT_PROVIDER_RETRY_MAX: '1', OM_AGENT_PROVIDER_RETRY_BASE_MS: '1000',
}

test('keeps ordinary development disabled without requiring fixture configuration', () => {
  expect(isClientTriageEnabled({})).toBe(false)
  expect(isClientTriageEnabled({ [CLIENT_TRIAGE_ENABLED_ENV]: 'false', OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1' })).toBe(false)
})

test('legacy activation remains fixture-only and cannot select live execution', () => {
  expect(() => isClientTriageEnabled({ [CLIENT_TRIAGE_ENABLED_ENV]: 'true' }))
    .toThrow('fixture configuration is not ready')
  expect(resolveClientTriageConfiguration(fixture)).toEqual({ mode: 'fixture' })
})

test('an explicit mode takes precedence and unknown modes are rejected', () => {
  expect(resolveClientTriageConfiguration({ ...fixture, [CLIENT_TRIAGE_MODE_ENV]: 'disabled' })).toEqual({ mode: 'disabled' })
  expect(isClientTriageEnabled({ ...fixture, [CLIENT_TRIAGE_ENABLED_ENV]: 'false', [CLIENT_TRIAGE_MODE_ENV]: 'fixture' })).toBe(true)
  expect(() => resolveClientTriageConfiguration({ [CLIENT_TRIAGE_MODE_ENV]: 'automatic' })).toThrow(`check ${CLIENT_TRIAGE_MODE_ENV}.`)
})

test('describes configured live readiness without returning credentials or making provider calls', () => {
  expect(resolveClientTriageConfiguration(live)).toEqual({
    mode: 'live', provider: 'openrouter', model: live.OM_AI_MODEL,
    runTimeoutMs: 60000, providerRetryMax: 1, providerRetryBaseMs: 1000,
  })
  expect(isClientTriageEnabled(live)).toBe(true)
})

test('requires an explicit configured shared provider and supported positive native controls', () => {
  for (const field of ['OM_AI_PROVIDER', 'OM_AI_MODEL', 'OPENROUTER_API_KEY', 'OM_AGENT_RUN_TIMEOUT_MS', 'OM_AGENT_PROVIDER_RETRY_MAX', 'OM_AGENT_PROVIDER_RETRY_BASE_MS']) {
    expect(() => resolveClientTriageConfiguration({ ...live, [field]: undefined })).toThrow(`check ${field}.`)
  }
  for (const value of ['0', '-1', '1.5', '1e3', 'invalid']) {
    expect(() => resolveClientTriageConfiguration({ ...live, OM_AGENT_PROVIDER_RETRY_MAX: value })).toThrow('check OM_AGENT_PROVIDER_RETRY_MAX.')
  }
  for (const model of ['openrouter/', 'openai/another-model', 'unqualified-model']) {
    expect(() => resolveClientTriageConfiguration({ ...live, OM_AI_MODEL: model })).toThrow('check OM_AI_MODEL.')
  }
  expect(() => resolveClientTriageConfiguration({ ...live, OM_AI_AGENCY_OPERATIONS_MODEL: 'vendor/approved-model' }))
    .toThrow('check OM_AI_AGENCY_OPERATIONS_MODEL.')
})

test('rejects fixture leftovers and conflicting module selection instead of silently running another model', () => {
  for (const [field, value] of Object.entries({
    AGENCY_TEST_NATIVE_TRIAGE: '1', OPENROUTER_API_KEY: CLIENT_TRIAGE_FIXTURE_ENVIRONMENT.OPENROUTER_API_KEY,
    OM_AI_MODEL: CLIENT_TRIAGE_FIXTURE_ENVIRONMENT.OM_AI_MODEL,
    OPENROUTER_BASE_URL: CLIENT_TRIAGE_FIXTURE_ENVIRONMENT.OPENROUTER_BASE_URL,
    AGENCY_OPERATIONS_AI_BASE_URL: CLIENT_TRIAGE_FIXTURE_ENVIRONMENT.AGENCY_OPERATIONS_AI_BASE_URL,
    OM_AI_AGENCY_OPERATIONS_MODEL: 'another/model', AGENCY_OPERATIONS_AI_MODEL: 'another/model',
    OM_AI_AGENCY_OPERATIONS_PROVIDER: 'another-provider', AGENCY_OPERATIONS_AI_PROVIDER: 'another-provider',
    OM_AI_AVAILABLE_MODELS_OPENROUTER: 'agency-triage-fixture',
  })) {
    expect(() => resolveClientTriageConfiguration({ ...live, [field]: value })).toThrow(`check ${field}.`)
  }
})

test('accepts the explicit fully constrained localhost intelligence fixture', () => {
  expect(isClientTriageEnabled(fixture)).toBe(true)
})

test('manual fixture uses its separate pinned loopback port without changing automated fixtures', () => {
  const manual = { ...fixture, AGENCY_MANUAL_PROFILE: 'fixture',
    OPENROUTER_BASE_URL: 'http://127.0.0.1:5005/v1', AGENCY_OPERATIONS_AI_BASE_URL: 'http://127.0.0.1:5005/v1' }
  expect(isClientTriageEnabled(manual)).toBe(true)
  expect(() => isClientTriageEnabled({ ...manual, AGENCY_OPERATIONS_AI_BASE_URL: 'https://openrouter.ai/api/v1' }))
    .toThrow('check AGENCY_OPERATIONS_AI_BASE_URL.')
  expect(() => isClientTriageEnabled({ ...manual, AGENCY_MANUAL_PROFILE: undefined })).toThrow('check OPENROUTER_BASE_URL.')
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
