import { readFileSync } from 'node:fs'
import path from 'node:path'

const statePath = path.resolve('.ai', 'qa', 'ephemeral-env.json')

let state
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'))
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log(`No retained Open Mercato test environment is recorded at ${statePath}.`)
    process.exit(0)
  }
  throw error
}

const requiredFields = ['status', 'ownerPid', 'projectRoot', 'baseUrl', 'databaseUrl', 'databaseName', 'source', 'startedAt']
const missingFields = requiredFields.filter((field) => state[field] === undefined || state[field] === null || state[field] === '')
if (missingFields.length > 0) {
  console.error(`The retained environment descriptor is legacy or incomplete: missing ${missingFields.join(', ')}.`)
  console.error('Stop any old owner before starting a new project-owned environment.')
  process.exit(2)
}

const normalizeWorkspacePath = (value) => {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}
const currentProjectRoot = normalizeWorkspacePath(process.cwd())
const recordedProjectRoot = normalizeWorkspacePath(state.projectRoot)
const workspaceMatches = currentProjectRoot === recordedProjectRoot

let ownerRunning = false
try {
  process.kill(state.ownerPid, 0)
  ownerRunning = true
} catch {}

const databaseUrl = new URL(state.databaseUrl)
console.log(`Status: ${state.status}`)
console.log(`Owner PID: ${state.ownerPid} (${ownerRunning ? 'running' : 'not running'})`)
console.log(`Project root: ${state.projectRoot} (${workspaceMatches ? 'matches' : 'DOES NOT MATCH'})`)
console.log(`App URL: ${state.baseUrl}`)
console.log(`Database: ${databaseUrl.username}@${databaseUrl.hostname}:${databaseUrl.port || '5432'}/${state.databaseName}`)
console.log(`Source: ${state.source}`)
console.log(`Started: ${state.startedAt}`)

if (!workspaceMatches || !ownerRunning || state.status !== 'running') {
  process.exitCode = 2
}
