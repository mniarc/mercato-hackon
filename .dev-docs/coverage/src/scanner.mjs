import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyAssessments, loadAssessmentFiles, summarizeCoverage } from './assessments.mjs'

export const defaultAppRoot = fileURLToPath(new URL('../../../', import.meta.url))
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

function acceptanceCriteria(text) {
  const section = headingSection(text, 'Kryteria akceptacji')
  if (!section) return []
  const offset = text.indexOf(section)
  return [...section.matchAll(/^(\d+)\.\s+(.+)$/gm)].map((match) => ({
    id: `AC${match[1]}`, text: match[2].trim(),
    line: text.slice(0, offset + match.index).split('\n').length,
  }))
}

export function buildReport({ storyFiles, taskFiles, adrFiles, coverageFiles = [] }) {
  const diagnostics = []
  const assessmentDiagnostics = []
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
      taskIds: [], adrIds: [], mappingEvidence: [], verificationClaims: [], criteria: acceptanceCriteria(file.text),
    })
  }
  applyAssessments(storiesById, coverageFiles, assessmentDiagnostics, normalizedPath)
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
      coverage: summarizeCoverage(subset),
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
    interpretation: 'Current checkout documentation inventory, including uncommitted files; remote branches are not inspected. This is not a live acceptance audit. Coverage inputs assess canonical acceptance criteria independently of task states. Story implementation is implemented only when every criterion is recorded implemented; mixed or incomplete evidence is partial, and absent assessment is unassessed. Implementation, focused checks, native-app/fixture proof, live-model proof and missing external decisions are separate dimensions. No paid call is required to classify implementation; passed verification is a recorded claim, not executed or independently audited here. Mapped stories and done tasks do not measure product completion, effort, or demo readiness. Done-task evidence means some associated task was recorded done, not that its story is implemented in full. Unassessed is not proof of missing functionality. Legacy verification claims require an explicit exact-story list on a done task and linked/commit evidence. Hierarchy uses source category/domain, optional explicit epic, feature IDs and canonical child story IDs; no synthetic epics. Task links use Sources, or an explicitly labeled heading fallback when Sources is absent.',
    assessmentSources: coverageFiles.map((file) => normalizedPath(file.path)).sort(),
    totals: { ...summarize(stories), tasks: tasks.length, doneTasks: done, doneTasksPercent: percentage(done, tasks.length) },
    scopes: Object.fromEntries(['settled', 'proposal'].map((scope) => [scope, summarize(stories.filter((story) => story.scope === scope))])),
    domains: sortIds(stories.map((story) => story.domain)).map((domain) => ({ domain, ...summarize(stories.filter((story) => story.domain === domain)) })),
    hierarchy,
    unmappedStories: stories.filter((story) => !story.mappingEvidence.length).map((story) => story.id),
    storiesWithoutTasks: stories.filter((story) => !story.taskIds.length).map((story) => story.id),
    tasksWithoutStories: tasks.filter((task) => !task.storyIds.length).map((task) => task.id),
    stories, tasks,
    inventoryDiagnostics: diagnostics,
    assessmentDiagnostics,
    diagnostics: [...diagnostics, ...assessmentDiagnostics],
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
  const [storyFiles, taskFiles, adrFiles, coverageFiles] = await Promise.all([
    markdownFiles(path.join(appRoot, '.specs', 'user-stories'), appRoot),
    markdownFiles(path.join(appRoot, '.tasks'), appRoot),
    markdownFiles(path.join(appRoot, '.dev-docs', 'adr'), appRoot),
    loadAssessmentFiles(appRoot, normalizedPath),
  ])
  return buildReport({ storyFiles, taskFiles, adrFiles, coverageFiles })
}
