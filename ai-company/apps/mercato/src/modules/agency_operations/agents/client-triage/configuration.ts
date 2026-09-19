import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

export const CLIENT_TRIAGE_ENABLED_ENV = 'OM_AGENCY_TRIAGE_ENABLED'

export const CLIENT_TRIAGE_FIXTURE_ENVIRONMENT = Object.freeze({
  AGENCY_TEST_NATIVE_TRIAGE: '1',
  OM_AI_PROVIDER: 'openrouter',
  OM_AI_MODEL: 'openrouter/agency-triage-fixture',
  OM_AI_AVAILABLE_PROVIDERS: 'openrouter',
  OM_AI_AVAILABLE_MODELS_OPENROUTER: 'agency-triage-fixture',
  OM_AI_AGENCY_OPERATIONS_PROVIDER: 'openrouter',
  OM_AI_AGENCY_OPERATIONS_MODEL: 'openrouter/agency-triage-fixture',
  OPENROUTER_API_KEY: 'agency-triage-fixture-only',
  OPENROUTER_BASE_URL: 'http://127.0.0.1:5003/v1',
  AGENCY_OPERATIONS_AI_BASE_URL: 'http://127.0.0.1:5003/v1',
})

export function isClientTriageEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  if (!parseBooleanWithDefault(environment[CLIENT_TRIAGE_ENABLED_ENV], false)) return false
  const invalid = Object.entries(CLIENT_TRIAGE_FIXTURE_ENVIRONMENT)
    .find(([key, value]) => environment[key] !== value)
  if (invalid) {
    throw new Error(`[internal] Native client triage cannot run with live providers: required versioned task limits are not supported by the native execution contract. Only the explicit local intelligence fixture is enabled; check ${invalid[0]}.`)
  }
  return true
}
