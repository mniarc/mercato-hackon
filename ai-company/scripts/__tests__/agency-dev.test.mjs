import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { agencyEnvironment, assertUnpaidDemoEnvironment } from '../agency-dev.mjs'

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
