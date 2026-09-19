import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

export const CLIENT_TRIAGE_ENABLED_ENV = 'OM_AGENCY_TRIAGE_ENABLED'
export const CLIENT_TRIAGE_MODE_ENV = 'OM_AGENCY_TRIAGE_MODE'

/** Expected setup failure, distinct from a storage/provider/runtime fault. */
export class ClientTriageConfigurationError extends Error {
  constructor(mode: string, field: string) {
    super(`[internal] Native client triage ${mode} configuration is not ready; check ${field}.`)
    this.name = 'ClientTriageConfigurationError'
  }
}

export type ClientTriageConfiguration =
  | { mode: 'disabled' | 'fixture' }
  | { mode: 'live'; provider: 'openrouter'; model: string; runTimeoutMs: number; providerRetryMax: number; providerRetryBaseMs: number }

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

export function resolveClientTriageConfiguration(environment: Record<string, string | undefined> = process.env): ClientTriageConfiguration {
  const read = (key: string) => environment[key]?.trim() ?? ''
  const mode = read(CLIENT_TRIAGE_MODE_ENV) || (parseBooleanWithDefault(environment[CLIENT_TRIAGE_ENABLED_ENV], false) ? 'fixture' : 'disabled')
  const invalid = (key: string): never => {
    throw new ClientTriageConfigurationError(mode, key)
  }
  if (mode === 'disabled') return { mode }
  if (mode === 'fixture') {
    const expected = read('AGENCY_MANUAL_PROFILE') === 'fixture' ? {
      ...CLIENT_TRIAGE_FIXTURE_ENVIRONMENT,
      OPENROUTER_BASE_URL: 'http://127.0.0.1:5005/v1',
      AGENCY_OPERATIONS_AI_BASE_URL: 'http://127.0.0.1:5005/v1',
    } : CLIENT_TRIAGE_FIXTURE_ENVIRONMENT
    const mismatch = Object.entries(expected).find(([key, value]) => environment[key] !== value)
    if (mismatch) invalid(mismatch[0])
    return { mode }
  }
  if (mode !== 'live') invalid(CLIENT_TRIAGE_MODE_ENV)
  if (parseBooleanWithDefault(environment.AGENCY_TEST_NATIVE_TRIAGE, false)) invalid('AGENCY_TEST_NATIVE_TRIAGE')
  if (read('OM_AI_PROVIDER') !== 'openrouter') invalid('OM_AI_PROVIDER')
  const model = read('OM_AI_MODEL')
  const modelId = model.replace(/^openrouter\//, '')
  if (!model.startsWith('openrouter/') || !modelId || model.includes('agency-triage-fixture')) invalid('OM_AI_MODEL')
  const key = read('OPENROUTER_API_KEY')
  if (!key || key === CLIENT_TRIAGE_FIXTURE_ENVIRONMENT.OPENROUTER_API_KEY) invalid('OPENROUTER_API_KEY')
  for (const field of ['OM_AI_AGENCY_OPERATIONS_PROVIDER', 'AGENCY_OPERATIONS_AI_PROVIDER']) {
    if (read(field) && read(field) !== 'openrouter') invalid(field)
  }
  for (const field of ['OM_AI_AGENCY_OPERATIONS_MODEL', 'AGENCY_OPERATIONS_AI_MODEL']) {
    if (read(field) && read(field) !== model) invalid(field)
  }
  for (const field of ['OPENROUTER_BASE_URL', 'AGENCY_OPERATIONS_AI_BASE_URL']) {
    if (!read(field)) continue
    let endpoint: URL
    try { endpoint = new URL(read(field)) } catch { return invalid(field) }
    if (!['http:', 'https:'].includes(endpoint.protocol)
      || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(endpoint.hostname)) invalid(field)
  }
  if (read('OM_AI_AVAILABLE_MODELS_OPENROUTER').includes('agency-triage-fixture')) invalid('OM_AI_AVAILABLE_MODELS_OPENROUTER')
  const positiveInteger = (field: string) => {
    const value = Number(read(field))
    if (!/^\d+$/.test(read(field)) || !Number.isSafeInteger(value) || value <= 0) invalid(field)
    return value
  }
  return {
    mode: 'live', provider: 'openrouter', model,
    runTimeoutMs: positiveInteger('OM_AGENT_RUN_TIMEOUT_MS'),
    providerRetryMax: positiveInteger('OM_AGENT_PROVIDER_RETRY_MAX'),
    providerRetryBaseMs: positiveInteger('OM_AGENT_PROVIDER_RETRY_BASE_MS'),
  }
}

export function isClientTriageEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return resolveClientTriageConfiguration(environment).mode !== 'disabled'
}
