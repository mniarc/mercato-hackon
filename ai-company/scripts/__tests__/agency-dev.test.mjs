import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import {
  agencyEnvironment, agencyJourneyPreset, assertLiveJourneyEnvironment, assertUnpaidDemoEnvironment, parseAgencyInvocation,
  agencyManualEnvironment, agencyManualProfile,
} from '../agency-dev.mjs'

test('manual profiles isolate persistent state and keep fixture intelligence local', () => {
  const fixture = agencyManualEnvironment({}, { AGENCY_MANUAL_TENANT_ID: 'tenant', AGENCY_MANUAL_ORGANIZATION_ID: 'org' }, 'fixture')
  const live = agencyManualEnvironment({}, {}, 'live', { action: 'setup' })
  const dev = agencyEnvironment({})
  assert.equal(fixture.BASE_URL, 'http://localhost:5004')
  assert.equal(live.BASE_URL, 'http://localhost:5006')
  assert.equal(fixture.OPENROUTER_BASE_URL, 'http://127.0.0.1:5005/v1')
  assert.equal(fixture.OPENROUTER_API_KEY, 'agency-triage-fixture-only')
  assert.equal(fixture.AUTO_SPAWN_WORKERS, 'false')
  assert.equal(fixture.OM_EVENTS_EXTERNAL_WORKER, 'true')
  for (const key of ['DATABASE_URL', 'QUEUE_BASE_DIR', 'CACHE_SQLITE_PATH', 'ATTACHMENTS_PARTITION_PRIVATE_ATTACHMENTS_ROOT', 'OM_TEST_EMAIL_CAPTURE_PATH']) {
    assert.equal(new Set([dev[key], fixture[key], live[key]]).size, 3, key)
  }
  assert.notEqual(fixture.OM_NEXT_DIST_DIR, live.OM_NEXT_DIST_DIR)
  assert.equal(fixture.OM_INTEGRATION_EXACT_SPEC, undefined)
  assert.equal(live.AGENCY_TEST_NATIVE_TRIAGE, undefined)
  assert.throws(() => agencyManualEnvironment({}, {}, 'fixture'), /requires AGENCY_MANUAL_TENANT_ID/)
  assert.throws(() => agencyManualProfile('unknown'), /must be fixture or live/)
})

test('manual live start and CLI require human opt-in and central private configuration', () => {
  const privateSettings = { OM_AI_PROVIDER: 'openrouter', OM_AI_MODEL: 'openrouter/example/model', OPENROUTER_API_KEY: 'private-test-only',
    OM_AGENT_RUN_TIMEOUT_MS: '60000', OM_AGENT_PROVIDER_RETRY_MAX: '1', OM_AGENT_PROVIDER_RETRY_BASE_MS: '1000' }
  assert.throws(() => agencyManualEnvironment({}, privateSettings, 'live'), /--allow-live/)
  assert.throws(() => agencyManualEnvironment({}, {}, 'live', { allowLive: true }), /private central OpenRouter/)
  const env = agencyManualEnvironment({}, privateSettings, 'live', { allowLive: true })
  assert.equal(env.OM_AI_MODEL, privateSettings.OM_AI_MODEL)
  assert.equal(env.OM_AGENCY_TRIAGE_MODE, 'live')
  assert.throws(() => agencyManualEnvironment({}, { ...privateSettings, OPENROUTER_BASE_URL: 'http://127.0.0.1:5005/v1' }, 'live', { allowLive: true }), /loopback/)
  assert.throws(() => agencyManualEnvironment({}, { ...privateSettings, OM_AI_AGENCY_RESEARCH_MODEL: 'openrouter/agency-triage-fixture' }, 'live', { allowLive: true }), /stale fixture/)
  assert.deepEqual(parseAgencyInvocation(['cli', '--profile', 'fixture', 'agency_operations', 'configure-triage']), {
    action: 'cli', flags: ['agency_operations', 'configure-triage'], journey: null, profile: 'fixture', allowLive: false,
  })
  assert.equal(parseAgencyInvocation(['start', '--profile', 'live', '--allow-live']).allowLive, true)
  assert.throws(() => parseAgencyInvocation(['test', '--profile', 'fixture']), /cannot select an automated/)
  assert.throws(() => parseAgencyInvocation(['start', '--profile', 'fixture', '--journey', 'production']), /cannot select an automated/)
  assert.throws(() => parseAgencyInvocation(['cli', '--profile', 'fixture', '--allow-live', 'help']), /requires the live/)
})

test('explicit journey arguments route start and test without changing the default', () => {
  assert.deepEqual(parseAgencyInvocation([]), { action: 'start', flags: [], journey: null })
  assert.deepEqual(parseAgencyInvocation(['start', '--journey=production']), { action: 'start', flags: [], journey: 'production' })
  assert.deepEqual(parseAgencyInvocation(['test', '--headed', '--journey', 'purchase']), {
    action: 'test', flags: ['--headed'], journey: 'purchase',
  })
  assert.deepEqual(parseAgencyInvocation(['test', '--journey', 'production', '--intelligence', 'fixture']), {
    action: 'test', flags: [], journey: 'production', intelligence: 'fixture', allowLive: false,
  })
  assert.deepEqual(parseAgencyInvocation(['start', '--journey=production', '--intelligence=live', '--allow-live']), {
    action: 'start', flags: [], journey: 'production', intelligence: 'live', allowLive: true,
  })
  assert.deepEqual(parseAgencyInvocation(['cli', 'example', 'run', '--journey', 'internal']), {
    action: 'cli', flags: ['example', 'run', '--journey', 'internal'], journey: null,
  })
  assert.throws(() => parseAgencyInvocation(['status', '--journey', 'canonical']), /available only for start and test/)
  assert.throws(() => parseAgencyInvocation(['test', '--journey', 'canonical', '--journey', 'production']), /selected more than once/)
  assert.throws(() => parseAgencyInvocation(['test', '--journey', 'unknown']), /must be canonical, production or purchase/)
  assert.throws(() => parseAgencyInvocation(['test', '--journey', 'production', '--intelligence', 'live']), /requires --allow-live/)
  assert.throws(() => parseAgencyInvocation(['test', '--journey', 'canonical', '--intelligence', 'fixture']), /only for the production/)
  assert.throws(() => parseAgencyInvocation(['start', '--journey', 'production', '--intelligence', 'fixture', '--allow-live']), /requires --journey production --intelligence live/)
  assert.deepEqual(agencyJourneyPreset('canonical'), { AGENCY_TEST_JOURNEY: 'canonical' })
  assert.deepEqual(agencyJourneyPreset('purchase'), {
    AGENCY_TEST_JOURNEY: 'purchase',
    OM_AGENCY_DEMO_PURCHASE_ENABLED: '1',
  })
})

test('explicit production preset keeps app and runner on the complete local-only journey', () => {
  const preset = agencyJourneyPreset('production')
  const env = agencyEnvironment({ ...preset }, preset)
  assert.equal(preset.AGENCY_TEST_NATIVE_TRIAGE, '1')
  assert.equal(preset.AGENCY_TEST_NATIVE_POST, '1')
  assert.equal(preset.AGENCY_JOURNEY_INTELLIGENCE, 'fixture')
  assert.equal(preset.OM_AGENCY_DEMO_PURCHASE_ENABLED, '1')
  assert.ok(path.isAbsolute(preset.AGENCY_TEST_RESEARCH_FIXTURE_DIR))
  assert.equal(env.AGENCY_TEST_NATIVE_POST, '1')
  assert.equal(env.AGENCY_JOURNEY_INTELLIGENCE, 'fixture')
  assert.equal(env.AGENCY_TOV_EXECUTION_ENABLED, 'true')
  assert.equal(env.OM_AI_AGENCY_TOV_PROVIDER, 'openrouter')
  assert.equal(env.OM_AI_AGENCY_TOV_MODEL, 'openrouter/agency-triage-fixture')
  assert.equal(env.OM_AI_AGENCY_TOV_BASE_URL, 'http://127.0.0.1:5003/v1')
  assert.equal(env.OPENROUTER_BASE_URL, 'http://127.0.0.1:5003/v1')
  assert.equal(env.OPENROUTER_API_KEY, 'agency-triage-fixture-only')
  assert.doesNotThrow(() => assertUnpaidDemoEnvironment(env))
})

test('journey presets reject conflicting non-secret settings instead of silently mixing modes', () => {
  assert.throws(
    () => agencyJourneyPreset('production', { AGENCY_TEST_JOURNEY: 'canonical' }),
    /AGENCY_TEST_JOURNEY=canonical; required AGENCY_TEST_JOURNEY=production/,
  )
  assert.throws(
    () => agencyJourneyPreset('production', { AGENCY_TEST_NATIVE_POST: '0' }),
    /AGENCY_TEST_NATIVE_POST=0; required AGENCY_TEST_NATIVE_POST=1/,
  )
  assert.throws(
    () => agencyJourneyPreset('purchase', { OM_AGENCY_DEMO_PURCHASE_ENABLED: 'false' }),
    /OM_AGENCY_DEMO_PURCHASE_ENABLED=false; required OM_AGENCY_DEMO_PURCHASE_ENABLED=1/,
  )
})

test('journey selection reuses the same runner and keeps demo purchasing explicit', () => {
  assert.match(agencyEnvironment({}).OM_INTEGRATION_EXACT_SPEC, /TC-AGENCY-001-/)
  const purchase = agencyEnvironment({}, { AGENCY_TEST_JOURNEY: 'purchase', OM_AGENCY_DEMO_PURCHASE_ENABLED: '1' })
  assert.match(purchase.OM_INTEGRATION_EXACT_SPEC, /TC-AGENCY-003-/)
  assert.equal(purchase.OM_AGENCY_DEMO_PURCHASE_ENABLED, '1')
  assert.equal(agencyEnvironment({}).OM_AGENCY_DEMO_PURCHASE_ENABLED, 'false')
  assert.throws(() => agencyEnvironment({}, { AGENCY_TEST_JOURNEY: '../other' }), /AGENCY_TEST_JOURNEY/)
})

test('app and fixtures share isolated persistent DB, queue, cache, attachments and secrets', () => {
  const inherited = { DATABASE_URL: 'postgres://shared/team', JWT_SECRET: 'different', QUEUE_BASE_DIR: 'shared-queue' }
  const app = agencyEnvironment(inherited)
  const fixture = agencyEnvironment({})
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'TENANT_DATA_ENCRYPTION_FALLBACK_KEY', 'CACHE_SQLITE_PATH',
    'QUEUE_BASE_DIR', 'ATTACHMENTS_PARTITION_PRIVATE_ATTACHMENTS_ROOT', 'BASE_URL']) {
    assert.equal(app[key], fixture[key], key)
  }
  assert.equal(new URL(app.DATABASE_URL).pathname, '/agency_dev')
  assert.equal(new URL(app.DATABASE_URL).hostname, '127.0.0.1')
  assert.ok(path.isAbsolute(app.QUEUE_BASE_DIR))
  assert.ok(path.isAbsolute(app.CACHE_SQLITE_PATH))
  assert.equal(app.NODE_ENV, 'development')
  assert.equal(new URL(app.BASE_URL).hostname, 'localhost')
})

test('port overrides select the same app and database without changing dev credentials', () => {
  const env = agencyEnvironment({}, { AGENCY_APP_PORT: '5007', AGENCY_DB_PORT: '5547' })
  assert.equal(env.BASE_URL, 'http://localhost:5007')
  assert.equal(new URL(env.DATABASE_URL).port, '5547')
  assert.throws(() => agencyEnvironment({}, { AGENCY_DB_PORT: 'shared' }), /Invalid agency development port/)
})

test('native triage proof overrides live provider credentials with the loopback fixture for app and runner', () => {
  const env = agencyEnvironment({ OPENROUTER_API_KEY: 'live-key', OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1', AGENCY_OPERATIONS_AI_BASE_URL: 'https://example.com/live' }, { AGENCY_TEST_NATIVE_TRIAGE: '1' })
  assert.equal(env.OPENROUTER_API_KEY, 'agency-triage-fixture-only')
  assert.equal(env.OPENROUTER_BASE_URL, 'http://127.0.0.1:5003/v1')
  assert.equal(env.AGENCY_OPERATIONS_AI_BASE_URL, 'http://127.0.0.1:5003/v1')
  assert.equal(env.OM_AI_MODEL, 'openrouter/agency-triage-fixture')
  assert.equal(env.OM_AI_AVAILABLE_PROVIDERS, 'openrouter')
  assert.equal(env.OM_AI_AVAILABLE_MODELS_OPENROUTER, 'agency-triage-fixture')
  assert.equal(env.OM_AGENCY_TRIAGE_ENABLED, 'true')
  assert.equal(env.OM_AGENCY_TRIAGE_MODE, 'fixture')
  assert.equal(env.OM_ENABLE_ENTERPRISE_MODULES_AGENTS, 'true')
  assert.equal(env.AUTO_SPAWN_WORKERS, 'false')
  assert.equal(env.NODE_ENV, 'development')
  assert.equal(env.AGENCY_TOV_EXECUTION_ENABLED, 'false')
  assert.equal(agencyEnvironment({}).OM_AGENCY_TRIAGE_ENABLED, undefined)
  assert.equal(agencyEnvironment({}).OM_AGENCY_TRIAGE_MODE, 'disabled')
  assert.equal(agencyEnvironment({}).AUTO_SPAWN_WORKERS, 'lazy')
})

test('routine demo rejects live activation but allows explicit local intelligence fixtures', () => {
  assert.throws(() => assertUnpaidDemoEnvironment(agencyEnvironment({ OM_AGENCY_TRIAGE_MODE: 'live' })), /cannot use live execution/)
  assert.throws(() => assertUnpaidDemoEnvironment(agencyEnvironment({ AGENCY_ANALYSIS_EXECUTION_ENABLED: 'true' })), /cannot use live execution/)
  assert.throws(() => assertUnpaidDemoEnvironment(agencyEnvironment({ AGENCY_TOV_EXECUTION_ENABLED: '1' })), /cannot use live execution/)
  assert.doesNotThrow(() => assertUnpaidDemoEnvironment(agencyEnvironment({})))
  assert.doesNotThrow(() => assertUnpaidDemoEnvironment(agencyEnvironment({ OM_AGENCY_TRIAGE_MODE: 'live' }, { AGENCY_TEST_NATIVE_TRIAGE: '1' })))
  assert.equal(agencyEnvironment({}, { OM_AGENCY_TRIAGE_MODE: 'live' }).OM_AGENCY_TRIAGE_MODE, 'live')
})

test('native post execution is allowed only with the explicit pinned loopback fixture', () => {
  const env = agencyEnvironment({ AGENCY_RESEARCH_AI_BASE_URL: 'https://example.com/live', OM_AI_AGENCY_RESEARCH_MODEL: 'live/model' },
    { AGENCY_TEST_NATIVE_TRIAGE: '1', AGENCY_TEST_NATIVE_POST: '1' })
  assert.equal(env.AGENCY_ANALYSIS_EXECUTION_ENABLED, 'true')
  assert.equal(env.AGENCY_TOV_EXECUTION_ENABLED, 'false')
  assert.equal(env.AGENCY_RESEARCH_AI_BASE_URL, 'http://127.0.0.1:5003/v1')
  assert.equal(env.OM_AI_AGENCY_RESEARCH_MODEL, 'openrouter/agency-triage-fixture')
  assert.doesNotThrow(() => assertUnpaidDemoEnvironment(env))
  for (const changed of [{ AGENCY_TEST_NATIVE_POST: '0' }, { AGENCY_RESEARCH_AI_BASE_URL: 'https://example.com/live' }, { OPENROUTER_API_KEY: 'not-the-fixture-key' }]) {
    assert.throws(() => assertUnpaidDemoEnvironment({ ...env, ...changed }), /cannot use live execution/)
  }
})

test('production journey requires explicit native and source fixtures and uses the same unpaid runner', () => {
  const fixtureDirectory = path.resolve('apps/mercato/src/modules/agency_research/__fixtures__/flow')
  const shared = { AGENCY_TEST_RESEARCH_FIXTURE_DIR: fixtureDirectory }
  const flags = { AGENCY_TEST_JOURNEY: 'production', AGENCY_TEST_NATIVE_TRIAGE: '1' }
  const env = agencyEnvironment(shared, flags)
  assert.match(env.OM_INTEGRATION_EXACT_SPEC, /TC-AGENCY-002-brief-to-plan\.spec\.ts$/)
  assert.equal(env.AGENCY_TEST_RESEARCH_FIXTURE_DIR, fixtureDirectory)
  assert.equal(env.AGENCY_ANALYSIS_EXECUTION_ENABLED, 'true')
  assert.equal(env.AGENCY_TOV_EXECUTION_ENABLED, 'true')
  assert.equal(env.AGENCY_TEST_NATIVE_POST, '0')
  assert.equal(env.AUTO_SPAWN_WORKERS, 'false')
  assert.doesNotThrow(() => assertUnpaidDemoEnvironment(env))
  assert.throws(() => agencyEnvironment(shared, { AGENCY_TEST_JOURNEY: 'production' }), /requires AGENCY_TEST_NATIVE_TRIAGE/)
  assert.throws(() => agencyEnvironment({}, flags), /absolute AGENCY_TEST_RESEARCH_FIXTURE_DIR/)
  assert.throws(() => agencyEnvironment({ AGENCY_TEST_RESEARCH_FIXTURE_DIR: 'relative/fixtures' }, flags), /absolute AGENCY_TEST_RESEARCH_FIXTURE_DIR/)
  for (const changed of [{ AGENCY_TEST_NATIVE_TRIAGE: '0' }, { AGENCY_TEST_RESEARCH_FIXTURE_DIR: '' }, { OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1' }]) {
    assert.throws(() => assertUnpaidDemoEnvironment({ ...env, ...changed }), /cannot use live execution/)
  }
})

test('live production journey requires explicit opt-in, private central provider, bounds and input files', () => {
  const fixtureDirectory = path.resolve('apps/mercato/src/modules/agency_research/__fixtures__/flow')
  const inputFile = path.resolve('package.json')
  const preset = agencyJourneyPreset('production', {}, 'live', true)
  assert.equal(preset.AGENCY_JOURNEY_INTELLIGENCE, 'live')
  assert.equal(preset.AGENCY_ALLOW_LIVE, '1')
  assert.equal(preset.AGENCY_TEST_NATIVE_TRIAGE, undefined)
  assert.throws(() => agencyJourneyPreset('production', {}, 'live'), /Pass --allow-live/)
  assert.throws(() => agencyJourneyPreset('production', { AGENCY_TEST_NATIVE_POST: '1' }, 'live', true), /refuses AGENCY_TEST_NATIVE/)

  const shared = {
    ...preset,
    AGENCY_TEST_RESEARCH_FIXTURE_DIR: fixtureDirectory,
    OM_AI_PROVIDER: 'openrouter',
    OM_AI_MODEL: 'openrouter/example/private-model',
    OPENROUTER_API_KEY: 'private-test-key',
    OM_AGENT_RUN_TIMEOUT_MS: '60000',
    OM_AGENT_PROVIDER_RETRY_MAX: '1',
    OM_AGENT_PROVIDER_RETRY_BASE_MS: '1000',
    AGENCY_JOURNEY_POLICY_FILE: inputFile,
    AGENCY_JOURNEY_CLIENT_INPUT_FILE: inputFile,
  }
  const env = agencyEnvironment(shared, preset)
  assert.equal(env.OM_AGENCY_TRIAGE_MODE, 'live')
  assert.equal(env.AGENCY_ANALYSIS_EXECUTION_ENABLED, 'true')
  assert.equal(env.AGENCY_TOV_EXECUTION_ENABLED, 'true')
  assert.equal(env.AUTO_SPAWN_WORKERS, 'false')
  assert.doesNotThrow(() => assertLiveJourneyEnvironment(env))
  assert.throws(() => assertLiveJourneyEnvironment({ ...env, AGENCY_ALLOW_LIVE: '0' }), /requires explicit/)
  assert.throws(() => assertLiveJourneyEnvironment({ ...env, AGENCY_TEST_NATIVE_TRIAGE: '1' }), /refuses fixture-native/)
  assert.throws(() => assertLiveJourneyEnvironment({ ...env, OPENROUTER_BASE_URL: 'https://gateway.example.test/v1' }), /refuses custom provider endpoint/)
  assert.throws(() => assertLiveJourneyEnvironment({ ...env, AGENCY_JOURNEY_POLICY_FILE: fixtureDirectory }), /existing absolute file/)
})
