import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildReport, extractReferences, formatReport, loadReport, defaultAppRoot } from '../agency-spec-progress.mjs'

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
