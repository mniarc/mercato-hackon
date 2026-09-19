import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const usage = `Usage: setup.ps1 <action> [options] | sh setup.sh <action> [options]
All actions require --release-dir <absolute extracted release directory>.
  prepare  --env-file <absolute private file> --image <image:tag>
  import   --image-file <absolute image tar>
  check    --env-file <absolute private file> [--for init|up]
  init     --env-file <absolute private file> --organization <name> --confirm-empty-db
  start | status | logs | stop  --env-file <absolute private file>
One installation per Docker daemon: the existing runner uses project agency-server.
No automatic initialization, migration, reset, build or provider activation.
`
const optionsByAction = {
  prepare: ['env-file', 'image'], import: ['image-file'], check: ['env-file', 'for'],
  init: ['env-file', 'organization', 'confirm-empty-db'],
  start: ['env-file'], status: ['env-file'], logs: ['env-file'], stop: ['env-file'],
}

function absoluteOption(options, name) {
  const value = options[name]
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`--${name} must be an explicit absolute path`)
  return path.normalize(value)
}

export function planSetup(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') return { help: true }
  const [action, ...rest] = argv
  if (!Object.hasOwn(optionsByAction, action)) throw new Error('Choose prepare, import, check, init, start, status, logs or stop')
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index]?.startsWith('--') ? rest[index].slice(2) : ''
    if (!['release-dir', ...optionsByAction[action]].includes(key) || Object.hasOwn(options, key)) throw new Error(`Invalid options for ${action}`)
    if (key === 'confirm-empty-db') options[key] = true
    else {
      const value = rest[++index]
      if (!value?.trim() || value.startsWith('--')) throw new Error(`Missing --${key} value`)
      options[key] = value
    }
  }
  const releaseDir = absoluteOption(options, 'release-dir')
  if (action === 'import') return { action, releaseDir, steps: [['import', '--file', absoluteOption(options, 'image-file')]] }
  const envFile = absoluteOption(options, 'env-file')
  if (action === 'prepare') {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]+$/.test(options.image ?? '')) throw new Error('prepare requires an explicit --image reference')
    return { action, releaseDir, envFile, image: options.image, steps: [] }
  }
  const envArgs = ['--env-file', envFile]
  if (action === 'check') {
    const intended = options.for ?? 'up'
    if (!['up', 'init'].includes(intended)) throw new Error('--for must be up or init')
    return { action, releaseDir, steps: [['preflight', ...envArgs, '--for', intended]] }
  }
  if (action === 'init') {
    if (!options['confirm-empty-db']) throw new Error('First-time init requires --confirm-empty-db; never use it to reset or upgrade a database')
    if (!options.organization?.trim()) throw new Error('init requires --organization')
    return { action, releaseDir, steps: [
      ['preflight', ...envArgs, '--for', 'init'],
      ['up', ...envArgs, '--service', 'postgres'],
      ['init', ...envArgs, '--organization', options.organization],
    ] }
  }
  return { action, releaseDir, steps: [[action === 'start' ? 'up' : action, ...envArgs]] }
}

export async function prepareEnvironment({ releaseDir, envFile, image }) {
  const releaseRoot = await fs.realpath(releaseDir)
  const envParent = await fs.realpath(path.dirname(envFile))
  const relative = path.relative(releaseRoot, envParent)
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Keep the private environment file outside the extracted release directory')
  }
  const template = await fs.readFile(path.join(releaseRoot, 'ai-company/docker/agency/runtime.env.example'), 'utf8')
  const content = template.replace(/^AGENCY_IMAGE=.*$/m, `AGENCY_IMAGE=${image}`)
  const handle = await fs.open(envFile, 'wx', 0o600)
  try { await handle.writeFile(content) } finally { await handle.close() }
}

async function invokeRunner(releaseDir, args) {
  const runner = path.join(releaseDir, 'bin/agency.mjs')
  await fs.access(runner)
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, ...args], { cwd: releaseDir, shell: false, stdio: 'inherit' })
    child.once('error', () => reject(new Error('Cannot start the selected release launcher')))
    child.once('close', code => code === 0 ? resolve() : reject(Object.assign(new Error('Release launcher failed; no later setup actions ran'), { exitCode: code ?? 1 })))
  })
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const plan = planSetup(process.argv.slice(2))
    if (plan.help) console.log(usage)
    else {
      console.error('One installation per Docker daemon: shared Compose project agency-server; another directory or port does not isolate its data.')
      if (plan.action === 'prepare') {
        await prepareEnvironment(plan)
        console.log('Created private environment template without overwriting existing files. Fill secrets privately before check/init/start.')
      } else {
        for (const args of plan.steps) await invokeRunner(plan.releaseDir, args)
      }
    }
  } catch (error) {
    console.error(error?.code === 'EEXIST' ? 'Environment file already exists; it was not changed' : error?.code === 'ENOENT'
      ? 'Release input or private environment parent directory does not exist'
      : error instanceof Error ? error.message : 'Server setup failed')
    process.exitCode = error?.exitCode ?? 1
  }
}
