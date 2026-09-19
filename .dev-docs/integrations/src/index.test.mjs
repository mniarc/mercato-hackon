import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appendEvent, buildIndex, readJournal, renderHtml, validateEvent } from './index.mjs'

const map = { schemaVersion: 1, agents: [{ id: 'research.author', processId: 'brief', source: 'author.ts', connection: 'connected' }],
  integrations: [{ id: 'brief.review', processId: 'brief', source: 'service.ts', connection: 'connected' }] }
const event = overrides => ({ schemaVersion: 1, runId: 'demo-1', time: '2026-09-19T12:00:00.000Z', journey: 'production', mode: 'fixture', agentId: 'research.author', phase: 'completed', ...overrides })

test('source wiring and model-only observations do not prove downstream handoff', () => {
  assert.equal(buildIndex(map).agents[0].fixture, 'not_observed')
  const index = buildIndex(map, { events: [event({ refs: { agentRunId: 'a1' } }), event({ agentId: undefined, integrationId: 'brief.review', refs: { agentRunId: 'a1' } })], diagnostics: [] })
  assert.equal(index.agents[0].fixture, 'observed')
  assert.equal(index.agents[0].live, 'not_observed')
  assert.equal(index.integrations[0].fixture, 'not_observed')
})

test('persisted producer-to-consumer observation proves only its recorded mode', () => {
  const index = buildIndex(map, { events: [event({ agentId: undefined, integrationId: 'brief.review', refs: { producerRunId: 'a1', userTaskId: 'review1', outputVersionId: 'v1' } })], diagnostics: [] })
  assert.equal(index.integrations[0].fixture, 'observed')
  assert.equal(index.integrations[0].live, 'not_observed')
})

test('failed and waiting timelines remain visible; unknown IDs stay unmapped', () => {
  const events = [event({ phase: 'failed', reason: 'execution' }), event({ time: '2026-09-19T12:01:00Z', agentId: 'new.worker', phase: 'waiting', reason: 'human', refs: { userTaskId: 'u1' } })]
  const index = buildIndex(map, { events, diagnostics: [] })
  assert.equal(index.runs[0].failedEventCount, 1)
  assert.equal(index.runs[0].lastReached.reason, 'human')
  assert.equal(index.unmapped.length, 1)
  assert.equal(index.agents[0].fixture, 'not_observed')
})

test('closed event shape refuses customer content and unknown reference fields', () => {
  assert.throws(() => validateEvent(event({ prompt: 'private' })))
  assert.throws(() => validateEvent(event({ refs: { error: 'private' } })))
  assert.throws(() => validateEvent(event({ integrationId: 'also' })))
})

test('journal preserves valid prefix after interrupted write without leaking bad content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agency-integration-index-'))
  try {
    const path = join(directory, 'run.jsonl')
    await appendEvent(path, event({ phase: 'started' }))
    await writeFile(path, '{"private":"never expose', { flag: 'a' })
    const journal = await readJournal(directory)
    assert.equal(journal.events.length, 1)
    assert.equal(journal.diagnostics.length, 1)
    assert.equal(JSON.stringify(journal).includes('never expose'), false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('standalone renderer escapes map text and does not claim whole-run completion', () => {
  const unsafe = structuredClone(map)
  unsafe.agents[0].source = '<script>alert(1)</script>'
  const html = renderHtml(buildIndex(unsafe))
  assert.equal(html.includes('<script>'), false)
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('No runtime observations loaded'))
})
