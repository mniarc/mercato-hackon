import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { agencyEnvironment } from '../agency-dev.mjs'

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
