import { readFile, readdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { validateEvent } from './journal.mjs'
export { appendEvent, validateEvent } from './journal.mjs'

export async function readJournal(path) {
  let files
  try { files = (await readdir(path)).filter(name => name.endsWith('.jsonl')).sort().map(name => join(path, name)) }
  catch (error) { if (error.code !== 'ENOTDIR') throw error; files = [path] }
  const events = [], diagnostics = []
  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
    lines.forEach((line, index) => {
      if (!line.trim()) return
      try { events.push(validateEvent(JSON.parse(line))) }
      catch { diagnostics.push({ file: basename(file), line: index + 1, reason: 'Invalid or incomplete event; content omitted' }) }
    })
  }
  return { events, diagnostics }
}

export function validateMap(map) {
  if (map?.schemaVersion !== 1 || !Array.isArray(map.agents) || !Array.isArray(map.integrations)) throw new Error('Invalid integration map')
  for (const [kind, entries] of [['agent', map.agents], ['integration', map.integrations]]) {
    const ids = new Set()
    for (const entry of entries) {
      if (!entry.id || ids.has(entry.id) || !entry.processId || !entry.source || !['connected', 'defined', 'gap'].includes(entry.connection)) throw new Error(`Invalid or duplicate ${kind} entry`)
      ids.add(entry.id)
    }
  }
  return map
}

function hasProof(event, kind) {
  if (event.phase !== 'completed') return false
  if (kind === 'agent') return Boolean(event.refs?.agentRunId)
  return Boolean(event.refs?.producerRunId && (event.refs?.consumerRunId || event.refs?.userTaskId))
}

export function buildIndex(map, journal = { events: [], diagnostics: [] }) {
  validateMap(map)
  const events = journal.events.map(validateEvent).toSorted((a, b) => a.time.localeCompare(b.time))
  const agents = new Set(map.agents.map(item => item.id))
  const integrations = new Set(map.integrations.map(item => item.id))
  const summarize = (entries, kind) => entries.map(entry => {
    const observations = events.filter(event => event[`${kind}Id`] === entry.id)
    const proof = mode => observations.filter(event => event.mode === mode && hasProof(event, kind))
    return { ...entry, fixture: proof('fixture').length ? 'observed' : 'not_observed', live: proof('live').length ? 'observed' : 'not_observed',
      observationCount: observations.length, last: observations.at(-1) ?? null,
      proofRunIds: { fixture: [...new Set(proof('fixture').map(event => event.runId))], live: [...new Set(proof('live').map(event => event.runId))] } }
  })
  const grouped = new Map()
  for (const event of events) {
    const key = `${event.mode}:${event.runId}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(event)
  }
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    note: [map.notes, 'Source connections are not execution proof. Fixture observations do not prove live model quality. A journal records supplied native references; it does not authenticate their origin or certify every product path.'].filter(Boolean).join(' '),
    agents: summarize(map.agents, 'agent'), integrations: summarize(map.integrations, 'integration'),
    unmapped: events.filter(event => (event.agentId && !agents.has(event.agentId)) || (event.integrationId && !integrations.has(event.integrationId))),
    runs: [...grouped.values()].map(items => ({ runId: items[0].runId, mode: items[0].mode, journey: items[0].journey,
      lastReached: items.at(-1), failedEventCount: items.filter(event => event.phase === 'failed').length, events: items })),
    diagnostics: journal.diagnostics,
  }
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const target = event => event.agentId ?? event.integrationId ?? event.checkpointId
const phase = event => event ? `${event.phase}${event.reason ? ` (${event.reason})` : ''}` : 'not observed'

export function renderHtml(index) {
  const table = (title, rows) => `<h2>${title}</h2><table><thead><tr><th>ID / process</th><th>Source connection</th><th>Fixture execution</th><th>Live execution</th><th>Latest observation</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.id)}<small>${escape(row.processId)}</small></td><td>${escape(row.connection)}<small>${escape(row.source)}</small><small>Entry: ${escape(row.entry ?? 'not mapped')}</small><small>Handoff: ${escape(row.handoff ?? 'not mapped')}</small></td><td>${escape(row.fixture)}</td><td>${escape(row.live)}</td><td>${escape(phase(row.last))}</td></tr>`).join('')}</tbody></table>`
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agency integration evidence</title><style>body{font:15px system-ui;margin:2rem;max-width:1500px;color:#172033;background:#fafbfc}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;background:white}td,th{text-align:left;padding:.7rem;border:1px solid #d8dfe8;vertical-align:top}small{display:block;color:#546175;overflow-wrap:anywhere;margin-top:.3rem}summary{cursor:pointer;padding:.7rem;background:#e9eff5}li{padding:.25rem}code{overflow-wrap:anywhere}.warning{color:#964b00}</style><h1>Agency integration evidence</h1><p>${escape(index.note)}</p><p>Generated ${escape(index.generatedAt)}. ${index.agents.length} expected agents; ${index.integrations.length} expected handoffs; ${index.runs.length} observed runs.</p><p><b>Read this:</b> connected/defined/gap describe source wiring only. observed requires a completed native agent reference, or a producer + consumer reference for a handoff. not_observed means no qualifying record, not missing code. Waiting for human/input/budget/configuration is an ordinary stop, distinct from failed. Latest observation may fail even when an earlier run succeeded. Only an explicit final checkpoint establishes that a whole journey reached its end.</p>${table('Agents', index.agents)}${table('Integration handoffs', index.integrations)}<h2>Run journal</h2>${index.runs.length ? index.runs.map(run => `<details open><summary>${escape(run.journey)} / ${escape(run.mode)} / ${escape(run.runId)} — last: ${escape(target(run.lastReached))} ${escape(phase(run.lastReached))}; ${run.failedEventCount} failure event(s)</summary><ol>${run.events.map(event => `<li><code>${escape(event.time)}</code> ${escape(target(event))}: <b>${escape(phase(event))}</b><small>${escape(JSON.stringify(event.refs ?? {}))}</small></li>`).join('')}</ol></details>`).join('') : '<p>No runtime observations loaded. Nothing is marked executed.</p>'}<h2>Unmapped observations (${index.unmapped.length})</h2><ul>${index.unmapped.map(event => `<li>${escape(event.runId)}: ${escape(target(event))} — ${escape(phase(event))}</li>`).join('')}</ul><h2>Journal diagnostics (${index.diagnostics.length})</h2><ul class="warning">${index.diagnostics.map(item => `<li>${escape(item.file)}:${item.line} — ${escape(item.reason)}</li>`).join('')}</ul></html>`
}
