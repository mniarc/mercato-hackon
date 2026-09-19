import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.join(root, 'apps', 'mercato')
const runtime = path.join(app, '.mercato', 'agency-dev')
const journeySpecs = {
  canonical: 'TC-AGENCY-001-vertical-slice.spec.ts',
  production: 'TC-AGENCY-002-brief-to-plan.spec.ts',
  purchase: 'TC-AGENCY-003-demo-purchase.spec.ts',
}
const productionFixtureDirectory = path.join(app, 'src', 'modules', 'agency_research', '__fixtures__', 'flow')
const usage = 'Use start [--journey canonical|production|purchase] [--intelligence fixture|live] [--allow-live] [--profile fixture|live] | setup|migrate|status [--profile fixture|live] | test [--journey canonical|production|purchase] [--intelligence fixture|live] [--allow-live] [--headed] [--list] | cli [--profile fixture|live] [--allow-live] <mercato arguments>'

export function agencyManualProfile(profile) {
  if (!['fixture', 'live'].includes(profile)) throw new Error('Manual profile must be fixture or live')
  return { profile, runtimeName: `agency-manual-${profile}`, appPort: profile === 'fixture' ? 5004 : 5006,
    dbPort: profile === 'fixture' ? 5545 : 5546, dbName: `agency_manual_${profile}`,
    ...(profile === 'fixture' ? { providerPort: 5005 } : {}) }
}

export function agencyJourneySpec(journey = 'canonical') {
  if (!Object.hasOwn(journeySpecs, journey)) throw new Error('AGENCY_TEST_JOURNEY must be canonical, production or purchase')
  return `apps/mercato/src/modules/agency_operations/__integration__/${journeySpecs[journey]}`
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function assertPresetValue(existing, key, expected, equivalent = (value) => value === expected) {
  const actual = nonEmpty(existing[key])
  if (actual && !equivalent(actual)) {
    throw new Error(`--journey conflicts with ${key}=${actual}; required ${key}=${expected}`)
  }
}

export function agencyJourneyPreset(journey, existing = {}, intelligence = 'fixture', allowLive = false) {
  agencyJourneySpec(journey)
  assertPresetValue(existing, 'AGENCY_TEST_JOURNEY', journey)
  if (journey === 'canonical') return { AGENCY_TEST_JOURNEY: journey }
  assertPresetValue(existing, 'OM_AGENCY_DEMO_PURCHASE_ENABLED', '1', (value) => /^(1|true)$/i.test(value))
  if (journey === 'purchase') {
    return { AGENCY_TEST_JOURNEY: journey, OM_AGENCY_DEMO_PURCHASE_ENABLED: '1' }
  }
  if (!['fixture', 'live'].includes(intelligence)) throw new Error('Journey intelligence must be fixture or live')
  assertPresetValue(existing, 'AGENCY_JOURNEY_INTELLIGENCE', intelligence)
  if (intelligence === 'live') {
    if (!allowLive) throw new Error('Live journey intelligence can incur OpenRouter charges. Pass --allow-live explicitly.')
    if (nonEmpty(existing.AGENCY_TEST_NATIVE_TRIAGE) || nonEmpty(existing.AGENCY_TEST_NATIVE_POST)) {
      throw new Error('Live journey intelligence refuses AGENCY_TEST_NATIVE_TRIAGE/POST fixture flags')
    }
    return {
      AGENCY_TEST_JOURNEY: journey,
      AGENCY_JOURNEY_INTELLIGENCE: 'live',
      AGENCY_ALLOW_LIVE: '1',
      AGENCY_TEST_RESEARCH_FIXTURE_DIR: productionFixtureDirectory,
      OM_AGENCY_DEMO_PURCHASE_ENABLED: '1',
    }
  }
  assertPresetValue(existing, 'AGENCY_TEST_NATIVE_TRIAGE', '1')
  assertPresetValue(existing, 'AGENCY_TEST_NATIVE_POST', '1')
  assertPresetValue(existing, 'AGENCY_TEST_RESEARCH_FIXTURE_DIR', productionFixtureDirectory,
    (value) => path.resolve(value) === productionFixtureDirectory)
  return {
    AGENCY_TEST_JOURNEY: journey,
    AGENCY_JOURNEY_INTELLIGENCE: 'fixture',
    AGENCY_TEST_NATIVE_TRIAGE: '1',
    AGENCY_TEST_NATIVE_POST: '1',
    AGENCY_TEST_RESEARCH_FIXTURE_DIR: productionFixtureDirectory,
    OM_AGENCY_DEMO_PURCHASE_ENABLED: '1',
  }
}

export function parseAgencyInvocation(argv) {
  const [action = 'start', ...rawFlags] = argv
  if (!['start', 'setup', 'migrate', 'status', 'test', 'cli'].includes(action)) throw new Error(usage)
  if (action === 'cli') {
    if (!rawFlags.length) throw new Error(usage)
    if (rawFlags[0] === '--profile') {
      const profile = rawFlags[1]
      agencyManualProfile(profile)
      const allowLive = rawFlags[2] === '--allow-live'
      if (allowLive && profile !== 'live') throw new Error('--allow-live requires the live manual profile')
      const flags = rawFlags.slice(allowLive ? 3 : 2)
      if (!flags.length) throw new Error(usage)
      return { action, flags, journey: null, profile, allowLive }
    }
    return { action, flags: rawFlags, journey: null }
  }
  const flags = []
  let journey = null
  let profile = null
  let intelligence = null
  let allowLive = false
  for (let index = 0; index < rawFlags.length; index++) {
    const token = rawFlags[index]
    if (token === '--profile' || token.startsWith('--profile=')) {
      if (profile) throw new Error('Manual profile was selected more than once')
      profile = token === '--profile' ? rawFlags[++index] : token.slice('--profile='.length)
      agencyManualProfile(profile)
    } else if (token === '--allow-live') {
      allowLive = true
    } else if (token === '--intelligence' || token.startsWith('--intelligence=')) {
      if (intelligence) throw new Error('Journey intelligence was selected more than once')
      intelligence = token === '--intelligence' ? rawFlags[++index] : token.slice('--intelligence='.length)
      if (!['fixture', 'live'].includes(intelligence)) throw new Error('Journey intelligence must be fixture or live')
    } else if (token === '--journey' || token.startsWith('--journey=')) {
      if (journey) throw new Error(`Journey was selected more than once: ${journey} and ${token === '--journey' ? rawFlags[index + 1] ?? '(missing)' : token.slice('--journey='.length)}`)
      journey = token === '--journey' ? rawFlags[++index] ?? '' : token.slice('--journey='.length)
      agencyJourneySpec(journey)
    } else {
      flags.push(token)
    }
  }
  if (profile && (journey || intelligence || action === 'test')) throw new Error('Manual profiles cannot select an automated test journey')
  if (intelligence && (journey !== 'production' || !['start', 'test'].includes(action))) {
    throw new Error('--intelligence is available only for the production start/test journey')
  }
  if (allowLive && profile) {
    if (profile !== 'live' || action !== 'start') throw new Error('--allow-live is only for explicitly starting a live manual profile')
  } else if (allowLive && (intelligence !== 'live' || journey !== 'production' || !['start', 'test'].includes(action))) {
    throw new Error('--allow-live requires --journey production --intelligence live')
  }
  if (intelligence === 'live' && !allowLive) throw new Error('Live journey intelligence requires --allow-live')
  if (journey && !['start', 'test'].includes(action)) throw new Error(`--journey is available only for start and test. ${usage}`)
  if (action === 'test') {
    if (flags.some((flag) => !['--headed', '--list'].includes(flag))) throw new Error(usage)
  } else if (flags.length) {
    throw new Error(usage)
  }
  return { action, flags, journey, ...(profile ? { profile, allowLive } : {}), ...(intelligence ? { intelligence, allowLive } : {}) }
}
const composeProject = `agency-dev-${createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 8)}`

function port(value, fallback) {
  const parsed = Number(value || fallback)
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new Error('Invalid agency development port')
  return parsed
}

export function agencyEnvironment(sharedEnvironment, overrides = {}) {
  const selectedSpec = agencyJourneySpec(overrides.AGENCY_TEST_JOURNEY)
  const productionJourney = overrides.AGENCY_TEST_JOURNEY === 'production'
  const journeyIntelligence = productionJourney ? overrides.AGENCY_JOURNEY_INTELLIGENCE ?? 'fixture' : null
  if (productionJourney && (!path.isAbsolute(sharedEnvironment.AGENCY_TEST_RESEARCH_FIXTURE_DIR ?? '')
    || (journeyIntelligence === 'fixture' && overrides.AGENCY_TEST_NATIVE_TRIAGE !== '1'))) {
    throw new Error('The production journey requires an absolute AGENCY_TEST_RESEARCH_FIXTURE_DIR and fixture intelligence requires AGENCY_TEST_NATIVE_TRIAGE=1')
  }
  const appPort = port(overrides.AGENCY_APP_PORT, 5002)
  const dbPort = port(overrides.AGENCY_DB_PORT, 5544)
  const baseUrl = `http://localhost:${appPort}`
  return {
    ...sharedEnvironment,
    NODE_ENV: 'development',
    DATABASE_URL: `postgres://agency_dev:agency_local_only@127.0.0.1:${dbPort}/agency_dev`,
    PORT: String(appPort),
    BASE_URL: baseUrl,
    APP_URL: baseUrl,
    NEXT_PUBLIC_APP_URL: baseUrl,
    PLATFORM_PORTAL_BASE_URL: baseUrl,
    OM_TEST_APP_ROOT: app,
    CACHE_STRATEGY: 'sqlite',
    CACHE_SQLITE_PATH: path.join(runtime, 'cache.sqlite'),
    QUEUE_STRATEGY: 'local',
    QUEUE_BASE_DIR: path.join(runtime, 'queue'),
    ATTACHMENTS_PARTITION_PRIVATE_ATTACHMENTS_ROOT: path.join(runtime, 'attachments'),
    OM_TEST_EMAIL_CAPTURE_PATH: path.join(runtime, 'email-capture.jsonl'),
    OM_TEST_SYSTEM_EMAIL_CAPTURE_PATH: path.join(runtime, 'system-email-capture.jsonl'),
    OM_TEST_EMAIL_CAPTURE_ACCESS_TOKEN: 'agency-local-capture',
    OM_TEST_EMAIL_CAPTURE_CORRELATION_TOKEN: 'agency-local-correlation',
    JWT_SECRET: 'agency-local-development-jwt-secret',
    TENANT_DATA_ENCRYPTION_FALLBACK_KEY: 'agency-local-development-encryption-key',
    OM_INIT_SUPERADMIN_EMAIL: 'superadmin@acme.com',
    OM_INIT_SUPERADMIN_PASSWORD: 'secret',
    OM_INIT_ADMIN_PASSWORD: 'secret',
    OM_INIT_EMPLOYEE_PASSWORD: 'secret',
    // The native server-dev supervisor gives spawned workers NODE_ENV=production.
    // Fixture journeys instead use their existing explicit development-mode drains;
    // do not race those drains with a production-mode consumer of fixture jobs.
    AUTO_SPAWN_WORKERS: productionJourney || overrides.AGENCY_TEST_NATIVE_TRIAGE === '1' ? 'false' : 'lazy',
    AUTO_SPAWN_SCHEDULER: 'false',
    DEMO_MODE: 'false',
    OM_INTEGRATION_EXACT_SPEC: selectedSpec,
    OM_INTEGRATION_MODULES: 'agency_operations',
    // Native-module development compilation includes page hydration and its first API call.
    OM_TEST_ACTION_TIMEOUT_MS: '60000',
    OM_TEST_NAVIGATION_TIMEOUT_MS: '120000',
    OM_AGENCY_TRIAGE_MODE: overrides.OM_AGENCY_TRIAGE_MODE ?? sharedEnvironment.OM_AGENCY_TRIAGE_MODE ?? 'disabled',
    OM_AGENCY_DEMO_PURCHASE_ENABLED: overrides.OM_AGENCY_DEMO_PURCHASE_ENABLED ?? sharedEnvironment.OM_AGENCY_DEMO_PURCHASE_ENABLED ?? 'false',
    ...(journeyIntelligence === 'live' ? {
      AGENCY_JOURNEY_INTELLIGENCE: 'live',
      AGENCY_ALLOW_LIVE: overrides.AGENCY_ALLOW_LIVE,
      OM_ENABLE_ENTERPRISE_MODULES: 'true',
      OM_ENABLE_ENTERPRISE_MODULES_AGENTS: 'true',
      OM_ENABLE_ENTERPRISE_MODULES_SSO: 'false',
      OM_ENABLE_ENTERPRISE_MODULES_SECURITY: 'false',
      OM_AGENCY_TRIAGE_ENABLED: 'true',
      OM_AGENCY_TRIAGE_MODE: 'live',
      AGENCY_ANALYSIS_EXECUTION_ENABLED: 'true',
      AGENCY_TOV_EXECUTION_ENABLED: 'true',
    } : overrides.AGENCY_TEST_NATIVE_TRIAGE === '1' ? {
      AGENCY_JOURNEY_INTELLIGENCE: productionJourney ? 'fixture' : sharedEnvironment.AGENCY_JOURNEY_INTELLIGENCE,
      AGENCY_TEST_NATIVE_TRIAGE: '1',
      AGENCY_TEST_NATIVE_POST: overrides.AGENCY_TEST_NATIVE_POST === '1' ? '1' : '0',
      OM_ENABLE_ENTERPRISE_MODULES: 'true',
      OM_ENABLE_ENTERPRISE_MODULES_AGENTS: 'true',
      OM_ENABLE_ENTERPRISE_MODULES_SSO: 'false',
      OM_ENABLE_ENTERPRISE_MODULES_SECURITY: 'false',
      OM_AGENCY_TRIAGE_ENABLED: 'true',
      OM_AGENCY_TRIAGE_MODE: 'fixture',
      AGENCY_TOV_EXECUTION_ENABLED: productionJourney ? 'true' : 'false',
      AGENCY_ANALYSIS_EXECUTION_ENABLED: productionJourney || overrides.AGENCY_TEST_NATIVE_POST === '1' ? 'true' : 'false',
      OM_AI_PROVIDER: 'openrouter',
      OM_AI_MODEL: 'openrouter/agency-triage-fixture',
      OM_AI_AVAILABLE_PROVIDERS: 'openrouter',
      OM_AI_AVAILABLE_MODELS_OPENROUTER: 'agency-triage-fixture',
      OM_AI_AGENCY_OPERATIONS_PROVIDER: 'openrouter',
      OM_AI_AGENCY_OPERATIONS_MODEL: 'openrouter/agency-triage-fixture',
      OM_AI_AGENCY_RESEARCH_PROVIDER: 'openrouter',
      OM_AI_AGENCY_RESEARCH_MODEL: 'openrouter/agency-triage-fixture',
      OM_AI_AGENCY_TOV_PROVIDER: 'openrouter',
      OM_AI_AGENCY_TOV_MODEL: 'openrouter/agency-triage-fixture',
      OM_AI_AGENCY_TOV_BASE_URL: 'http://127.0.0.1:5003/v1',
      AGENCY_RESEARCH_AI_PROVIDER: 'openrouter',
      AGENCY_RESEARCH_AI_MODEL: 'openrouter/agency-triage-fixture',
      AGENCY_RESEARCH_AI_BASE_URL: 'http://127.0.0.1:5003/v1',
      OM_AGENCY_RESEARCH_MODEL_EXTRACT: 'openrouter/agency-triage-fixture',
      OM_AGENCY_RESEARCH_MODEL_SYNTHESIS: 'openrouter/agency-triage-fixture',
      OM_AGENCY_RESEARCH_MODEL_QA: 'openrouter/agency-triage-fixture',
      OPENROUTER_API_KEY: 'agency-triage-fixture-only',
      OPENROUTER_BASE_URL: 'http://127.0.0.1:5003/v1',
      AGENCY_OPERATIONS_AI_BASE_URL: 'http://127.0.0.1:5003/v1',
    } : {}),
  }
}

export function assertUnpaidDemoEnvironment(env) {
  const productionFixture = env.OM_INTEGRATION_EXACT_SPEC === agencyJourneySpec('production')
    && path.isAbsolute(env.AGENCY_TEST_RESEARCH_FIXTURE_DIR ?? '')
  const nativeExecutionFixture = (env.AGENCY_TEST_NATIVE_POST === '1' || productionFixture) && env.AGENCY_TEST_NATIVE_TRIAGE === '1'
    && (!productionFixture || env.AGENCY_JOURNEY_INTELLIGENCE === 'fixture')
    && env.OM_AGENCY_TRIAGE_MODE === 'fixture'
    && env.OM_AI_PROVIDER === 'openrouter' && env.OM_AI_AVAILABLE_PROVIDERS === 'openrouter'
    && env.OM_AI_MODEL === 'openrouter/agency-triage-fixture'
    && env.OM_AI_AVAILABLE_MODELS_OPENROUTER === 'agency-triage-fixture'
    && env.OM_AI_AGENCY_RESEARCH_PROVIDER === 'openrouter'
    && env.OM_AI_AGENCY_RESEARCH_MODEL === 'openrouter/agency-triage-fixture'
    && env.OPENROUTER_API_KEY === 'agency-triage-fixture-only'
    && env.OPENROUTER_BASE_URL === 'http://127.0.0.1:5003/v1'
    && env.AGENCY_RESEARCH_AI_BASE_URL === 'http://127.0.0.1:5003/v1'
  const nativeTovFixture = productionFixture && nativeExecutionFixture
    && env.AGENCY_TOV_EXECUTION_ENABLED === 'true'
    && env.OM_AI_AGENCY_TOV_PROVIDER === 'openrouter'
    && env.OM_AI_AGENCY_TOV_MODEL === 'openrouter/agency-triage-fixture'
    && env.OM_AI_AGENCY_TOV_BASE_URL === 'http://127.0.0.1:5003/v1'
  if (env.OM_AGENCY_TRIAGE_MODE === 'live'
    || (/^(true|1)$/i.test(env.AGENCY_ANALYSIS_EXECUTION_ENABLED ?? '') && !nativeExecutionFixture)
    || (/^(true|1)$/i.test(env.AGENCY_TOV_EXECUTION_ENABLED ?? '') && !nativeTovFixture)) {
    throw new Error('Routine agency tests cannot use live execution. Start the app and runner with agency execution disabled, or use the local intelligence fixture.')
  }
}

export function assertLiveJourneyEnvironment(env) {
  if (env.AGENCY_JOURNEY_INTELLIGENCE !== 'live' || env.AGENCY_ALLOW_LIVE !== '1') {
    throw new Error('Live journey intelligence requires explicit --intelligence live --allow-live in both app and runner commands.')
  }
  if (env.AGENCY_TEST_NATIVE_TRIAGE === '1' || env.AGENCY_TEST_NATIVE_POST === '1') {
    throw new Error('Live journey intelligence refuses fixture-native flags.')
  }
  if (env.OM_AI_PROVIDER !== 'openrouter' || !env.OM_AI_MODEL?.startsWith('openrouter/')
    || env.OM_AI_MODEL.includes('fixture') || !nonEmpty(env.OPENROUTER_API_KEY)
    || env.OPENROUTER_API_KEY === 'agency-triage-fixture-only') {
    throw new Error('Live journey intelligence requires the private central OpenRouter provider, prefixed model and real API key.')
  }
  for (const key of ['OPENROUTER_BASE_URL', 'AGENCY_OPERATIONS_AI_BASE_URL', 'AGENCY_RESEARCH_AI_BASE_URL', 'OM_AI_AGENCY_TOV_BASE_URL']) {
    if (nonEmpty(env[key])) throw new Error(`Live journey intelligence refuses custom provider endpoint ${key}; use the private central provider.`)
  }
  for (const [key, value] of Object.entries(env)) {
    if ((key.startsWith('OM_AI_') || key.startsWith('OM_AGENCY_RESEARCH_MODEL_') || key === 'AGENCY_RESEARCH_AI_MODEL')
      && String(value).includes('agency-triage-fixture')) throw new Error(`Live journey intelligence refuses stale fixture selection in ${key}.`)
  }
  for (const key of ['OM_AGENT_RUN_TIMEOUT_MS', 'OM_AGENT_PROVIDER_RETRY_MAX', 'OM_AGENT_PROVIDER_RETRY_BASE_MS']) {
    if (!/^\d+$/.test(env[key] ?? '') || Number(env[key]) <= 0) throw new Error(`Live journey intelligence requires explicit ${key}.`)
  }
  for (const key of ['AGENCY_JOURNEY_POLICY_FILE', 'AGENCY_JOURNEY_CLIENT_INPUT_FILE']) {
    if (!path.isAbsolute(env[key] ?? '') || !existsSync(env[key]) || !statSync(env[key]).isFile()) {
      throw new Error(`Live journey intelligence requires an existing absolute file in ${key}.`)
    }
  }
}

export function agencyManualEnvironment(shared, existing, profile, { action = 'start', allowLive = false } = {}) {
  const selected = agencyManualProfile(profile)
  if (profile === 'live' && ['start', 'cli'].includes(action) && !allowLive) {
    throw new Error('Live manual execution can incur OpenRouter charges. Pass --allow-live explicitly; no paid calls are enabled by default.')
  }
  const settings = { ...shared, ...existing }
  const fixture = profile === 'fixture' ? agencyJourneyPreset('production') : {}
  const env = agencyEnvironment({ ...settings, ...fixture }, { ...settings, ...fixture,
    AGENCY_TEST_JOURNEY: profile === 'fixture' ? 'production' : 'canonical',
    AGENCY_TEST_NATIVE_TRIAGE: profile === 'fixture' ? '1' : '0',
    AGENCY_APP_PORT: selected.appPort, AGENCY_DB_PORT: selected.dbPort,
  })
  const profileRuntime = path.join(app, '.mercato', selected.runtimeName)
  Object.assign(env, {
    AGENCY_MANUAL_PROFILE: profile, AGENCY_MANUAL_RUNTIME_DIR: profileRuntime,
    AGENCY_DB_PORT: String(selected.dbPort), AGENCY_DB_NAME: selected.dbName,
    DATABASE_URL: `postgres://agency_dev:agency_local_only@127.0.0.1:${selected.dbPort}/${selected.dbName}`,
    CACHE_SQLITE_PATH: path.join(profileRuntime, 'cache.sqlite'), QUEUE_BASE_DIR: path.join(profileRuntime, 'queue'),
    ATTACHMENTS_PARTITION_PRIVATE_ATTACHMENTS_ROOT: path.join(profileRuntime, 'attachments'),
    OM_TEST_EMAIL_CAPTURE_PATH: path.join(profileRuntime, 'email-capture.jsonl'),
    OM_TEST_SYSTEM_EMAIL_CAPTURE_PATH: path.join(profileRuntime, 'system-email-capture.jsonl'),
    JWT_SECRET: `${selected.runtimeName}-local-jwt-secret`, TENANT_DATA_ENCRYPTION_FALLBACK_KEY: `${selected.runtimeName}-local-encryption-key`,
    OM_NEXT_DIST_DIR: `.mercato/next-${selected.runtimeName}`, OM_DEV_GENERATE_WATCH_MODE: 'legacy',
    AUTO_SPAWN_WORKERS: 'false', AUTO_SPAWN_SCHEDULER: 'false', OM_EVENTS_EXTERNAL_WORKER: 'true',
    OM_ENABLE_ENTERPRISE_MODULES: 'true', OM_ENABLE_ENTERPRISE_MODULES_AGENTS: 'true',
    OM_ENABLE_ENTERPRISE_MODULES_SSO: 'false', OM_ENABLE_ENTERPRISE_MODULES_SECURITY: 'false',
    OM_AGENCY_DEMO_PURCHASE_ENABLED: '1', AGENCY_ANALYSIS_EXECUTION_ENABLED: 'true', AGENCY_TOV_EXECUTION_ENABLED: 'false',
  })
  delete env.OM_INTEGRATION_EXACT_SPEC
  if (profile === 'fixture') {
    const endpoint = `http://127.0.0.1:${selected.providerPort}/v1`
    Object.assign(env, { AGENCY_MANUAL_PROVIDER_PORT: String(selected.providerPort), OPENROUTER_BASE_URL: endpoint,
      AGENCY_TOV_EXECUTION_ENABLED: 'true',
      OM_AI_AGENCY_OPERATIONS_BASE_URL: endpoint, OM_AI_AGENCY_RESEARCH_BASE_URL: endpoint,
      OM_AI_AGENCY_TOV_BASE_URL: endpoint,
      AGENCY_OPERATIONS_AI_BASE_URL: endpoint, AGENCY_RESEARCH_AI_BASE_URL: endpoint })
  } else {
    for (const key of Object.keys(env)) if (key.startsWith('AGENCY_TEST_')) delete env[key]
    env.OM_AGENCY_TRIAGE_MODE = 'live'
    env.OM_AGENCY_TRIAGE_ENABLED = 'true'
    if (['start', 'cli'].includes(action)) {
      if (env.OM_AI_PROVIDER !== 'openrouter' || !env.OM_AI_MODEL?.startsWith('openrouter/')
        || env.OM_AI_MODEL.includes('fixture') || !env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY === 'agency-triage-fixture-only') {
        throw new Error('Configure the private central OpenRouter provider, model and API key before live manual execution.')
      }
      for (const key of ['OPENROUTER_BASE_URL', 'AGENCY_OPERATIONS_AI_BASE_URL', 'AGENCY_RESEARCH_AI_BASE_URL']) {
        if (env[key] && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(env[key]).hostname)) {
          throw new Error(`Live manual profile refuses a loopback intelligence endpoint in ${key}. Clear stale fixture overrides.`)
        }
      }
      for (const [key, value] of Object.entries(env)) {
        if ((key.startsWith('OM_AI_') || key.startsWith('OM_AGENCY_RESEARCH_MODEL_') || key === 'AGENCY_RESEARCH_AI_MODEL')
          && String(value).includes('agency-triage-fixture')) throw new Error(`Live manual profile refuses a stale fixture selection in ${key}.`)
      }
      for (const key of ['OM_AGENT_RUN_TIMEOUT_MS', 'OM_AGENT_PROVIDER_RETRY_MAX', 'OM_AGENT_PROVIDER_RETRY_BASE_MS']) {
        if (!/^\d+$/.test(env[key] ?? '') || Number(env[key]) <= 0) throw new Error(`Live manual profile requires explicit ${key}.`)
      }
      env.AGENCY_TOV_EXECUTION_ENABLED = nonEmpty(settings.AGENCY_TOV_EXECUTION_ENABLED) ?? 'false'
    }
  }
  return env
}

function run(command, args, env, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 || signal === 'SIGINT'
      ? resolve()
      : reject(new Error(`${path.basename(command)} ${args[0]} exited ${code ?? signal}`)))
  })
}

async function withDatabase(env, operation) {
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 })
  await client.connect()
  try { return await operation(client) } finally { await client.end() }
}

async function manualScopeIdentities(client) {
  const { rows } = await client.query(`SELECT DISTINCT u.tenant_id, u.organization_id, o.slug AS organization_slug, u.id AS staff_user_id, r.name AS role
    FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
    JOIN organizations o ON o.id = u.organization_id AND o.tenant_id = u.tenant_id
    JOIN tenants t ON t.id = u.tenant_id
    WHERE u.deleted_at IS NULL AND ur.deleted_at IS NULL AND r.deleted_at IS NULL
      AND o.deleted_at IS NULL AND o.is_active = true AND t.deleted_at IS NULL AND t.is_active = true
      AND r.name IN ('admin', 'superadmin') AND u.tenant_id IS NOT NULL AND u.organization_id IS NOT NULL`)
  return rows
}

export function resolveManualScope(rows, settings = {}) {
  const tenantId = nonEmpty(settings.AGENCY_MANUAL_TENANT_ID)
  const organizationId = nonEmpty(settings.AGENCY_MANUAL_ORGANIZATION_ID)
  const selectionHelp = 'Run status --profile fixture (or live), then set both AGENCY_MANUAL_TENANT_ID and AGENCY_MANUAL_ORGANIZATION_ID to the intended scope.'
  if (Boolean(tenantId) !== Boolean(organizationId)) throw new Error(`Manual scope selection requires both IDs. ${selectionHelp}`)
  const scopes = [...new Map(rows.map((row) => [`${row.tenant_id}/${row.organization_id}`, {
    tenantId: row.tenant_id, organizationId: row.organization_id, organizationSlug: row.organization_slug,
  }])).values()]
  if (tenantId) {
    const selected = scopes.find((scope) => scope.tenantId === tenantId && scope.organizationId === organizationId)
    if (!selected) throw new Error(`Selected manual scope is unavailable in this profile's database. ${selectionHelp}`)
    return selected
  }
  if (scopes.length !== 1) throw new Error(`Manual profile has ${scopes.length} available scopes; no scope was selected. ${selectionHelp}`)
  return scopes[0]
}

export function manualEntryUrls(baseUrl, organizationSlug) {
  return {
    customer: organizationSlug ? `${baseUrl}/${encodeURIComponent(organizationSlug)}/portal/login` : null,
    staff: `${baseUrl}/login`,
    cases: `${baseUrl}/backend/agency-operations/cases`,
    inbox: `${baseUrl}/backend/work-inbox`,
  }
}

async function printManualScopes(client) {
  const rows = await manualScopeIdentities(client)
  console.log('Local configuration identities (choose the intended scope; no policy is configured automatically):')
  for (const row of rows) console.log(JSON.stringify(row))
}

async function assertPortFree(appPort) {
  await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error(`Port ${appPort} is busy. Use the running agency app, or choose AGENCY_APP_PORT.`)))
    server.listen(appPort, '127.0.0.1', () => server.close(resolve))
  })
}

async function startManualProcesses(env, terminateProcessTree) {
  const children = []
  let stop
  const finished = new Promise((resolve) => { stop = resolve })
  const interrupt = () => stop({ interrupted: true })
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  const launch = (label, args, ipc = false) => {
    const child = spawn(process.execPath, args, { cwd: app, env, windowsHide: true, detached: true,
      stdio: ipc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit' })
    children.push(child)
    child.once('error', (error) => stop({ label, error }))
    child.once('exit', (code, signal) => stop({ label, code, signal }))
    return child
  }
  try {
    if (env.AGENCY_MANUAL_PROFILE === 'fixture') {
      const companion = launch('fixture companion', [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        path.join(root, 'scripts', 'agency-manual-fixture.ts')], true)
      let timeout
      const ready = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Manual fixture companion did not become ready within 120 seconds')), 120000)
        companion.on('message', (message) => { if (message?.type === 'agency-manual-fixture-ready') resolve({ ready: true }) })
      })
      let result
      try { result = await Promise.race([ready, finished]) } finally { clearTimeout(timeout) }
      if (!result.ready) {
        if (result.interrupted) return
        throw result.error ?? new Error('Manual fixture companion stopped before becoming ready')
      }
    }
    const cliPath = path.join(app, 'scripts', 'mercato-cli.mjs')
    launch('native queue workers', [cliPath, 'queue', 'worker', '--all', '--concurrency=1'])
    launch('native development app', [cliPath, 'server', 'dev'])
    const result = await finished
    if (!result.interrupted) throw result.error ?? new Error(`${result.label} stopped (${result.code ?? result.signal}); all profile processes are stopping, data is retained.`)
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
    await Promise.all(children.map((child) => terminateProcessTree(child)))
  }
}

async function main() {
  const { action, flags, journey, profile, intelligence, allowLive } = parseAgencyInvocation(process.argv.slice(2))
  const selectedIntelligence = journey === 'production' ? intelligence ?? 'fixture' : null
  const journeyPreset = journey ? agencyJourneyPreset(journey, process.env, selectedIntelligence ?? 'fixture', allowLive) : {}
  const cliBuild = path.join(root, 'packages', 'cli', 'dist', 'lib', 'testing', 'integration.js')
  if (!existsSync(cliBuild)) throw new Error('Prepare this checkout once: yarn build:packages && yarn generate && yarn build:packages')
  const { buildReusableEnvironment, terminateProcessTree } = await import(pathToFileURL(cliBuild).href)
  if (typeof buildReusableEnvironment !== 'function') {
    throw new Error('Refresh the CLI after pulling this launcher: yarn workspace @open-mercato/cli build')
  }
  if (profile) {
    const { loadAppEnv } = await import(pathToFileURL(path.join(root, 'packages', 'cli', 'dist', 'lib', 'load-env.js')).href)
    await loadAppEnv({ cwd: app })
  }
  const shared = buildReusableEnvironment(
    'http://localhost:5002',
    'postgres://unused/unused',
    path.join(runtime, 'queue'),
    process.env.PW_CAPTURE_SCREENSHOTS === '1',
  )
  Object.assign(shared, journeyPreset)
  const env = profile ? agencyManualEnvironment(shared, process.env, profile, { action, allowLive })
    : agencyEnvironment(shared, { ...process.env, ...journeyPreset })
  if (selectedIntelligence === 'live') assertLiveJourneyEnvironment(env)
  const selectedRuntime = profile ? env.AGENCY_MANUAL_RUNTIME_DIR : runtime
  const selectedProject = profile ? `${composeProject}-manual-${profile}` : composeProject
  if (action === 'start' || action === 'test') {
    console.log(profile ? `[agency-dev] Manual ${profile}: ${env.BASE_URL}. ${profile === 'live' ? 'Explicit live model execution is enabled; OpenRouter charges may apply.' : 'Unpaid fixture intelligence; customer choices are never seeded.'}`
      : `[agency-dev] Journey ${env.AGENCY_TEST_JOURNEY ?? 'canonical'}: ${env.OM_INTEGRATION_EXACT_SPEC}`)
  }
  const cli = (...args) => run(process.execPath, [path.join(app, 'scripts', 'mercato-cli.mjs'), ...args], env, app)
  if (action === 'cli') {
    await cli(...flags)
    return
  }
  const compose = (...args) => run('docker', [
    'compose', '--project-directory', root, '--project-name', selectedProject,
    '-f', path.join(root, '.ai', 'qa', 'agency-dev.compose.yml'), ...args,
  ], { ...env, AGENCY_DB_PORT: profile ? env.AGENCY_DB_PORT : String(port(process.env.AGENCY_DB_PORT, 5544)) })

  if (action === 'status') {
    const database = new URL(env.DATABASE_URL)
    console.log(`App: ${env.BASE_URL}\nDatabase: ${database.hostname}:${database.port}${database.pathname}\nDocker project: ${selectedProject}\nRuntime: ${selectedRuntime}\nData survives app/terminal shutdown.`)
    await withDatabase(env, async (client) => {
      const result = await client.query("SELECT to_regclass('public.users') AS users")
      console.log(`Database reachable; schema ${result.rows[0].users ? 'present' : 'not initialized'}.`)
      if (profile && result.rows[0].users) await printManualScopes(client)
    })
    return
  }

  if (action === 'test') {
    if (selectedIntelligence !== 'live') assertUnpaidDemoEnvironment(env)
    if (!flags.includes('--list')) {
      const response = await fetch(`${env.BASE_URL}/login`, { signal: AbortSignal.timeout(120000) })
      if (!response.ok) throw new Error('Agency dev app is not ready. Start yarn dev:agency first.')
    }
    await run(process.execPath, [path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'),
      'test', '--config', '.ai/qa/tests/playwright.config.ts', env.OM_INTEGRATION_EXACT_SPEC, '--retries=0', '--workers=1', ...flags], env)
    return
  }

  mkdirSync(selectedRuntime, { recursive: true })
  if (action === 'start') await assertPortFree(Number(env.PORT))
  if (action === 'start' && profile === 'fixture') await assertPortFree(Number(env.AGENCY_MANUAL_PROVIDER_PORT))
  if (profile && !existsSync(path.join(app, '.mercato', 'generated', 'modules.generated.ts'))) {
    throw new Error('Prepare the shared Enterprise module registry once with the runtime owner before starting a manual profile; this launcher will not regenerate it beside another app.')
  }
  await compose('up', '-d', '--wait', 'postgres')
  if (!existsSync(path.join(app, '.mercato', 'generated', 'modules.generated.ts'))) await cli('generate')
  const tableCount = await withDatabase(env, async (client) => {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector')
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    const result = await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
    return result.rows[0].count
  })
  if (action === 'setup' || tableCount === 0) {
    console.log('[agency-dev] Initializing the owned database with Open Mercato. Existing data is never reset.')
    await cli('init', '--no-examples')
  } else if (action === 'migrate') {
    await cli('db', 'migrate')
  } else {
    console.log('[agency-dev] Reusing database; no initialization, migration, or production build.')
  }
  if (action !== 'start') return
  if (profile) {
    const scope = await withDatabase(env, async (client) => resolveManualScope(await manualScopeIdentities(client), env))
    Object.assign(env, { AGENCY_MANUAL_TENANT_ID: scope.tenantId, AGENCY_MANUAL_ORGANIZATION_ID: scope.organizationId })
    const urls = manualEntryUrls(env.BASE_URL, scope.organizationSlug)
    console.log(`[agency-dev] Manual scope: tenant ${scope.tenantId}, organization ${scope.organizationId}. No policy or approval is created.`)
    console.log(`Customer: ${urls.customer ?? 'Set an organization slug before opening its customer portal.'}\nStaff sign-in: ${urls.staff}\nAgency cases: ${urls.cases}\nEmployee inbox: ${urls.inbox}\nUse separate browser profiles; both perspectives share this app and database.`)
  }
  console.log(`[agency-dev] Starting Open Mercato HMR at ${env.BASE_URL}. Ctrl+C stops the app; PostgreSQL and data remain.`)
  if (profile) {
    if (typeof terminateProcessTree !== 'function') throw new Error('Refresh the native CLI package before using persistent manual profiles.')
    await startManualProcesses(env, terminateProcessTree)
  } else await cli('server', 'dev')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[agency-dev] ${error.message}`); process.exitCode = 1 })
}
