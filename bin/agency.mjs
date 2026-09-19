import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const teamRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const usage = `Usage: agency.ps1 <command> [options] | sh agency.sh <command> [options]
  build | verify-image     --image <image:tag>
  preflight                --env-file <absolute-path> [--for up|deploy|init|migrate]
  config-check             --env-file <absolute-path>
  up                       --env-file <absolute-path> [--service app|postgres]
  deploy | migrate | status --env-file <absolute-path>
  init                     --env-file <absolute-path> --organization <name>
  logs | stop              --env-file <absolute-path> [--service app|postgres]
  export                   --image <image:tag> --file <absolute-path>
  import                   --file <absolute-path>
No implicit initialization, migration, registry push or database reset.
`
const runtimeCommands = new Set(['preflight', 'config-check', 'up', 'deploy', 'init', 'migrate', 'status', 'logs', 'stop'])
const optionsByCommand = {
  build: ['image'], 'verify-image': ['image'], export: ['image', 'file'], import: ['file'],
  preflight: ['env-file', 'for'], 'config-check': ['env-file'], up: ['env-file', 'service'],
  deploy: ['env-file'], init: ['env-file', 'organization'], migrate: ['env-file'],
  status: ['env-file'], logs: ['env-file', 'service'], stop: ['env-file', 'service'],
}

const imageCheck = `
import fs from 'node:fs';
const root = '/app/apps/mercato';
const modules = fs.readFileSync(root + '/.mercato/generated/modules.generated.ts', 'utf8');
const workers = fs.readFileSync(root + '/.mercato/generated/modules.cli.generated.ts', 'utf8');
for (const name of ['agency_operations','agency_research','agency_tov','agent_orchestrator','channel_discord']) {
  if (!modules.includes(name)) throw new Error('Missing generated module: ' + name);
}
for (const name of ['workflow-activities.worker','workflow-invoke-agent.worker','process-execution-starter']) {
  if (!workers.includes(name)) throw new Error('Missing native worker: ' + name);
}
for (const name of ['OM_ENABLE_ENTERPRISE_MODULES','OM_ENABLE_ENTERPRISE_MODULES_AGENTS']) {
  if (process.env[name] !== 'true') throw new Error('Missing runtime activation: ' + name);
}
fs.accessSync(root + '/.mercato/next/BUILD_ID');
fs.accessSync(root + '/.mercato', fs.constants.W_OK);
fs.accessSync(root + '/storage', fs.constants.W_OK);
console.log('Image: native app/modules/workers present, non-root runtime paths writable; no app/provider calls.');
`

export function parseAgencyArgs(argv) {
  const [command, ...rest] = argv
  if (!Object.hasOwn(optionsByCommand, command ?? '')) throw new Error('Choose build, verify-image, preflight, config-check, up/deploy, init, migrate, status, logs, stop, export or import')
  const options = {}
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]
    const key = flag.startsWith('--') ? flag.slice(2) : ''
    const value = rest[index + 1]
    if (!optionsByCommand[command].includes(key) || !value || value.startsWith('--') || Object.hasOwn(options, key)) {
      throw new Error(`Invalid options for ${command}`)
    }
    options[key] = value
  }
  return { command, options }
}

function required(options, key) {
  const value = options[key]?.trim()
  if (!value) throw new Error(`Explicit --${key} is required`)
  return value
}

function absoluteFile(options, key) {
  const value = required(options, key)
  if (!path.isAbsolute(value)) throw new Error(`--${key} must be an absolute path`)
  return path.normalize(value)
}

export function validateRuntimeEnvironment(values, { initialization = false } = {}) {
  for (const key of ['AGENCY_IMAGE', 'APP_URL', 'POSTGRES_PASSWORD', 'JWT_SECRET', 'AUTH_SECRET', 'TENANT_DATA_ENCRYPTION_FALLBACK_KEY']) {
    if (!values[key]?.trim()) throw new Error(`Missing runtime configuration: ${key}`)
  }
  if (!/^https:\/\//.test(values.APP_URL)) throw new Error('APP_URL must name the production HTTPS origin')
  if (!/^[A-Za-z0-9_-]+$/.test(values.POSTGRES_PASSWORD)) throw new Error('POSTGRES_PASSWORD must be URL-safe; use a random hex value')
  for (const key of ['JWT_SECRET', 'AUTH_SECRET', 'TENANT_DATA_ENCRYPTION_FALLBACK_KEY']) {
    if (values[key].length < 32) throw new Error(`${key} must contain at least 32 characters`)
  }
  const enabled = (value) => ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
  if (values.OM_AGENCY_TRIAGE_MODE === 'fixture') throw new Error('Fixture triage is not a production deployment mode')
  if (values.OM_AGENCY_TRIAGE_MODE === 'live' || enabled(values.AGENCY_ANALYSIS_EXECUTION_ENABLED)) {
    if (!values.OM_AI_MODEL?.trim()) throw new Error('Live agent execution requires the explicitly configured OM_AI_MODEL')
    if ((values.OM_AI_PROVIDER ?? 'openrouter') === 'openrouter' && !values.OPENROUTER_API_KEY?.trim()) {
      throw new Error('Live OpenRouter execution requires OPENROUTER_API_KEY')
    }
  }
  if (initialization) {
    for (const key of ['OM_INIT_SUPERADMIN_EMAIL', 'OM_INIT_SUPERADMIN_PASSWORD', 'OM_INIT_ADMIN_PASSWORD', 'OM_INIT_EMPLOYEE_PASSWORD']) {
      if (!values[key]?.trim()) throw new Error(`Explicit first-time bootstrap configuration required: ${key}`)
    }
  }
}

export function planAgencyCommand(argv, { root = teamRoot, runtimeEnv = {} } = {}) {
  const { command, options } = parseAgencyArgs(argv)
  const app = path.join(root, 'ai-company')
  const step = (...args) => ({ executable: 'docker', args, cwd: app })
  const verify = (image) => step('run', '--rm', '--pull', 'never', '--network', 'none', '--entrypoint', 'node', image, '--input-type=module', '-e', imageCheck)
  if (command === 'build') return [step('build', '--target', 'runner', '--build-arg', 'OM_ENABLE_ENTERPRISE_MODULES=true',
    '--build-arg', 'OM_ENABLE_ENTERPRISE_MODULES_AGENTS=true', '--file', path.join(app, 'Dockerfile'), '--tag', required(options, 'image'), app)]
  if (command === 'verify-image') return [verify(required(options, 'image'))]
  if (command === 'export') return [step('image', 'save', '--output', absoluteFile(options, 'file'), required(options, 'image'))]
  if (command === 'import') return [step('image', 'load', '--input', absoluteFile(options, 'file'))]

  const envFile = absoluteFile(options, 'env-file')
  const prefix = ['compose', '--project-name', 'agency-server', '--env-file', envFile, '--file', path.join(app, 'docker/agency/compose.yml')]
  const compose = (...args) => step(...prefix, ...args)
  if (command === 'preflight') {
    const intended = options.for ?? 'up'
    if (!['up', 'deploy', 'init', 'migrate'].includes(intended)) throw new Error('--for must be up, deploy, init or migrate')
    validateRuntimeEnvironment(runtimeEnv, { initialization: intended === 'init' })
    return [step('version', '--format', '{{.Server.Os}}'), step('compose', 'version'), compose('config', '--quiet'), verify(runtimeEnv.AGENCY_IMAGE)]
  }
  if (command === 'config-check') return [compose('config', '--quiet')]
  if (command === 'init') {
    validateRuntimeEnvironment(runtimeEnv, { initialization: true })
    return [compose('run', '--rm', '--no-deps', '--pull', 'never', 'app', 'yarn', 'mercato', 'init', '--no-examples',
      '--skip-password-policy=false', `--org=${required(options, 'organization')}`)]
  }
  if (command === 'migrate') return [
    compose('run', '--rm', '--no-deps', '--pull', 'never', 'app', 'yarn', 'mercato', 'db', 'migrate'),
    compose('run', '--rm', '--no-deps', '--pull', 'never', 'app', 'yarn', 'mercato', 'auth', 'sync-role-acls'),
  ]
  if (command === 'status') return [compose('ps')]
  if (command === 'stop') {
    if (options.service && !['app', 'postgres'].includes(options.service)) throw new Error('--service must be app or postgres')
    return [compose('stop', ...(options.service ? [options.service] : []))]
  }
  if (command === 'logs') {
    if (options.service && !['app', 'postgres'].includes(options.service)) throw new Error('--service must be app or postgres')
    return [compose('logs', '--tail', '100', ...(options.service ? [options.service] : []))]
  }
  if (options.service && !['app', 'postgres'].includes(options.service)) throw new Error('--service must be app or postgres')
  return [compose('up', '-d', '--wait', ...(options.service ? [options.service] : []))]
}

export function redactSecrets(line, values) {
  return Object.entries(values).reduce((result, [key, value]) =>
    /PASSWORD|SECRET|TOKEN|KEY/.test(key) && value ? result.split(value).join('[redacted]') : result, line)
}

async function execute(steps, runtimeEnv) {
  for (const step of steps) {
    await new Promise((resolve, reject) => {
      const child = spawn(step.executable, step.args, { cwd: step.cwd, shell: false,
        env: { ...process.env, ...runtimeEnv }, stdio: ['inherit', 'pipe', 'pipe'] })
      for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
        const lines = readline.createInterface({ input: stream })
        lines.on('line', (line) => output.write(`${redactSecrets(line, runtimeEnv)}\n`))
      }
      child.once('error', () => reject(new Error('Cannot start Docker; install/start the Docker engine and Compose plugin')))
      child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Docker command failed (${code ?? 'signal'}); no later commands ran`)))
    })
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const argv = process.argv.slice(2)
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') {
      console.log(usage)
    } else {
      const parsed = parseAgencyArgs(argv)
      const runtimeEnv = runtimeCommands.has(parsed.command)
        ? parseEnv(fs.readFileSync(absoluteFile(parsed.options, 'env-file'), 'utf8')) : {}
      await execute(planAgencyCommand(argv, { runtimeEnv }), runtimeEnv)
    }
  } catch (error) {
    console.error(error instanceof Error && error.code === 'ENOENT' ? 'Runtime environment file not found' : error instanceof Error ? error.message : 'Agency command failed')
    process.exitCode = 1
  }
}
