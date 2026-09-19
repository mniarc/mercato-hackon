import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { buildInventorySnapshot, buildReport, extractReferences, formatReport, formatDetails, selectHierarchy, parseOptions, loadReport, defaultAppRoot, renderHtmlReport } from '../index.mjs'

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
  assert.equal(defaultAppRoot, fileURLToPath(new URL('../../../../', import.meta.url)))
  const report = await loadReport()
  assert.ok(report.totals.stories > 0)
  assert.ok(report.tasks.length > 0)
  assert.equal(report.assessmentSources.length, 53)
  assert.ok(report.assessmentSources.every((source) => /^\.dev-docs\/coverage\/assessments\/F\d{2}\.json$/.test(source)))
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
  assert.deepEqual(parseOptions(['--json', '--feature', 'F01']), { json: true, details: false, help: false, html: null, refresh: false, feature: 'F01' })
  assert.equal(parseOptions(['--html']).html, true)
  assert.equal(parseOptions(['--html', 'custom.html']).html, 'custom.html')
  assert.throws(() => parseOptions(['--html', '--json']), /on its own/)
  assert.equal(parseOptions(['--refresh']).refresh, true)
  assert.throws(() => parseOptions(['--refresh', '--story', 'F01-1']), /on its own/)
  assert.throws(() => parseOptions(['--story', 'F01']), /needs Fnn-n/)
  assert.throws(() => parseOptions(['--feature', 'F01', '--story', 'F01-1']), /not both/)
})

const criteriaStory = (id) => ({ ...story(id), text: `# ${id}\n\n### Kryteria akceptacji\n\n1. Authorized input.\n2. Preserve the exact result.\n\n### Other section\n1. Not an acceptance criterion.` })
const coverage = (stories) => ({ path: `.dev-docs/coverage/assessments/${stories[0].id.split('-')[0]}.json`, text: JSON.stringify({ version: 1, stories }) })
const assessed = (id, implementation = 'implemented', overrides = {}) => ({
  id, implementation, evidence: [{ path: 'ai-company/actual-service.ts', note: 'Scoped implementation; focused check recorded passed.' }],
  missing: [], verification: { focused: 'passed', nativeApp: 'not_run', liveModel: 'not_run' }, externalDecision: [], ...overrides,
})

test('canonical AC assessments separate implementation from native and paid model proof', () => {
  const report = buildReport({
    storyFiles: [criteriaStory('F20-1'), criteriaStory('F34-1')],
    taskFiles: [task('T01', 'State: done\nSources: F34-1')], adrFiles: [],
    coverageFiles: [coverage([{ id: 'F20-1', criteria: [assessed('AC1'), assessed('AC2')] }])],
  })
  assert.equal(report.stories[0].implementation, 'implemented')
  assert.deepEqual(report.stories[0].criteria.map((item) => item.id), ['AC1', 'AC2'])
  assert.equal(report.stories[0].criteria[0].line, 5)
  assert.equal(report.stories[1].implementation, 'unassessed')
  assert.equal(report.stories[1].scope, 'proposal')
  assert.equal(report.totals.coverage.criteria.total, 4)
  assert.equal(report.totals.coverage.verification.focused.passed, 2)
  assert.equal(report.totals.coverage.verification.nativeApp.passed, 0)
  assert.equal(report.totals.coverage.verification.liveModel.passed, 0)
  assert.equal(report.totals.documentedVerified, 0)
  assert.match(formatDetails(selectHierarchy(report, { story: 'F20-1' })), /AC1: implemented; focused=passed, nativeApp=not_run, liveModel=not_run/)
})

test('partial ACs and external decisions remain explicit without task-derived completion', () => {
  const report = buildReport({
    storyFiles: [criteriaStory('F34-1')], taskFiles: [task('T01', 'State: done\nSources: F34-1')], adrFiles: [],
    coverageFiles: [coverage([{ id: 'F34-1', criteria: [assessed('AC1'), assessed('AC2', 'partial', {
      missing: ['Actual configured destination'], externalDecision: ['Approved publication provider'],
      verification: { nativeApp: 'passed' },
    })] }])],
  })
  assert.equal(report.stories[0].implementation, 'partial')
  assert.equal(report.scopes.proposal.coverage.stories.partial, 1)
  assert.equal(report.totals.coverage.criteriaWithExternalDecisions, 1)
  assert.equal(report.stories[0].criteria[1].verification.liveModel, 'unknown')
  assert.match(formatDetails(selectHierarchy(report)), /External decision: Approved publication provider/)
})

test('invalid, duplicate or absent AC evidence cannot become implementation claims', () => {
  const report = buildReport({
    storyFiles: [criteriaStory('F20-1')], taskFiles: [], adrFiles: [],
    coverageFiles: [coverage([{ id: 'F20-1', criteria: [assessed('AC1'), assessed('AC1'), assessed('AC2', 'implemented', { evidence: [] }), assessed('AC99')] },
      { id: 'F99-1', criteria: [] }]), { path: '.dev-docs/coverage/assessments/bad.json', text: '{' }],
  })
  assert.equal(report.stories[0].implementation, 'unassessed')
  assert.equal(report.totals.coverage.verification.focused.passed, 0)
  for (const kind of ['duplicate-coverage-criterion', 'invalid-coverage-assessment', 'invalid-coverage-criterion', 'invalid-coverage-story', 'invalid-coverage-json']) {
    assert.ok(report.diagnostics.some((item) => item.kind === kind), kind)
  }
})

test('assessment files own exactly one matching feature', () => {
  const report = buildReport({
    storyFiles: [criteriaStory('F20-1'), criteriaStory('F34-1')], taskFiles: [], adrFiles: [],
    coverageFiles: [{ path: '.dev-docs/coverage/assessments/F20.json', text: JSON.stringify({ version: 1, stories: [
      { id: 'F34-1', criteria: [assessed('AC1'), assessed('AC2')] },
    ] }) }],
  })
  assert.equal(report.stories.find((story) => story.id === 'F34-1').implementation, 'unassessed')
  assert.ok(report.assessmentDiagnostics.some((item) => item.kind === 'misplaced-coverage-story' && item.anchor === 'F34-1'))
})

test('HTML report escapes repository content and never embeds raw report data in script', () => {
  const hostile = '</script><img src=x onerror="alert(1)"> & content'
  const report = buildReport({
    storyFiles: [{ ...criteriaStory('F20-1'), text: `# ${hostile}\n\n### User story\n\n${hostile}\n\n### Kryteria akceptacji\n\n1. ${hostile}` }],
    taskFiles: [], adrFiles: [], coverageFiles: [],
  })
  const html = renderHtmlReport(report, { appRoot: '/repo', outputPath: '/repo/.dev-docs/coverage/generated-report.html' })
  assert.doesNotMatch(html, /<img src=x/)
  assert.doesNotMatch(html, /<\/script><img/)
  assert.match(html, /&lt;\/script&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; content/)
})

test('HTML summary keeps settled and proposed source counts separate from proof and task counts', () => {
  const report = buildReport({
    storyFiles: [criteriaStory('F20-1'), criteriaStory('F34-1')],
    taskFiles: [task('T01', 'State: done\nSources: F20-1, F34-1')], adrFiles: [],
    coverageFiles: [coverage([{ id: 'F20-1', criteria: [assessed('AC1'), assessed('AC2', 'partial')] }])],
  })
  const html = renderHtmlReport(report, { appRoot: '/repo', outputPath: '/repo/.dev-docs/coverage/generated-report.html' })
  assert.match(html, /Settled scope[\s\S]*?1 <small>stories<\/small>[\s\S]*?Implemented <strong data-count="0">0<\/strong>[\s\S]*?Partial <strong data-count="1">1<\/strong>/)
  assert.match(html, /Proposed scope[\s\S]*?not automatically missing work[\s\S]*?1 <small>stories<\/small>[\s\S]*?Unassessed <strong data-count="1">1<\/strong>/)
  assert.match(html, /linked or done task is not story completeness/i)
  assert.doesNotMatch(html, /product completion percentage/i)
  assert.match(html, /Manual assessment inputs:[\s\S]*?\.dev-docs\/coverage\/assessments\/FNN\.json[\s\S]*?1 feature files; edit these/)
  assert.match(html, /\.dev-docs\/coverage\/generated-report\.html[\s\S]*?refresh; do not edit/)
  assert.match(html, /node scripts\/agency-spec-progress\.mjs --refresh/)
})

test('machine inventory is deterministic and excludes every manual assessment field', () => {
  const report = buildReport({
    storyFiles: [criteriaStory('F20-1')],
    taskFiles: [{ ...task('T01', 'State: done\nSources: F20-1'), path: '.tasks/tasks-done/T01-task.md' }],
    adrFiles: [], coverageFiles: [coverage([{ id: 'F20-1', criteria: [assessed('AC1'), assessed('AC2', 'partial', {
      missing: ['Manual gap'], externalDecision: ['Manual decision'],
    })] }])],
  })
  const first = buildInventorySnapshot(report)
  assert.equal(JSON.stringify(first), JSON.stringify(buildInventorySnapshot(report)))
  assert.equal(first.tasks[0].source, '.tasks/tasks-done/T01-task.md')
  assert.deepEqual(first.hierarchy[0].features[0].children[0].criteria.map((item) => item.id), ['AC1', 'AC2'])
  const forbidden = new Set(['implementation', 'evidence', 'missing', 'verification', 'externalDecision', 'assessmentSource'])
  const keys = []
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) { keys.push(key); visit(child) }
  }
  visit(first)
  assert.deepEqual(keys.filter((key) => forbidden.has(key)), [])
})
