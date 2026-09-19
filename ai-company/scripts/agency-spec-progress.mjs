import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
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

const implementationStates = ['implemented', 'partial', 'missing', 'unassessed']
const verificationKinds = ['focused', 'nativeApp', 'liveModel']
const verificationStates = ['passed', 'not_run', 'unknown']

function acceptanceCriteria(text) {
  const section = headingSection(text, 'Kryteria akceptacji')
  if (!section) return []
  const offset = text.indexOf(section)
  return [...section.matchAll(/^(\d+)\.\s+(.+)$/gm)].map((match) => ({
    id: `AC${match[1]}`, text: match[2].trim(),
    line: text.slice(0, offset + match.index).split('\n').length,
  }))
}

function summarizeCoverage(stories) {
  const criteria = stories.flatMap((story) => story.criteria)
  const countStates = (items) => Object.fromEntries(implementationStates.map((state) => [state, items.filter((item) => item.implementation === state).length]))
  return {
    stories: countStates(stories), criteria: { total: criteria.length, ...countStates(criteria) },
    verification: Object.fromEntries(verificationKinds.map((kind) => [kind, Object.fromEntries(verificationStates.map((state) => [state, criteria.filter((criterion) => criterion.verification[kind] === state).length]))])),
    criteriaWithExternalDecisions: criteria.filter((criterion) => criterion.externalDecision.length).length,
  }
}

function applyCoverage(storiesById, coverageFiles, diagnostics) {
  const assessments = new Map()
  for (const file of coverageFiles) {
    const source = normalizedPath(file.path)
    let data
    try { data = JSON.parse(file.text) } catch {
      diagnostics.push({ kind: 'invalid-coverage-json', source })
      continue
    }
    if (data?.version !== 1 || !Array.isArray(data.stories)) {
      diagnostics.push({ kind: 'invalid-coverage-schema', source })
      continue
    }
    for (const entry of data.stories) {
      const story = storiesById.get(entry?.id)
      if (!story || !Array.isArray(entry.criteria)) {
        diagnostics.push({ kind: 'invalid-coverage-story', source, anchor: entry?.id })
        continue
      }
      for (const criterion of entry.criteria) {
        const anchor = `${entry.id}/${criterion?.id}`
        if (!story.criteria.some((item) => item.id === criterion?.id)) {
          diagnostics.push({ kind: 'invalid-coverage-criterion', source, anchor })
          continue
        }
        if (assessments.has(anchor)) {
          diagnostics.push({ kind: 'duplicate-coverage-criterion', source, anchor })
          assessments.set(anchor, null)
          continue
        }
        const evidence = criterion.evidence ?? []
        const missing = criterion.missing ?? []
        const externalDecision = criterion.externalDecision ?? []
        const verification = Object.fromEntries(verificationKinds.map((kind) => [kind, criterion.verification?.[kind] ?? 'unknown']))
        const stringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim())
        if (!implementationStates.includes(criterion.implementation)
          || !Array.isArray(evidence) || evidence.some((item) => typeof item?.path !== 'string' || !item.path.trim() || typeof item.note !== 'string' || !item.note.trim())
          || !stringList(missing) || !stringList(externalDecision)
          || Object.values(verification).some((value) => !verificationStates.includes(value))
          || (['implemented', 'partial'].includes(criterion.implementation) && !evidence.length)
          || (Object.values(verification).includes('passed') && !evidence.length)) {
          diagnostics.push({ kind: 'invalid-coverage-assessment', source, anchor })
          assessments.set(anchor, null)
          continue
        }
        assessments.set(anchor, { implementation: criterion.implementation, evidence, missing, verification, externalDecision, assessmentSource: source })
      }
    }
  }
  for (const story of storiesById.values()) {
    story.criteria = story.criteria.map((criterion) => ({
      ...criterion, implementation: 'unassessed', evidence: [], missing: [], externalDecision: [],
      verification: Object.fromEntries(verificationKinds.map((kind) => [kind, 'unknown'])),
      assessmentSource: null, ...assessments.get(`${story.id}/${criterion.id}`),
    }))
    const states = story.criteria.map((criterion) => criterion.implementation)
    story.implementation = !states.length || states.every((state) => state === 'unassessed') ? 'unassessed'
      : states.every((state) => state === 'implemented') ? 'implemented'
        : states.every((state) => state === 'missing') ? 'missing' : 'partial'
  }
}

export function buildReport({ storyFiles, taskFiles, adrFiles, coverageFiles = [] }) {
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
      taskIds: [], adrIds: [], mappingEvidence: [], verificationClaims: [], criteria: acceptanceCriteria(file.text),
    })
  }
  applyCoverage(storiesById, coverageFiles, diagnostics)
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
  const [storyFiles, taskFiles, adrFiles, coverageFiles] = await Promise.all([
    markdownFiles(path.join(appRoot, '.specs', 'user-stories'), appRoot),
    markdownFiles(path.join(appRoot, '.tasks'), appRoot),
    markdownFiles(path.join(appRoot, '.dev-docs', 'adr'), appRoot),
    coverageInputs(appRoot),
  ])
  return buildReport({ storyFiles, taskFiles, adrFiles, coverageFiles })
}

async function coverageInputs(root) {
  const directory = path.join(root, '.dev-docs', 'coverage')
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  return Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).sort((left, right) => left.name.localeCompare(right.name)).map(async (entry) => ({
    path: normalizedPath(path.relative(root, path.join(directory, entry.name))),
    text: await readFile(path.join(directory, entry.name), 'utf8'),
  })))
}

export function formatReport(report) {
  const total = report.totals
  const lines = [
    'Agency spec progress (current checkout, including uncommitted files; no remote branch scan)',
    'Documentation-derived; not product-completion %.',
    `Spec taxonomy: ${report.domains.length} source domains / ${total.features} features / ${total.stories} child stories.`,
    `Assessed implementation (stories): ${Object.entries(total.coverage.stories).map(([state, count]) => `${state} ${count}`).join('; ')}.`,
    `Acceptance criteria: ${total.coverage.criteria.total}; ${implementationStates.map((state) => `${state} ${total.coverage.criteria[state]}`).join('; ')}.`,
    `Recorded criterion proof: focused ${total.coverage.verification.focused.passed}; native app/fixture ${total.coverage.verification.nativeApp.passed}; live model ${total.coverage.verification.liveModel.passed}. These can overlap; live calls are not a feature-completion gate.`,
    `Criteria awaiting external decisions: ${total.coverage.criteriaWithExternalDecisions}. Proposed scope is reported separately, not automatically missing.`,
    `Story mapping: ${total.mapped}/${total.stories} (${total.mappedPercent ?? 'n/a'}%); task-linked: ${total.taskLinked}/${total.stories}.`,
    `Done tasks: ${total.doneTasks}/${total.tasks} (${total.doneTasksPercent ?? 'n/a'}% of recorded tasks, including tasks-done archive and bounded/scaffold work).`,
    `Legacy task-metadata full-story claims: ${total.documentedVerified}; without such a claim: ${total.unassessed}. Separate from the AC assessments above.`,
    `Task-level delivery evidence: ${total.storiesWithDoneTaskEvidence}/${total.stories} stories across ${total.featuresWithDoneTaskEvidence}/${total.features} features have a linked done task; not full-story completion.`,
    `Scope: ${report.scopes.settled.stories} settled stories; ${report.scopes.proposal.stories} proposal stories (F34-F39).`,
    ...['settled', 'proposal'].map((scope) => `  ${scope} implementation: ${implementationStates.map((state) => `${state} ${report.scopes[scope].coverage.stories[state]}`).join('; ')}.`),
    '',
    'Domain | Stories implemented / partial / missing / unassessed | Active / ready / blocked tasks',
    ...report.domains.map((domain) => `${domain.domain} | ${implementationStates.map((state) => domain.coverage.stories[state]).join(' / ')} | ${domain.activeTasks.join(', ') || '-'} / ${domain.readyTasks.join(', ') || '-'} / ${domain.blockedTasks.join(', ') || '-'}`),
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
    coverage: summarizeCoverage(children),
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
        lines.push(`    ${child.id} [${child.scope}; implementation ${child.implementation}; ${child.doneTaskIds.length ? 'done-task evidence' : 'no done-task evidence'}; legacy claim ${child.acceptance}]`)
        if (child.userStory) lines.push(`      ${child.userStory.replace(/\s+/g, ' ')}`)
        lines.push(`      Tasks: ${child.taskEvidence.map((task) => `${task.id}=${task.stateLabel}${task.mappingBasis === 'title-fallback' ? ' [title link]' : ''}`).join('; ') || 'none'}`)
        lines.push(`      Spec: ${child.source}`)
        for (const criterion of child.criteria) {
          lines.push(`      ${criterion.id}: ${criterion.implementation}; ${verificationKinds.map((kind) => `${kind}=${criterion.verification[kind]}`).join(', ')}`)
          lines.push(`        ${criterion.text}`)
          for (const item of criterion.evidence) lines.push(`        Evidence: ${item.path} — ${item.note}`)
          if (criterion.missing.length) lines.push(`        Missing: ${criterion.missing.join('; ')}`)
          if (criterion.externalDecision.length) lines.push(`        External decision: ${criterion.externalDecision.join('; ')}`)
          if (criterion.assessmentSource) lines.push(`        Assessment: ${criterion.assessmentSource}`)
        }
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

const htmlEscape = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const stateLabel = (state) => ({
  implemented: 'Implemented', partial: 'Partial', missing: 'Missing', unassessed: 'Unassessed',
}[state] ?? state)

function repositoryHref(source, appRoot, outputPath) {
  if (typeof source !== 'string' || !source || /^[a-z][a-z\d+.-]*:/i.test(source) || path.isAbsolute(source)) return null
  const target = path.resolve(appRoot, source.replaceAll('/', path.sep))
  const root = path.resolve(appRoot)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null
  const relative = normalizedPath(path.relative(path.dirname(outputPath), target))
  return relative.split('/').map((segment) => encodeURIComponent(segment)).join('/') || '.'
}

function fileLink(source, label, appRoot, outputPath) {
  const href = repositoryHref(source, appRoot, outputPath)
  const content = htmlEscape(label ?? source)
  return href ? `<a href="${htmlEscape(href)}">${content}</a>` : content
}

function coverageBar(coverage, noun) {
  const counts = coverage[noun]
  const total = noun === 'criteria' ? counts.total : Object.values(counts).reduce((sum, count) => sum + count, 0)
  const segments = implementationStates.map((state) => {
    const count = counts[state]
    const width = total ? count / total * 100 : 0
    return `<span class="bar-${state}" style="width:${width}%" title="${stateLabel(state)}: ${count}"></span>`
  }).join('')
  return `<div class="bar" role="img" aria-label="${htmlEscape(noun)}: ${implementationStates.map((state) => `${stateLabel(state)} ${counts[state]}`).join(', ')}">${segments}</div>
    <div class="counts">${implementationStates.map((state) => `<span><i class="dot bar-${state}"></i>${stateLabel(state)} <strong data-count="${counts[state]}">${counts[state]}</strong></span>`).join('')}</div>`
}

function criterionHtml(criterion, appRoot, outputPath) {
  const proof = verificationKinds.map((kind) => {
    const label = { focused: 'Focused', nativeApp: 'Native app / fixture', liveModel: 'Live model' }[kind]
    return `<span class="proof proof-${criterion.verification[kind]}">${label}: ${criterion.verification[kind]}</span>`
  }).join('')
  const evidence = criterion.evidence.map((item) => `<li>${fileLink(item.path, item.path, appRoot, outputPath)}<span>${htmlEscape(item.note)}</span></li>`).join('')
  return `<li class="criterion">
    <div class="criterion-title"><strong>${htmlEscape(criterion.id)}</strong><span class="badge state-${criterion.implementation}">${stateLabel(criterion.implementation)}</span>${proof}</div>
    <p>${htmlEscape(criterion.text)}</p>
    ${evidence ? `<div class="evidence"><b>Evidence</b><ul>${evidence}</ul></div>` : ''}
    ${criterion.missing.length ? `<div class="callout missing"><b>Missing</b><ul>${criterion.missing.map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul></div>` : ''}
    ${criterion.externalDecision.length ? `<div class="callout decision"><b>External decision</b><ul>${criterion.externalDecision.map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul></div>` : ''}
    ${criterion.assessmentSource ? `<small>Assessment: ${fileLink(criterion.assessmentSource, criterion.assessmentSource, appRoot, outputPath)}</small>` : ''}
  </li>`
}

function storyHtml(story, appRoot, outputPath) {
  const searchable = [story.id, story.title, story.userStory, story.featureTitle, story.domain, story.scope,
    ...story.taskEvidence.flatMap((task) => [task.id, task.title, task.stateLabel]),
    ...story.criteria.flatMap((criterion) => [criterion.id, criterion.text, ...criterion.missing, ...criterion.externalDecision, ...criterion.evidence.flatMap((item) => [item.path, item.note])]),
  ].filter(Boolean).join(' ').toLowerCase()
  const tasks = story.taskEvidence.map((task) => `<li>${fileLink(task.source, task.id, appRoot, outputPath)} <span class="muted">${htmlEscape(task.stateLabel)}; ${htmlEscape(task.title)}</span></li>`).join('')
  const passedProof = verificationKinds.filter((kind) => story.criteria.some((criterion) => criterion.verification[kind] === 'passed')).join(' ')
  const hasDecision = story.criteria.some((criterion) => criterion.externalDecision.length)
  const hasMissing = story.criteria.some((criterion) => criterion.missing.length)
  return `<details class="story" data-story data-scope="${story.scope}" data-state="${story.implementation}" data-proof="${passedProof}" data-decision="${hasDecision}" data-missing="${hasMissing}" data-search="${htmlEscape(searchable)}">
    <summary><span class="story-id">${htmlEscape(story.id)}</span><span class="story-title">${htmlEscape(story.title)}</span><span class="badge scope-${story.scope}">${story.scope}</span><span class="badge state-${story.implementation}">${stateLabel(story.implementation)}</span></summary>
    <div class="story-body">
      ${story.userStory ? `<p class="user-story">${htmlEscape(story.userStory)}</p>` : ''}
      <p class="links">Spec: ${fileLink(story.source, story.source, appRoot, outputPath)}</p>
      <section><h4>Acceptance criteria <span>${story.criteria.length}</span></h4><ol class="criteria">${story.criteria.map((criterion) => criterionHtml(criterion, appRoot, outputPath)).join('')}</ol></section>
      <section><h4>Linked tasks <span>${story.taskEvidence.length}</span></h4>${tasks ? `<ul class="tasks">${tasks}</ul>` : '<p class="muted">No linked tasks.</p>'}</section>
    </div>
  </details>`
}

function featureHtml(feature, appRoot, outputPath) {
  const title = feature.titles.join(' / ')
  return `<details class="feature" data-feature open>
    <summary><span><strong>${htmlEscape(feature.id)}</strong>${title ? ` ${htmlEscape(title)}` : ''}</span><span class="muted">${feature.children.length} stories</span></summary>
    <div class="feature-body">${coverageBar(feature.coverage, 'stories')}${feature.children.map((story) => storyHtml(story, appRoot, outputPath)).join('')}</div>
  </details>`
}

function scopeCard(name, summary) {
  const heading = name === 'settled' ? 'Settled scope' : 'Proposed scope'
  const note = name === 'settled' ? 'Agreed product scope.' : 'Reported separately; proposals are not automatically missing work.'
  return `<article class="scope-card"><h3>${heading}</h3><p>${note}</p><div class="big-number">${summary.stories} <small>stories</small></div>${coverageBar(summary.coverage, 'stories')}</article>`
}

export function renderHtmlReport(report, { appRoot = defaultAppRoot, outputPath = path.join(appRoot, '.dev-docs', 'coverage', 'report.html') } = {}) {
  const total = report.totals
  const domains = report.hierarchy.map((domain) => `<section class="domain" data-domain>
    <header><div><p class="eyebrow">Domain</p><h2>${htmlEscape(domain.categories.join(' / ') || domain.domain)}</h2><p class="muted">${htmlEscape(domain.domain)} · ${domain.features.length} features · ${domain.stories} stories</p></div><div class="domain-bar">${coverageBar(domain.coverage, 'stories')}</div></header>
    ${domain.features.map((feature) => featureHtml(feature, appRoot, outputPath)).join('')}
  </section>`).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agency specification coverage</title>
<style>
:root{color-scheme:light;--ink:#17202a;--muted:#62707f;--line:#dfe5e8;--paper:#fff;--wash:#f4f7f6;--accent:#0c6b58;--implemented:#2c8a66;--partial:#d89b25;--missing:#cf554e;--unassessed:#aab3ba}*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}a{color:#075f8c;text-underline-offset:2px}main{width:min(1180px,calc(100% - 32px));margin:auto;padding:36px 0 72px}.masthead{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end}.eyebrow{margin:0 0 5px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(30px,5vw,52px);line-height:1.05;margin:0;max-width:760px}h2,h3,h4,p{margin-top:0}.lede{color:var(--muted);max-width:800px;font-size:16px}.notice{margin:24px 0;padding:16px 18px;border-left:4px solid var(--accent);background:#e8f2ef}.summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:18px 0}.scope-card,.dimensions,.domain,.toolbar{background:var(--paper);border:1px solid var(--line);border-radius:10px}.scope-card{padding:20px}.scope-card h3{margin-bottom:2px}.scope-card p{color:var(--muted)}.big-number{font-size:30px;font-weight:750;margin:10px 0}.big-number small{font-size:13px;color:var(--muted)}.dimensions{display:grid;grid-template-columns:1.5fr 1fr;gap:24px;padding:18px 20px}.dimensions h3{margin-bottom:8px}.proof-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.proof-counts span{padding:7px 9px;background:var(--wash);border-radius:6px}.bar{display:flex;height:9px;border-radius:10px;overflow:hidden;background:#eef1f2}.bar span{min-width:0}.bar-implemented{background:var(--implemented)}.bar-partial{background:var(--partial)}.bar-missing{background:var(--missing)}.bar-unassessed{background:var(--unassessed)}.counts{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:7px;color:var(--muted);font-size:12px}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}.toolbar{position:sticky;top:8px;z-index:2;display:grid;grid-template-columns:2fr repeat(3,1fr) auto;gap:10px;padding:12px;margin:24px 0;box-shadow:0 5px 18px #26323812}.toolbar label{font-size:11px;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.toolbar input,.toolbar select{display:block;width:100%;margin-top:3px;border:1px solid #bac5ca;border-radius:6px;background:#fff;padding:8px;color:var(--ink)}#visible-count{align-self:end;padding:8px 2px;color:var(--muted);white-space:nowrap}.domain{margin:18px 0;padding:20px}.domain>header{display:grid;grid-template-columns:1fr minmax(270px,40%);gap:24px}.domain h2{margin-bottom:2px}.feature{border-top:1px solid var(--line);padding:12px 0}.feature>summary,.story>summary{cursor:pointer;list-style:none}.feature>summary::-webkit-details-marker,.story>summary::-webkit-details-marker{display:none}.feature>summary{display:flex;justify-content:space-between;font-size:16px}.feature-body{padding:10px 0 2px}.feature-body>.counts{margin-bottom:12px}.story{margin:8px 0;border:1px solid var(--line);border-radius:8px;background:#fff}.story>summary{display:flex;align-items:center;gap:8px;padding:11px}.story>summary:before{content:'›';font-size:20px;color:var(--muted);transition:transform .15s}.story[open]>summary:before{transform:rotate(90deg)}.story-title{flex:1}.story-id{font-weight:800}.story-body{padding:4px 18px 18px;border-top:1px solid var(--line)}.user-story{margin:14px 0;font-size:15px}.badge,.proof{display:inline-block;border-radius:99px;padding:2px 7px;font-size:11px;white-space:nowrap}.scope-settled{background:#e5f1ef;color:#155d50}.scope-proposal{background:#eee8fa;color:#624298}.state-implemented{background:#ddefe7;color:#176145}.state-partial{background:#fff0cf;color:#805606}.state-missing{background:#fde2df;color:#8a302c}.state-unassessed{background:#edf0f2;color:#59636a}.criteria{padding-left:20px}.criterion{padding:12px 0;border-top:1px solid #edf0f1}.criterion-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.criterion p{margin:6px 0}.proof{background:#eef2f4;color:#59636a}.proof-passed{background:#ddefe7;color:#176145}.proof-not_run{background:#f3eee3;color:#725d34}.evidence ul,.callout ul,.tasks{margin:5px 0;padding-left:20px}.evidence li span{display:block;color:var(--muted)}.callout{margin:8px 0;padding:9px 11px;border-radius:6px}.callout.missing{background:#fff3dd}.callout.decision{background:#eee8fa}.links,.muted,small{color:var(--muted)}.empty{padding:28px;text-align:center;color:var(--muted)}[hidden]{display:none!important}@media(max-width:760px){main{width:min(100% - 20px,1180px);padding-top:20px}.masthead,.domain>header,.summary,.dimensions,.toolbar{grid-template-columns:1fr}.toolbar{position:static}.domain{padding:14px}.domain-bar{margin-bottom:8px}.story>summary{align-items:flex-start;flex-wrap:wrap}.story-title{flex-basis:70%}}
</style></head><body><main>
<header class="masthead"><div><p class="eyebrow">Current checkout · documentation-derived</p><h1>Agency specification coverage</h1></div><div><strong>${total.stories}</strong> canonical stories<br><span class="muted">${total.coverage.criteria.total} acceptance criteria</span></div></header>
<p class="lede">A navigable view of canonical specifications, source implementation assessments, recorded proof, task links, missing criteria and external decisions.</p>
<aside class="notice"><strong>How to read this:</strong> implementation, focused checks, native app / fixture proof and live-model proof are separate dimensions. A linked or done task is not story completeness. A partial story is not a product or effort percentage. Unassessed means no valid assessment was found, not that functionality is absent.</aside>
<section class="summary">${scopeCard('settled', report.scopes.settled)}${scopeCard('proposal', report.scopes.proposal)}</section>
<section class="dimensions"><div><h3>Source implementation · acceptance criteria</h3>${coverageBar(total.coverage, 'criteria')}</div><div><h3>Recorded criterion proof</h3><div class="proof-counts"><span>Focused passed <strong>${total.coverage.verification.focused.passed}</strong></span><span>Native app / fixture passed <strong>${total.coverage.verification.nativeApp.passed}</strong></span><span>Live model passed <strong>${total.coverage.verification.liveModel.passed}</strong></span><span>External decisions <strong>${total.coverage.criteriaWithExternalDecisions}</strong></span></div><small>Proof counts can overlap and do not replace source implementation assessment.</small></div></section>
<div class="toolbar" role="search"><label>Search<input id="search" type="search" placeholder="Story, criterion, task, evidence…"></label><label>Scope<select id="scope"><option value="">All</option><option value="settled">Settled</option><option value="proposal">Proposed</option></select></label><label>Implementation<select id="state"><option value="">All</option>${implementationStates.map((state) => `<option value="${state}">${stateLabel(state)}</option>`).join('')}</select></label><label>Evidence / gaps<select id="proof"><option value="">All</option><option value="focused">Focused passed</option><option value="nativeApp">Native app / fixture passed</option><option value="liveModel">Live model passed</option><option value="missing">Has missing criteria</option><option value="decision">Needs external decision</option></select></label><div id="visible-count" aria-live="polite"></div></div>
<div id="domains">${domains}</div><p id="empty" class="empty" hidden>No stories match these filters.</p>
<script>(()=>{const q=id=>document.getElementById(id),stories=[...document.querySelectorAll('[data-story]')],features=[...document.querySelectorAll('[data-feature]')],domains=[...document.querySelectorAll('[data-domain]')];function apply(){const text=q('search').value.trim().toLowerCase(),scope=q('scope').value,state=q('state').value,proof=q('proof').value;let visible=0;for(const story of stories){const proofMatch=!proof||(proof==='decision'?story.dataset.decision==='true':proof==='missing'?story.dataset.missing==='true':story.dataset.proof.split(' ').includes(proof));const show=(!text||story.dataset.search.includes(text))&&(!scope||story.dataset.scope===scope)&&(!state||story.dataset.state===state)&&proofMatch;story.hidden=!show;if(show)visible++}for(const feature of features)feature.hidden=![...feature.querySelectorAll('[data-story]')].some(story=>!story.hidden);for(const domain of domains)domain.hidden=![...domain.querySelectorAll('[data-story]')].some(story=>!story.hidden);q('visible-count').textContent='Showing '+visible+' of '+stories.length+' stories';q('empty').hidden=visible!==0}for(const id of ['search','scope','state','proof'])q(id).addEventListener('input',apply);apply()})()</script>
</main></body></html>`
}

export async function writeHtmlReport(report, outputPath, appRoot = defaultAppRoot) {
  const resolved = path.resolve(outputPath)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, renderHtmlReport(report, { appRoot, outputPath: resolved }), 'utf8')
  return resolved
}

export function parseOptions(args) {
  const options = { json: false, details: false, help: false, html: null }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (['--json', '--details', '--help'].includes(arg)) options[arg.slice(2)] = true
    else if (arg === '--html') {
      options.html = args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : true
    }
    else if (arg === '--feature' || arg === '--story') {
      const value = args[++index]
      const pattern = arg === '--feature' ? /^F\d{2}$/ : /^F\d{2}-\d+$/
      if (!value || !pattern.test(value)) throw new Error(`${arg} needs ${arg === '--feature' ? 'Fnn' : 'Fnn-n'}.`)
      options[arg.slice(2)] = value
    } else throw new Error(`Unknown option ${arg}. Use --help.`)
  }
  if (options.feature && options.story) throw new Error('Choose --feature or --story, not both.')
  if (options.html && (options.json || options.details || options.feature || options.story)) throw new Error('Use --html on its own.')
  return options
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) {
      console.log('Coverage: .dev-docs/coverage/*.json, version 1. Each stories[] entry has id and criteria[] with numbered AC IDs, implementation (implemented/partial/missing/unassessed), evidence [{path: App-relative, note}], missing[], externalDecision[], and verification {focused,nativeApp,liveModel}: passed/not_run/unknown. AC text comes from the canonical spec, not the input files. All criteria must be implemented for a story-level implemented assessment; paid model proof is independent. Missing or invalid records stay unassessed. Recorded evidence is not executed by this tool.\n')
      console.log('HTML: --html [output-path] writes one self-contained offline report. The default output is .dev-docs/coverage/report.html; a custom relative path resolves from the current directory. All other modes write no files.\n')
      console.log('Usage: node <path>/agency-spec-progress.mjs [--json] [--details | --feature Fnn | --story Fnn-n]\nReads the App repository relative to this script, independent of cwd; writes no files.\nDefault: domain overview. Details: source category → feature → story, linked task states and acceptance evidence.\nDone task evidence is not story completion. Task links use Sources or an explicitly labeled title fallback.\nOptional done-task metadata: Verified stories: F42-1\nVerification evidence: [check or run evidence](relative-path-or-URL) or a commit hash.\nUse exact story IDs for verification; family anchors are mapping only. Ranges are reported, never expanded.')
      console.log('\nException: --html writes the report file described above.')
    } else {
      const report = await loadReport()
      const focused = options.feature || options.story
      if (options.html) {
        const outputPath = options.html === true ? path.join(defaultAppRoot, '.dev-docs', 'coverage', 'report.html') : path.resolve(options.html)
        console.log(`Wrote ${await writeHtmlReport(report, outputPath)}`)
      } else if (options.json) console.log(JSON.stringify(focused ? selectHierarchy(report, options) : report, null, 2))
      else console.log(focused || options.details ? formatDetails(selectHierarchy(report, options)) : formatReport(report))
    }
  } catch (error) {
    console.error(`Cannot read spec progress: ${error.message}`)
    process.exitCode = 1
  }
}
