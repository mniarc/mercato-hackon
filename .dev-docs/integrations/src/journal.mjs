import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const token = /^[A-Za-z0-9_.:/-]{1,200}$/
const fields = new Set(['schemaVersion', 'runId', 'time', 'journey', 'mode', 'agentId', 'integrationId', 'checkpointId', 'phase', 'reason', 'refs'])
const referenceFields = new Set(['agentRunId', 'workflowInstanceId', 'taskRunId', 'outputVersionId', 'producerRunId', 'consumerRunId', 'userTaskId'])

// Deliberately closed: never journal prompts, customer text, keys or error bodies.
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Event must be an object')
  if (Object.keys(event).some(key => !fields.has(key))) throw new Error('Unknown event field')
  if (event.schemaVersion !== 1) throw new Error('Unsupported journal schemaVersion')
  for (const key of ['runId', 'journey']) if (typeof event[key] !== 'string' || !token.test(event[key])) throw new Error(`Invalid ${key}`)
  if (typeof event.time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(event.time) || !Number.isFinite(Date.parse(event.time))) throw new Error('Invalid time')
  if (!['fixture', 'live'].includes(event.mode)) throw new Error('Invalid mode')
  if (!['started', 'completed', 'waiting', 'failed'].includes(event.phase)) throw new Error('Invalid phase')
  const ids = ['agentId', 'integrationId', 'checkpointId'].filter(key => event[key] !== undefined)
  if (ids.length !== 1 || typeof event[ids[0]] !== 'string' || !token.test(event[ids[0]])) throw new Error('Exactly one valid target ID is required')
  if (event.reason !== undefined && !['human', 'input', 'budget', 'configuration', 'execution'].includes(event.reason)) throw new Error('Invalid reason')
  if (event.refs !== undefined) {
    if (!event.refs || typeof event.refs !== 'object' || Array.isArray(event.refs)) throw new Error('Invalid refs')
    for (const [key, value] of Object.entries(event.refs)) {
      if (!referenceFields.has(key) || typeof value !== 'string' || !token.test(value)) throw new Error('Invalid reference')
    }
  }
  return event
}

export async function appendEvent(file, event) {
  validateEvent(event)
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8')
}
