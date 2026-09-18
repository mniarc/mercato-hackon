import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.join(root, 'apps', 'mercato')
const runtime = path.join(app, '.mercato', 'agency-dev')
const spec = 'apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-001-vertical-slice.spec.ts'
const composeProject = `agency-dev-${createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 8)}`

function port(value, fallback) {
  const parsed = Number(value || fallback)
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new Error('Invalid agency development port')
  return parsed
}

export function agencyEnvironment(sharedEnvironment, overrides = {}) {
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
    AUTO_SPAWN_WORKERS: 'lazy',
    AUTO_SPAWN_SCHEDULER: 'false',
    DEMO_MODE: 'false',
    OM_INTEGRATION_EXACT_SPEC: spec,
    OM_INTEGRATION_MODULES: 'agency_operations',
  }
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

async function assertPortFree(appPort) {
  await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error(`Port ${appPort} is busy. Use the running agency app, or choose AGENCY_APP_PORT.`)))
    server.listen(appPort, '127.0.0.1', () => server.close(resolve))
  })
}

async function main() {
  const [action = 'start', ...flags] = process.argv.slice(2)
  if (!['start', 'setup', 'migrate', 'status', 'test'].includes(action)
    || flags.some((flag) => !['--headed', '--list'].includes(flag))) {
    throw new Error('Use start | setup | migrate | status | test [--headed] [--list]')
  }
  const cliBuild = path.join(root, 'packages', 'cli', 'dist', 'lib', 'testing', 'integration.js')
  if (!existsSync(cliBuild)) throw new Error('Prepare this checkout once: yarn build:packages && yarn generate && yarn build:packages')
  const { buildReusableEnvironment } = await import(pathToFileURL(cliBuild).href)
  if (typeof buildReusableEnvironment !== 'function') {
    throw new Error('Refresh the CLI after pulling this launcher: yarn workspace @open-mercato/cli build')
  }
  const shared = buildReusableEnvironment('http://localhost:5002', 'postgres://unused/unused', path.join(runtime, 'queue'), false)
  const env = agencyEnvironment(shared, process.env)
  const cli = (...args) => run(process.execPath, [path.join(app, 'scripts', 'mercato-cli.mjs'), ...args], env, app)
  const compose = (...args) => run('docker', [
    'compose', '--project-directory', root, '--project-name', composeProject,
    '-f', path.join(root, '.ai', 'qa', 'agency-dev.compose.yml'), ...args,
  ], { ...env, AGENCY_DB_PORT: String(port(process.env.AGENCY_DB_PORT, 5544)) })

  if (action === 'status') {
    console.log(`App: ${env.BASE_URL}\nDatabase: 127.0.0.1:${port(process.env.AGENCY_DB_PORT, 5544)}/agency_dev\nDocker project: ${composeProject}\nData survives app/terminal shutdown.`)
    await withDatabase(env, async (client) => {
      const result = await client.query("SELECT to_regclass('public.users') AS users")
      console.log(`Database reachable; schema ${result.rows[0].users ? 'present' : 'not initialized'}.`)
    })
    return
  }

  if (action === 'test') {
    if (!flags.includes('--list')) {
      const response = await fetch(`${env.BASE_URL}/login`, { signal: AbortSignal.timeout(120000) })
      if (!response.ok) throw new Error('Agency dev app is not ready. Start yarn dev:agency first.')
    }
    await run(process.execPath, [path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'),
      'test', '--config', '.ai/qa/tests/playwright.config.ts', spec, '--retries=0', '--workers=1', ...flags], env)
    return
  }

  mkdirSync(runtime, { recursive: true })
  if (action === 'start') await assertPortFree(Number(env.PORT))
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
  console.log(`[agency-dev] Starting Open Mercato HMR at ${env.BASE_URL}. Ctrl+C stops the app; PostgreSQL and data remain.`)
  await cli('server', 'dev')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[agency-dev] ${error.message}`); process.exitCode = 1 })
}
