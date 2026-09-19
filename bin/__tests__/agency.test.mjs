import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { parseAgencyArgs, planAgencyCommand, redactSecrets, validateRuntimeEnvironment } from '../agency.mjs'

const root = path.resolve('D:/server/agency-checkout')
const envFile = path.resolve('D:/server/runtime.env')
const runtimeEnv = {
  AGENCY_IMAGE: 'registry.example/agency:sha-123',
  APP_URL: 'https://agency.example.com',
  POSTGRES_PASSWORD: 'url_safe-password-123',
  JWT_SECRET: 'j'.repeat(32),
  AUTH_SECRET: 'a'.repeat(32),
  TENANT_DATA_ENCRYPTION_FALLBACK_KEY: 't'.repeat(32),
  OM_AGENCY_TRIAGE_MODE: 'disabled',
  AGENCY_ANALYSIS_EXECUTION_ENABLED: 'false',
}

const argsOf = (steps) => steps.map((step) => step.args)
const flattened = (steps) => steps.flatMap((step) => step.args)

test('argument parser preserves values as single argv entries and rejects ambiguous input', () => {
  const image = 'registry.example/agency:tag;not-a-shell-command'
  assert.deepEqual(parseAgencyArgs(['build', '--image', image]), { command: 'build', options: { image } })
  assert.deepEqual(parseAgencyArgs(['logs', '--env-file', envFile, '--service', 'app']), {
    command: 'logs', options: { 'env-file': envFile, service: 'app' },
  })
  assert.throws(() => parseAgencyArgs([]), /Choose build/)
  assert.throws(() => parseAgencyArgs(['up', '--env-file']), /Invalid options/)
  assert.throws(() => parseAgencyArgs(['up', '--env-file', envFile, '--env-file', envFile]), /Invalid options/)
  assert.throws(() => parseAgencyArgs(['stop', '--organization', 'x']), /Invalid options/)
})

test('build, image verification and transfer plans retain exact paths and stay offline by construction', () => {
  const image = 'registry.example/agency:sha-123'
  const build = planAgencyCommand(['build', '--image', image], { root })
  assert.deepEqual(build[0], {
    executable: 'docker', cwd: path.join(root, 'ai-company'),
    args: ['build', '--progress', 'plain', '--target', 'runner', '--build-arg', 'OM_ENABLE_ENTERPRISE_MODULES=true', '--build-arg',
      'OM_ENABLE_ENTERPRISE_MODULES_AGENTS=true', '--file', path.join(root, 'ai-company', 'Dockerfile'), '--tag', image,
      path.join(root, 'ai-company')],
  })
  const verify = planAgencyCommand(['verify-image', '--image', image], { root })[0]
  assert.deepEqual(verify.args.slice(0, 8), ['run', '--rm', '--pull', 'never', '--network', 'none', '--entrypoint', 'node'])
  assert.equal(verify.args[8], image)
  const archive = path.resolve('D:/server/agency-image.tar')
  assert.deepEqual(planAgencyCommand(['export', '--image', image, '--file', archive], { root })[0].args,
    ['image', 'save', '--output', archive, image])
  assert.deepEqual(planAgencyCommand(['import', '--file', archive], { root })[0].args,
    ['image', 'load', '--input', archive])
  assert.throws(() => planAgencyCommand(['export', '--image', image, '--file', 'relative.tar'], { root }), /absolute path/)
})

test('build heap override is explicit and forwarded without becoming a container memory promise', () => {
  const steps = planAgencyCommand(['build', '--image', 'agency:test', '--heap-mb', '4096'], { root })
  const args = steps[0].args
  assert.equal(args[args.indexOf('BUILD_NODE_HEAP_MB=4096') - 1], '--build-arg')
  assert.ok(!args.includes('--memory'))
  const turbo = JSON.parse(fs.readFileSync(new URL('../../ai-company/turbo.json', import.meta.url), 'utf8'))
  assert.ok(turbo.globalPassThroughEnv.includes('NODE_OPTIONS'))
  for (const value of ['0', '-1', '1.5', '4GB', '4096;echo bad', '9007199254740992']) {
    assert.throws(() => planAgencyCommand(['build', '--image', 'agency:test', '--heap-mb', value], { root }), /heap-mb|Invalid options/)
  }
})

test('disabled execution preflight needs no provider model or key and stays read-only', () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment(runtimeEnv))
  const steps = planAgencyCommand(['preflight', '--env-file', envFile, '--for', 'deploy'], { root, runtimeEnv })
  assert.equal(steps.length, 4)
  assert.deepEqual(argsOf(steps).slice(0, 3), [
    ['version', '--format', '{{.Server.Os}}'],
    ['compose', 'version'],
    ['compose', '--project-name', 'agency-server', '--env-file', envFile, '--file', path.join(root, 'ai-company', 'docker/agency/compose.yml'), 'config', '--quiet'],
  ])
  assert.deepEqual(steps[3].args.slice(0, 6), ['run', '--rm', '--pull', 'never', '--network', 'none'])
  assert.equal(steps[3].args[8], runtimeEnv.AGENCY_IMAGE)
  assert.ok(!flattened(steps).includes('up'))
  assert.ok(!flattened(steps).includes('init'))
  assert.ok(!flattened(steps).includes('migrate'))
})

test('live execution requires an explicit model and provider key', () => {
  assert.throws(() => validateRuntimeEnvironment({ ...runtimeEnv, OM_AGENCY_TRIAGE_MODE: 'fixture' }), /Fixture triage/)
  assert.throws(() => validateRuntimeEnvironment({ ...runtimeEnv, OM_AGENCY_TRIAGE_MODE: 'live' }), /OM_AI_MODEL/)
  assert.throws(() => validateRuntimeEnvironment({ ...runtimeEnv, AGENCY_ANALYSIS_EXECUTION_ENABLED: 'true' }), /OM_AI_MODEL/)
  assert.throws(() => validateRuntimeEnvironment({ ...runtimeEnv, AGENCY_TOV_EXECUTION_ENABLED: 'true' }), /OM_AI_MODEL/)
  assert.throws(() => validateRuntimeEnvironment({ ...runtimeEnv, OM_AGENCY_TRIAGE_MODE: 'live', OM_AI_MODEL: 'openrouter/model' }), /OPENROUTER_API_KEY/)
  assert.doesNotThrow(() => validateRuntimeEnvironment({
    ...runtimeEnv, OM_AGENCY_TRIAGE_MODE: 'live', OM_AI_MODEL: 'openrouter/model', OPENROUTER_API_KEY: 'private-key',
    OM_AGENT_RUN_TIMEOUT_MS: '60000', OM_AGENT_PROVIDER_RETRY_MAX: '1', OM_AGENT_PROVIDER_RETRY_BASE_MS: '1000',
  }))
})

test('live triage requires every native bound before an app start', () => {
  const live = { ...runtimeEnv, OM_AGENCY_TRIAGE_MODE: 'live', OM_AI_MODEL: 'openrouter/model',
    OPENROUTER_API_KEY: 'private-key', OM_AGENT_RUN_TIMEOUT_MS: '60000',
    OM_AGENT_PROVIDER_RETRY_MAX: '1', OM_AGENT_PROVIDER_RETRY_BASE_MS: '1000' }
  for (const key of ['OM_AGENT_RUN_TIMEOUT_MS', 'OM_AGENT_PROVIDER_RETRY_MAX', 'OM_AGENT_PROVIDER_RETRY_BASE_MS']) {
    for (const value of ['', '0', '-1', '1.5']) {
      assert.throws(() => planAgencyCommand(['up', '--env-file', envFile], {
        root, runtimeEnv: { ...live, [key]: value },
      }), new RegExp(key))
    }
  }
})

test('native mail remains off until an operator configures delivery, key and sender', () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment({ ...runtimeEnv, OM_DISABLE_EMAIL_DELIVERY: 'true' }))
  const mail = { ...runtimeEnv, OM_DISABLE_EMAIL_DELIVERY: 'false', SYSTEM_EMAIL_PROVIDER: 'resend' }
  assert.throws(() => validateRuntimeEnvironment(mail), /RESEND_API_KEY/)
  assert.throws(() => validateRuntimeEnvironment({ ...mail, RESEND_API_KEY: 'private-key' }), /NOTIFICATIONS_EMAIL_FROM/)
  assert.doesNotThrow(() => validateRuntimeEnvironment({ ...mail, RESEND_API_KEY: 'private-key', NOTIFICATIONS_EMAIL_FROM: 'agency@example.com' }))
})

test('Compose explicitly forwards opt-ins and native mail without forwarding arbitrary env files', () => {
  const compose = fs.readFileSync(new URL('../../ai-company/docker/agency/compose.yml', import.meta.url), 'utf8')
  for (const [key, fallback] of Object.entries({ OM_AGENCY_TRIAGE_ENABLED: 'false', OM_AGENCY_TRIAGE_MODE: 'disabled',
    AGENCY_ANALYSIS_EXECUTION_ENABLED: 'false', AGENCY_TOV_EXECUTION_ENABLED: 'false',
    OM_AGENT_RUN_TIMEOUT_MS: '60000', OM_AGENT_PROVIDER_RETRY_MAX: '1', OM_AGENT_PROVIDER_RETRY_BASE_MS: '1000',
    OM_DISABLE_EMAIL_DELIVERY: 'true', SYSTEM_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: '', NOTIFICATIONS_EMAIL_FROM: '',
  })) assert.ok(compose.includes(`${key}: \${${key}:-${fallback}}`), key)
  assert.ok(!/^\s*env_file:/m.test(compose))
  assert.ok(compose.includes('OM_AGENCY_DEMO_PURCHASE_ENABLED: "false"'))
})

test('ordinary lifecycle plans never imply initialization, migration or destructive cleanup', () => {
  const cases = [
    ['up', '--env-file', envFile],
    ['deploy', '--env-file', envFile],
    ['status', '--env-file', envFile],
    ['logs', '--env-file', envFile, '--service', 'app'],
    ['stop', '--env-file', envFile, '--service', 'postgres'],
  ]
  for (const argv of cases) {
    const steps = planAgencyCommand(argv, { root, runtimeEnv })
    const tokens = flattened(steps)
    assert.ok(!tokens.includes('init'), argv[0])
    assert.ok(!tokens.includes('migrate'), argv[0])
    assert.ok(!tokens.includes('down'), argv[0])
    assert.ok(!tokens.includes('rm'), argv[0])
    assert.ok(!tokens.includes('--volumes'), argv[0])
  }
  assert.deepEqual(planAgencyCommand(['stop', '--env-file', envFile], { root, runtimeEnv })[0].args.slice(-1), ['stop'])
})

test('init and migration remain explicit, bounded native commands', () => {
  const initEnv = {
    ...runtimeEnv,
    OM_INIT_SUPERADMIN_EMAIL: 'owner@example.com',
    OM_INIT_SUPERADMIN_PASSWORD: 'superadmin-password',
    OM_INIT_ADMIN_PASSWORD: 'admin-password',
    OM_INIT_EMPLOYEE_PASSWORD: 'employee-password',
  }
  assert.throws(() => planAgencyCommand(['init', '--env-file', envFile, '--organization', 'agency'], { root, runtimeEnv }),
    /first-time bootstrap/)
  const init = planAgencyCommand(['init', '--env-file', envFile, '--organization', 'agency-eu'], { root, runtimeEnv: initEnv })
  assert.equal(init.length, 1)
  assert.deepEqual(init[0].args.slice(-7), ['app', 'yarn', 'mercato', 'init', '--no-examples', '--skip-password-policy=false', '--org=agency-eu'])
  const migrate = planAgencyCommand(['migrate', '--env-file', envFile], { root, runtimeEnv })
  assert.equal(migrate.length, 2)
  assert.deepEqual(migrate.map((step) => step.args.slice(-3)), [
    ['mercato', 'db', 'migrate'],
    ['mercato', 'auth', 'sync-role-acls'],
  ])
})

test('service arguments are allowlisted and remain exact compose argv', () => {
  assert.deepEqual(planAgencyCommand(['logs', '--env-file', envFile, '--service', 'app'], { root, runtimeEnv })[0].args.slice(-4),
    ['logs', '--tail', '100', 'app'])
  assert.deepEqual(planAgencyCommand(['up', '--env-file', envFile, '--service', 'postgres'], { root, runtimeEnv })[0].args.slice(-4),
    ['up', '-d', '--wait', 'postgres'])
  assert.throws(() => planAgencyCommand(['up', '--env-file', envFile, '--service', 'all;down'], { root, runtimeEnv }), /app or postgres/)
})

test('secret redaction replaces secret values literally without hiding ordinary configuration', () => {
  const values = {
    AGENCY_IMAGE: 'agency:v1',
    POSTGRES_PASSWORD: 'db.$ecret',
    JWT_SECRET: 'jwt/secret+value',
    OPENROUTER_API_KEY: 'provider-key',
  }
  const redacted = redactSecrets('agency:v1 db.$ecret jwt/secret+value provider-key', values)
  assert.equal(redacted, 'agency:v1 [redacted] [redacted] [redacted]')
  assert.ok(!redacted.includes('secret'))
  assert.equal(redactSecrets('unchanged', { AUTH_SECRET: '' }), 'unchanged')
})
