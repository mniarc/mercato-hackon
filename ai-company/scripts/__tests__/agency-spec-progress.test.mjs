import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { buildReport, extractReferences, formatReport, formatDetails, selectHierarchy, parseOptions, loadReport, defaultAppRoot } from '../agency-spec-progress.mjs'

const story = (id, domain = 'domain') => ({ path: `.specs/user-stories/${domain}/${id}.md`, text: `# ${id}` })
const task = (id, text) => ({ path: `.tasks/${id}-task.md`, text })
const adr = (text) => ({ path: '.dev-docs/adr/003-map.md', text })

test('exact anchors and family references do not match neighboring IDs or invent range children', () => {
  assert.deepEqual(extractReferences('F01 F010 F01-99 F52-1 F52-1 F40-F55', ['F01-1', 'F01-2', 'F52-1']), {
    ids: ['F01-1', 'F01-2', 'F52-1'], invalid: ['F01-99', 'F010'], ignoredRanges: ['F40-F55'],
  })
  assert.deepEqual(extractReferences('F01-1–F01-3 F52', ['F01-1', 'F52-1'], { exactOnly: true }), {
    ids: [], invalid: ['F52'], ignoredRanges: ['F01-1–F01-3'],
  })
})

test('bounded done tasks and overlapping ADR coverage are mapping, not story verification', () => {
  const report = buildReport({
    storyFiles: [story('F40-1'), story('F42-1'), story('F34-1', 'publication')],
    taskFiles: [task('T16', 'State: done (bounded clarification slice)\nSources: F40-1, F42-1\n\nADR-003'), task('T19', 'State: active\nSources: F42-1')],
    adrFiles: [adr('F40-1, F42-1, F34-1\nF42-1 scaffold')],
  })
  assert.equal(report.totals.mapped, 3)
  assert.equal(report.totals.mappedPercent, 100)
  assert.equal(report.totals.doneTasksPercent, 50)
  assert.equal(report.totals.documentedVerified, 0)
  assert.equal(report.totals.unassessed, 3)
  assert.equal(report.scopes.proposal.stories, 1)
  assert.deepEqual(report.storiesWithoutTasks, ['F34-1'])
  assert.deepEqual(report.stories.find((item) => item.id === 'F42-1').taskIds, ['T16', 'T19'])
  assert.deepEqual(report.domains.find((item) => item.domain === 'domain').activeTasks, ['T19'])
  assert.match(formatReport(report), /not product-completion/)
})

test('only explicit exact-story claims with traceable evidence on a done task count once', () => {
  const report = buildReport({
    storyFiles: [story('F42-1'), story('F42-2'), story('F51-1')],
    taskFiles: [
      task('T01', 'State: done\nSources: F42\nVerified stories: F42-1\nVerification evidence: [acceptance](../checks/triage.md)'),
      task('T02', 'State: done\nSources: F42-1\nVerified stories: F42-1\nVerification evidence: abc123de'),
      task('T03', 'State: done\nVerified stories: F42-2\nVerification evidence: works for me'),
      task('T04', 'State: active\nVerified stories: F51-1\nVerification evidence: [check](check.md)'),
      task('T05', 'State: done\nVerified stories: F42\nVerification evidence: [check](check.md)'),
    ], adrFiles: [],
  })
  assert.equal(report.totals.documentedVerified, 1)
  assert.equal(report.stories[0].verificationClaims.length, 2)
  assert.equal(report.stories[1].acceptance, 'unassessed')
  assert.ok(report.diagnostics.some((item) => item.kind === 'missing-verification-evidence'))
  assert.ok(report.diagnostics.some((item) => item.kind === 'verification-on-unfinished-task'))
  assert.ok(report.diagnostics.some((item) => item.kind === 'invalid-story-reference' && item.anchor === 'F42'))
})

test('source provenance is exact; prose alone does not associate task stories', () => {
  const report = buildReport({
    storyFiles: [story('F01-1'), story('F01-1', 'duplicate'), story('F02-1')],
    taskFiles: [task('TOV-02', '# Work\nState: ready\nSources: F01-1,\n F99-1\n\nThis discussion mentions F02-1 and ADR-003.')],
    adrFiles: [],
  })
  assert.equal(report.totals.stories, 2)
  assert.deepEqual(report.unmappedStories, ['F02-1'])
  assert.equal(report.stories[0].mappingEvidence[0].line, 3)
  assert.deepEqual(report.tasks[0].adrIds, ['ADR-003'])
  assert.ok(report.diagnostics.some((item) => item.kind === 'duplicate-story-id'))
  assert.ok(report.diagnostics.some((item) => item.anchor === 'F99-1'))
})

test('repository discovery is script-relative and reads the actual inventory without mutations', async () => {
  assert.equal(defaultAppRoot, fileURLToPath(new URL('../../../', import.meta.url)))
  const report = await loadReport()
  assert.ok(report.totals.stories > 0)
  assert.ok(report.tasks.length > 0)
  assert.ok(report.stories.every((item) => item.source.startsWith('.specs/user-stories/')))
  const taskFiles = await readdir(path.join(defaultAppRoot, '.tasks'), { recursive: true })
  assert.deepEqual(report.tasks.map((item) => item.source).sort(), taskFiles
    .filter((filename) => /^[A-Z]+-?\d+(?:-|\.).*\.md$/.test(path.basename(filename)))
    .map((filename) => `.tasks/${filename.replaceAll('\\', '/')}`).sort())
})

test('archived done tasks retain feature/story counts and evidence provenance', () => {
  const done = task('T01', 'State: done (bounded)\nSources: F42-1\nVerified stories: F42-1\nVerification evidence: abc123de')
  const inputs = { storyFiles: [story('F42-1')], taskFiles: [done, task('T02', 'State: active\nSources: F42-1')], adrFiles: [] }
  const before = buildReport(inputs)
  const archivedPath = '.tasks/tasks-done/T01-task.md'
  const after = buildReport({ ...inputs, taskFiles: [{ ...done, path: archivedPath }, inputs.taskFiles[1]] })
  assert.deepEqual(after.totals, before.totals)
  assert.deepEqual(after.scopes, before.scopes)
  assert.equal(after.tasks.find((item) => item.id === 'T01').source, archivedPath)
  assert.equal(after.stories[0].verificationClaims[0].source, archivedPath)
  assert.deepEqual(selectHierarchy(after, { feature: 'F42' }).linkedTasks.map((item) => item.id), ['T01', 'T02'])
})

test('teammate task prefixes are included when present in the checkout', () => {
  const report = buildReport({
    storyFiles: [story('F06-1')], taskFiles: [task('RES-01', 'State: done\nSources: F06-1')], adrFiles: [],
  })
  assert.equal(report.totals.tasks, 1)
  assert.deepEqual(report.stories[0].taskIds, ['RES-01'])
  assert.equal(report.totals.documentedVerified, 0)
  assert.match(report.interpretation, /remote branches are not inspected/)
})

test('hierarchy retains source categories, feature names and distinct child stories without inventing epics', () => {
  const specStory = (id, text) => ({ ...story(id, 'g-client'), text: `---\nid: ${id}\ncategory: G — Obsługa klienta\n---\n# ${id} · Triaż\n\n### Nazwa funkcjonalności\n\nTriaż intencji\n\n### User story\n\n${text}\n\n### Kryteria akceptacji\n\n1. Evidence` })
  const report = buildReport({
    storyFiles: [specStory('F42-1', 'Jako klient chcę przekazać pytanie.'), specStory('F42-2', 'Jako agent chcę zapisać wynik.')],
    taskFiles: [
      task('T15', 'State: done (bounded scaffold)\nSources: F42-1'),
      task('T16', 'State: done\nSources: F42-1'),
      task('T19', 'State: active\nSources: F42-1'),
      task('T30', 'State: blocked\nSources: F42-2'),
    ], adrFiles: [],
  })
  assert.deepEqual(report.hierarchy[0].categories, ['G — Obsługa klienta'])
  assert.deepEqual(report.hierarchy[0].epics, [])
  assert.equal(report.hierarchy[0].features[0].id, 'F42')
  assert.deepEqual(report.hierarchy[0].features[0].titles, ['Triaż intencji'])
  assert.equal(report.totals.storiesWithDoneTaskEvidence, 1)
  assert.equal(report.totals.featuresWithDoneTaskEvidence, 1)
  assert.equal(report.totals.linkedDoneTaskCount, 2)
  assert.deepEqual(report.domains[0].blockedTasks, ['T30'])
  assert.equal(report.stories[0].userStory, 'Jako klient chcę przekazać pytanie.')
  assert.equal(report.stories[0].taskEvidence[0].stateLabel, 'done (bounded scaffold)')
  assert.equal(report.totals.documentedVerified, 0)
  const selected = selectHierarchy(report, { story: 'F42-2' })
  assert.equal(selected.stories, 1)
  assert.equal(selected.storiesWithDoneTaskEvidence, 0)
  assert.deepEqual(selected.linkedTasks.map((entry) => entry.id), ['T30'])
  assert.match(formatDetails(selected), /T30=blocked/)
  assert.doesNotMatch(formatDetails(selected), /T15/)
})

test('teammate heading anchors are explicit fallback; DONE prose does not override active metadata', () => {
  const report = buildReport({
    storyFiles: [story('F06-1'), story('F06-2'), story('F07-1')],
    taskFiles: [task('RES-01', '# RES-01 — F06 source research\n\nState: active\nOwns: `agency_research/**`\n\n## Proof\nDONE all tests; next F07.')],
    adrFiles: [],
  })
  assert.deepEqual(report.tasks[0].storyIds, ['F06-1', 'F06-2'])
  assert.equal(report.tasks[0].state, 'active')
  assert.equal(report.tasks[0].mappingBasis, 'title-fallback')
  assert.equal(report.stories[0].mappingEvidence[0].kind, 'task-title')
  assert.equal(report.stories[0].mappingEvidence[0].line, 1)
  assert.equal(report.tasks[0].owns, '`agency_research/**`')
  assert.deepEqual(report.storiesWithoutTasks, ['F07-1'])
  assert.equal(report.totals.storiesWithDoneTaskEvidence, 0)
  assert.match(formatDetails(selectHierarchy(report, { feature: 'F06' })), /RES-01=active \[title link\]/)
})

test('filters keep exact feature boundaries, reject unknown IDs and conflicting options', () => {
  const report = buildReport({ storyFiles: [story('F01-1'), story('F10-1')], taskFiles: [], adrFiles: [] })
  assert.equal(selectHierarchy(report, { feature: 'F01' }).stories, 1)
  assert.throws(() => selectHierarchy(report, { feature: 'F99' }), /No canonical story/)
  assert.deepEqual(parseOptions(['--json', '--feature', 'F01']), { json: true, details: false, help: false, feature: 'F01' })
  assert.throws(() => parseOptions(['--story', 'F01']), /needs Fnn-n/)
  assert.throws(() => parseOptions(['--feature', 'F01', '--story', 'F01-1']), /not both/)
})
