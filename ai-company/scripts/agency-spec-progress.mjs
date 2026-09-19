import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const defaultAppRoot = fileURLToPath(new URL('../../', import.meta.url))
const sortIds = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
const percentage = (count, total) => total ? Math.round(count / total * 1000) / 10 : null
const normalizedPath = (value) => value.replaceAll('\\', '/')

export function extractReferences(text, canonicalIds, { exactOnly = false } = {}) {
  const known = new Set(canonicalIds)
  const ignoredRanges = []
  const withoutRanges = text.replace(/\bF\d+(?:-\d+)?\s*[-–—]\s*F\d+(?:-\d+)?\b/g, (range) => {
    ignoredRanges.push(range)
    return ' '.repeat(range.length)
  })
  const ids = new Set()
  const invalid = new Set()
  for (const match of withoutRanges.matchAll(/(?<![\w-])F\d+(?:-\d+)?(?![\w-])/g)) {
    const anchor = match[0]
    if (known.has(anchor)) ids.add(anchor)
    else if (!exactOnly && /^F\d{2}$/.test(anchor)) {
      const children = [...known].filter((id) => id.startsWith(`${anchor}-`))
      if (!children.length) invalid.add(anchor)
      for (const id of children) ids.add(id)
    } else invalid.add(anchor)
  }
  return { ids: sortIds(ids), invalid: sortIds(invalid), ignoredRanges: sortIds(ignoredRanges) }
}

function metadata(text, name) {
  const lines = text.split(/\r?\n/)
  const index = lines.findIndex((line) => line.startsWith(`${name}:`))
  if (index < 0) return null
  const value = [lines[index].slice(name.length + 1).trim()]
  for (let next = index + 1; next < lines.length; next++) {
    if (!lines[next].trim() || /^[#|]|^[\w ]+:/.test(lines[next])) break
    value.push(lines[next].trim())
  }
  return { text: value.join(' '), line: index + 1 }
}

function referenceDiagnostics(reference, source, line) {
  return [
    ...reference.invalid.map((anchor) => ({ kind: 'invalid-story-reference', source, line, anchor })),
    ...reference.ignoredRanges.map((anchor) => ({ kind: 'unexpanded-range', source, line, anchor })),
  ]
}

export function buildReport({ storyFiles, taskFiles, adrFiles }) {
  const diagnostics = []
  const storiesById = new Map()
  for (const file of storyFiles) {
    const source = normalizedPath(file.path)
    const id = path.posix.basename(source, '.md')
    if (!/^F\d{2}-\d+$/.test(id)) continue
    if (storiesById.has(id)) {
      diagnostics.push({ kind: 'duplicate-story-id', id, sources: [storiesById.get(id).source, source] })
      continue
    }
    const family = Number(id.slice(1, 3))
    storiesById.set(id, {
      id, source, domain: path.posix.basename(path.posix.dirname(source)),
      scope: family >= 34 && family <= 39 ? 'proposal' : 'settled',
      taskIds: [], adrIds: [], mappingEvidence: [], verificationClaims: [],
    })
  }
  const canonicalIds = sortIds(storiesById.keys())
  if (!canonicalIds.length) diagnostics.push({ kind: 'no-canonical-stories' })
  const tasks = []
  for (const file of taskFiles) {
    const source = normalizedPath(file.path)
    const id = path.posix.basename(source).match(/^([A-Z]+-?\d+)(?:-|\.)/)?.[1]
    if (!id) continue
    const stateField = metadata(file.text, 'State')
    const state = stateField?.text.match(/^([a-z-]+)/i)?.[1].toLowerCase() ?? 'unknown'
    const sourceField = metadata(file.text, 'Sources')
    const references = extractReferences(sourceField?.text ?? '', canonicalIds)
    diagnostics.push(...referenceDiagnostics(references, source, sourceField?.line))
    if (!stateField) diagnostics.push({ kind: 'missing-task-state', source })
    const task = {
      id, source, state, stateLabel: stateField?.text ?? 'unknown', storyIds: references.ids,
      adrIds: sortIds([...file.text.matchAll(/\bADR-(\d{3})\b/g)].map((match) => `ADR-${match[1]}`)),
    }
    tasks.push(task)
    for (const storyId of references.ids) {
      const story = storiesById.get(storyId)
      story.taskIds.push(id)
      story.mappingEvidence.push({ kind: 'task-source', id, source, line: sourceField.line, text: sourceField.text })
    }
    const verified = metadata(file.text, 'Verified stories')
    if (!verified) continue
    const claimed = extractReferences(verified.text, canonicalIds, { exactOnly: true })
    diagnostics.push(...referenceDiagnostics(claimed, source, verified.line))
    const evidence = metadata(file.text, 'Verification evidence')
    const traceable = evidence && /\[[^\]]+\]\([^)]+\)|\b[0-9a-f]{7,40}\b/i.test(evidence.text)
    if (!traceable) diagnostics.push({ kind: 'missing-verification-evidence', source, line: verified.line, storyIds: claimed.ids })
    if (state !== 'done') diagnostics.push({ kind: 'verification-on-unfinished-task', source, line: verified.line, storyIds: claimed.ids })
    if (!traceable || state !== 'done') continue
    for (const storyId of claimed.ids) {
      storiesById.get(storyId).verificationClaims.push({ taskId: id, source, line: verified.line, evidence: evidence.text, evidenceLine: evidence.line })
    }
  }
  for (const file of adrFiles) {
    const source = normalizedPath(file.path)
    const number = path.posix.basename(source).match(/^(\d{3})-/)?.[1]
    if (!number) continue
    const id = `ADR-${number}`
    file.text.split(/\r?\n/).forEach((line, index) => {
      const references = extractReferences(line, canonicalIds)
      diagnostics.push(...referenceDiagnostics(references, source, index + 1))
      for (const storyId of references.ids) {
        const story = storiesById.get(storyId)
        story.adrIds.push(id)
        story.mappingEvidence.push({ kind: 'adr-reference', id, source, line: index + 1, text: line.trim() })
      }
    })
  }
  const stories = canonicalIds.map((id) => {
    const story = storiesById.get(id)
    return { ...story, taskIds: sortIds(story.taskIds), adrIds: sortIds(story.adrIds), acceptance: story.verificationClaims.length ? 'documented-verified-claim' : 'unassessed' }
  })
  const summarize = (subset) => {
    const mapped = subset.filter((story) => story.mappingEvidence.length).length
    const linkedTasks = tasks.filter((task) => subset.some((story) => story.taskIds.includes(task.id)))
    return {
      stories: subset.length, mapped, mappedPercent: percentage(mapped, subset.length),
      taskLinked: subset.filter((story) => story.taskIds.length).length,
      documentedVerified: subset.filter((story) => story.verificationClaims.length).length,
      unassessed: subset.filter((story) => !story.verificationClaims.length).length,
      activeTasks: sortIds(linkedTasks.filter((task) => task.state === 'active').map((task) => task.id)),
      readyTasks: sortIds(linkedTasks.filter((task) => task.state === 'ready').map((task) => task.id)),
      otherRemainingTasks: sortIds(linkedTasks.filter((task) => !['done', 'active', 'ready'].includes(task.state)).map((task) => task.id)),
    }
  }
  const done = tasks.filter((task) => task.state === 'done').length
  return {
    interpretation: 'Current checkout documentation inventory, including uncommitted files; remote branches are not inspected. This is not a live acceptance audit. Mapped stories and done tasks do not measure product completion, effort, or demo readiness. Unassessed is not proof of missing functionality. Verification claims require an explicit exact-story list on a done task and linked/commit evidence; evidence is not executed or independently audited.',
    totals: { ...summarize(stories), tasks: tasks.length, doneTasks: done, doneTasksPercent: percentage(done, tasks.length) },
    scopes: Object.fromEntries(['settled', 'proposal'].map((scope) => [scope, summarize(stories.filter((story) => story.scope === scope))])),
    domains: sortIds(stories.map((story) => story.domain)).map((domain) => ({ domain, ...summarize(stories.filter((story) => story.domain === domain)) })),
    unmappedStories: stories.filter((story) => !story.mappingEvidence.length).map((story) => story.id),
    storiesWithoutTasks: stories.filter((story) => !story.taskIds.length).map((story) => story.id),
    tasksWithoutStories: tasks.filter((task) => !task.storyIds.length).map((task) => task.id),
    stories, tasks, diagnostics,
  }
}

async function markdownFiles(directory, root) {
  const files = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await markdownFiles(filename, root))
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push({ path: normalizedPath(path.relative(root, filename)), text: await readFile(filename, 'utf8') })
  }
  return files
}

export async function loadReport(appRoot = defaultAppRoot) {
  const [storyFiles, taskFiles, adrFiles] = await Promise.all([
    markdownFiles(path.join(appRoot, '.specs', 'user-stories'), appRoot),
    markdownFiles(path.join(appRoot, '.tasks'), appRoot),
    markdownFiles(path.join(appRoot, '.dev-docs', 'adr'), appRoot),
  ])
  return buildReport({ storyFiles, taskFiles, adrFiles })
}

export function formatReport(report) {
  const total = report.totals
  const lines = [
    'Agency spec progress (current checkout, including uncommitted files; no remote branch scan)',
    'Documentation-derived; not product-completion %.',
    `Story mapping: ${total.mapped}/${total.stories} (${total.mappedPercent ?? 'n/a'}%); task-linked: ${total.taskLinked}/${total.stories}.`,
    `Done tasks: ${total.doneTasks}/${total.tasks} (${total.doneTasksPercent ?? 'n/a'}% of recorded tasks, including bounded/scaffold work).`,
    `Full-story verified claims: ${total.documentedVerified}; unassessed: ${total.unassessed}. Claims are not live-audited.`,
    `Scope: ${report.scopes.settled.stories} settled stories; ${report.scopes.proposal.stories} proposal stories (F34-F39).`,
    '',
    'Domain | Stories | Mapped | Verified claims | Active / ready tasks',
    ...report.domains.map((domain) => `${domain.domain} | ${domain.stories} | ${domain.mapped} | ${domain.documentedVerified} | ${domain.activeTasks.join(', ') || '-'} / ${domain.readyTasks.join(', ') || '-'}`),
    '',
    `Unmapped stories: ${report.unmappedStories.join(', ') || 'none'}`,
    `Stories without task Sources links: ${report.storiesWithoutTasks.join(', ') || 'none'}`,
    `Tasks without story Sources links (may be tooling/research): ${report.tasksWithoutStories.join(', ') || 'none'}`,
    `Diagnostics: ${report.diagnostics.length}`,
    ...report.diagnostics.map((item) => `  ${item.kind}: ${item.source ?? item.id ?? ''}${item.line ? `:${item.line}` : ''} ${item.anchor ?? ''}`.trimEnd()),
    '',
    'Use --json for exact story/task/ADR source paths, line numbers, evidence, and scope subtotals.',
    'Mapping is not completion; unassessed is not proven absent. No weighted product percentage is inferred.',
  ]
  return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log('Usage: node <path>/agency-spec-progress.mjs [--json]\nReads the App repository relative to this script, independent of cwd; writes no files.\nOptional done-task metadata: Verified stories: F42-1\nVerification evidence: [check or run evidence](relative-path-or-URL) or a commit hash.\nUse exact story IDs for verification; family anchors are mapping only. Ranges are reported, never expanded.')
  } else if (args.some((arg) => arg !== '--json')) {
    console.error('Unknown option. Use --help.')
    process.exitCode = 1
  } else {
    try {
      const report = await loadReport()
      console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report))
    } catch (error) {
      console.error(`Cannot read spec progress: ${error.message}`)
      process.exitCode = 1
    }
  }
}
