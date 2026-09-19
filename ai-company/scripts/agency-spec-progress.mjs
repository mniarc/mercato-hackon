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

function headingSection(text, heading) {
  return text.match(new RegExp(`^### ${heading}\\s*\\r?\\n([\\s\\S]*?)(?=^#{1,3} |$(?![\\s\\S]))`, 'm'))?.[1].trim() ?? null
}

function storyTaxonomy(file, id) {
  const frontmatter = file.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
  const scalar = (key) => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim().replace(/^['"]|['"]$/g, '') ?? null
  return {
    featureId: id.split('-')[0],
    featureTitle: headingSection(file.text, 'Nazwa funkcjonalności'),
    category: scalar('category') ?? headingSection(file.text, 'Grupa'),
    epic: scalar('epic') ?? scalar('epic_id'),
    title: file.text.match(/^# (.+)$/m)?.[1].trim() ?? id,
    userStory: headingSection(file.text, 'User story'),
    scopeStatus: headingSection(file.text, 'Status ustalenia'),
    processSteps: headingSection(file.text, 'Krok procesu'),
  }
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
      ...storyTaxonomy(file, id),
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
    const headingIndex = file.text.split(/\r?\n/).findIndex((line) => /^# /.test(line))
    const title = headingIndex >= 0 ? file.text.split(/\r?\n/)[headingIndex].slice(2).trim() : id
    const explicitSources = metadata(file.text, 'Sources')
    const sourceField = explicitSources ?? { text: title, line: headingIndex + 1 }
    const references = extractReferences(sourceField?.text ?? '', canonicalIds)
    diagnostics.push(...referenceDiagnostics(references, source, sourceField?.line))
    if (!stateField) diagnostics.push({ kind: 'missing-task-state', source })
    const task = {
      id, title, source, state, stateLabel: stateField?.text ?? 'unknown', stateLine: stateField?.line ?? null,
      owns: metadata(file.text, 'Owns')?.text ?? null,
      taskGroup: id.match(/^[A-Z]+/)[0],
      mappingBasis: explicitSources ? 'sources' : 'title-fallback', storyIds: references.ids,
      adrIds: sortIds([...file.text.matchAll(/\bADR-(\d{3})\b/g)].map((match) => `ADR-${match[1]}`)),
    }
    tasks.push(task)
    for (const storyId of references.ids) {
      const story = storiesById.get(storyId)
      story.taskIds.push(id)
      story.mappingEvidence.push({ kind: explicitSources ? 'task-source' : 'task-title', id, source, line: sourceField.line, text: sourceField.text })
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
    const linkedTasks = tasks.filter((task) => story.taskIds.includes(task.id))
    return {
      ...story, taskIds: sortIds(story.taskIds), adrIds: sortIds(story.adrIds),
      taskEvidence: linkedTasks.map(({ storyIds, adrIds, ...task }) => task),
      doneTaskIds: sortIds(linkedTasks.filter((task) => task.state === 'done').map((task) => task.id)),
      acceptance: story.verificationClaims.length ? 'documented-verified-claim' : 'unassessed',
    }
  })
  const summarize = (subset) => {
    const mapped = subset.filter((story) => story.mappingEvidence.length).length
    const linkedTasks = tasks.filter((task) => subset.some((story) => story.taskIds.includes(task.id)))
    return {
      stories: subset.length, mapped, mappedPercent: percentage(mapped, subset.length),
      features: new Set(subset.map((story) => story.featureId)).size,
      featuresWithDoneTaskEvidence: new Set(subset.filter((story) => story.doneTaskIds.length).map((story) => story.featureId)).size,
      taskLinked: subset.filter((story) => story.taskIds.length).length,
      storiesWithDoneTaskEvidence: subset.filter((story) => story.doneTaskIds.length).length,
      linkedTaskCount: linkedTasks.length,
      linkedDoneTaskCount: linkedTasks.filter((task) => task.state === 'done').length,
      documentedVerified: subset.filter((story) => story.verificationClaims.length).length,
      unassessed: subset.filter((story) => !story.verificationClaims.length).length,
      activeTasks: sortIds(linkedTasks.filter((task) => task.state === 'active').map((task) => task.id)),
      readyTasks: sortIds(linkedTasks.filter((task) => task.state === 'ready').map((task) => task.id)),
      blockedTasks: sortIds(linkedTasks.filter((task) => task.state === 'blocked').map((task) => task.id)),
      otherRemainingTasks: sortIds(linkedTasks.filter((task) => !['done', 'active', 'ready', 'blocked'].includes(task.state)).map((task) => task.id)),
    }
  }
  const hierarchy = sortIds(stories.map((story) => story.domain)).map((domain) => {
    const children = stories.filter((story) => story.domain === domain)
    const categories = sortIds(children.map((story) => story.category).filter(Boolean))
    const epics = sortIds(children.map((story) => story.epic).filter(Boolean))
    return {
      domain, categories, epics, ...summarize(children),
      features: sortIds(children.map((story) => story.featureId)).map((featureId) => {
        const featureStories = children.filter((story) => story.featureId === featureId)
        const titles = sortIds(featureStories.map((story) => story.featureTitle).filter(Boolean))
        return {
          id: featureId, titles, ...summarize(featureStories),
          children: featureStories,
        }
      }),
    }
  })
  const done = tasks.filter((task) => task.state === 'done').length
  return {
    interpretation: 'Current checkout documentation inventory, including uncommitted files; remote branches are not inspected. This is not a live acceptance audit. Mapped stories and done tasks do not measure product completion, effort, or demo readiness. Done-task evidence means some associated task was recorded done, not that its story is implemented in full. Unassessed is not proof of missing functionality. Verification claims require an explicit exact-story list on a done task and linked/commit evidence; evidence is not executed or independently audited. Hierarchy uses source category/domain, optional explicit epic, feature IDs and canonical child story IDs; no synthetic epics. Task links use Sources, or an explicitly labeled heading fallback when Sources is absent.',
    totals: { ...summarize(stories), tasks: tasks.length, doneTasks: done, doneTasksPercent: percentage(done, tasks.length) },
    scopes: Object.fromEntries(['settled', 'proposal'].map((scope) => [scope, summarize(stories.filter((story) => story.scope === scope))])),
    domains: sortIds(stories.map((story) => story.domain)).map((domain) => ({ domain, ...summarize(stories.filter((story) => story.domain === domain)) })),
    hierarchy,
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
    `Spec taxonomy: ${report.domains.length} source domains / ${total.features} features / ${total.stories} child stories.`,
    `Story mapping: ${total.mapped}/${total.stories} (${total.mappedPercent ?? 'n/a'}%); task-linked: ${total.taskLinked}/${total.stories}.`,
    `Done tasks: ${total.doneTasks}/${total.tasks} (${total.doneTasksPercent ?? 'n/a'}% of recorded tasks, including tasks-done archive and bounded/scaffold work).`,
    `Full-story verified claims: ${total.documentedVerified}; unassessed: ${total.unassessed}. Claims are not live-audited.`,
    `Task-level delivery evidence: ${total.storiesWithDoneTaskEvidence}/${total.stories} stories across ${total.featuresWithDoneTaskEvidence}/${total.features} features have a linked done task; not full-story completion.`,
    `Scope: ${report.scopes.settled.stories} settled stories; ${report.scopes.proposal.stories} proposal stories (F34-F39).`,
    '',
    'Domain | Features | Stories with done task / all | Verified claims | Active / ready / blocked tasks',
    ...report.domains.map((domain) => `${domain.domain} | ${domain.features} | ${domain.storiesWithDoneTaskEvidence}/${domain.stories} | ${domain.documentedVerified} | ${domain.activeTasks.join(', ') || '-'} / ${domain.readyTasks.join(', ') || '-'} / ${domain.blockedTasks.join(', ') || '-'}`),
    '',
    `Unmapped stories: ${report.unmappedStories.join(', ') || 'none'}`,
    `Stories without task links: ${report.storiesWithoutTasks.join(', ') || 'none'}`,
    `Tasks without story links (may be tooling/research): ${report.tasksWithoutStories.join(', ') || 'none'}`,
    `Diagnostics: ${report.diagnostics.length}`,
    ...report.diagnostics.map((item) => `  ${item.kind}: ${item.source ?? item.id ?? ''}${item.line ? `:${item.line}` : ''} ${item.anchor ?? ''}`.trimEnd()),
    '',
    'Use --details, --feature F42, or --story F42-1 for spec hierarchy and task states; --json includes provenance.',
    'Mapping is not completion; unassessed is not proven absent. No weighted product percentage is inferred.',
  ]
  return lines.join('\n')
}

export function selectHierarchy(report, { feature, story } = {}) {
  if (feature && story) throw new Error('Choose --feature or --story, not both.')
  const hierarchy = report.hierarchy.map((domain) => ({
    domain: domain.domain, categories: domain.categories, epics: domain.epics,
    features: domain.features.filter((entry) => !feature || entry.id === feature).map((entry) => ({
      id: entry.id, titles: entry.titles,
      children: entry.children.filter((child) => !story || child.id === story),
    })).filter((entry) => entry.children.length),
  })).filter((domain) => domain.features.length)
  const children = hierarchy.flatMap((domain) => domain.features.flatMap((entry) => entry.children))
  if ((feature || story) && !children.length) throw new Error(`No canonical story matches ${feature ?? story}.`)
  const taskIds = new Set(children.flatMap((child) => child.taskIds))
  return {
    selection: feature ?? story ?? 'all', interpretation: report.interpretation,
    stories: children.length,
    storiesWithDoneTaskEvidence: children.filter((child) => child.doneTaskIds.length).length,
    documentedVerified: children.filter((child) => child.verificationClaims.length).length,
    unassessed: children.filter((child) => !child.verificationClaims.length).length,
    linkedTasks: report.tasks.filter((task) => taskIds.has(task.id)),
    hierarchy,
  }
}

export function formatDetails(selection) {
  const lines = [
    `Spec hierarchy: ${selection.selection} (current checkout; not a live acceptance audit)`,
    `Done-task evidence: ${selection.storiesWithDoneTaskEvidence}/${selection.stories} child stories; verified claims: ${selection.documentedVerified}/${selection.stories}; unassessed: ${selection.unassessed}.`,
    'A linked done task is partial/task-level delivery evidence, not full story completion. Source category is the domain; epics appear only if explicitly recorded.',
    '',
  ]
  for (const domain of selection.hierarchy) {
    lines.push(`${domain.categories.join(' / ') || domain.domain} [${domain.domain}]${domain.epics.length ? `; epic: ${domain.epics.join(' / ')}` : ''}`)
    for (const feature of domain.features) {
      const doneCount = feature.children.filter((child) => child.doneTaskIds.length).length
      const verifiedCount = feature.children.filter((child) => child.verificationClaims.length).length
      lines.push(`  ${feature.id}${feature.titles.length ? ` — ${feature.titles.join(' / ')}` : ''}: done-task evidence ${doneCount}/${feature.children.length}; verified claims ${verifiedCount}/${feature.children.length}`)
      for (const child of feature.children) {
        lines.push(`    ${child.id} [${child.scope}; ${child.doneTaskIds.length ? 'done-task evidence' : 'no done-task evidence'}; acceptance ${child.acceptance}]`)
        if (child.userStory) lines.push(`      ${child.userStory.replace(/\s+/g, ' ')}`)
        lines.push(`      Tasks: ${child.taskEvidence.map((task) => `${task.id}=${task.stateLabel}${task.mappingBasis === 'title-fallback' ? ' [title link]' : ''}`).join('; ') || 'none'}`)
        lines.push(`      Spec: ${child.source}`)
        for (const claim of child.verificationClaims) lines.push(`      Verification claim: ${claim.source}:${claim.line} → ${claim.evidence}`)
      }
    }
  }
  if (selection.selection !== 'all') {
    lines.push('', 'Linked task records (their own scope and state, not story-wide acceptance):')
    for (const task of selection.linkedTasks) {
      lines.push(`  ${task.id}: ${task.stateLabel} — ${task.title}`)
      lines.push(`    ${task.source}${task.stateLine ? `:${task.stateLine}` : ''}; mapping: ${task.mappingBasis}`)
    }
  }
  return lines.join('\n')
}

export function parseOptions(args) {
  const options = { json: false, details: false, help: false }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (['--json', '--details', '--help'].includes(arg)) options[arg.slice(2)] = true
    else if (arg === '--feature' || arg === '--story') {
      const value = args[++index]
      const pattern = arg === '--feature' ? /^F\d{2}$/ : /^F\d{2}-\d+$/
      if (!value || !pattern.test(value)) throw new Error(`${arg} needs ${arg === '--feature' ? 'Fnn' : 'Fnn-n'}.`)
      options[arg.slice(2)] = value
    } else throw new Error(`Unknown option ${arg}. Use --help.`)
  }
  if (options.feature && options.story) throw new Error('Choose --feature or --story, not both.')
  return options
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) {
      console.log('Usage: node <path>/agency-spec-progress.mjs [--json] [--details | --feature Fnn | --story Fnn-n]\nReads the App repository relative to this script, independent of cwd; writes no files.\nDefault: domain overview. Details: source category → feature → story, linked task states and acceptance evidence.\nDone task evidence is not story completion. Task links use Sources or an explicitly labeled title fallback.\nOptional done-task metadata: Verified stories: F42-1\nVerification evidence: [check or run evidence](relative-path-or-URL) or a commit hash.\nUse exact story IDs for verification; family anchors are mapping only. Ranges are reported, never expanded.')
    } else {
      const report = await loadReport()
      const focused = options.feature || options.story
      if (options.json) console.log(JSON.stringify(focused ? selectHierarchy(report, options) : report, null, 2))
      else console.log(focused || options.details ? formatDetails(selectHierarchy(report, options)) : formatReport(report))
    }
  } catch (error) {
    console.error(`Cannot read spec progress: ${error.message}`)
    process.exitCode = 1
  }
}
