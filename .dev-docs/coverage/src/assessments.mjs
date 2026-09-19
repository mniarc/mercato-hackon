import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export const implementationStates = ['implemented', 'partial', 'missing', 'unassessed']
export const verificationKinds = ['focused', 'nativeApp', 'liveModel']
export const verificationStates = ['passed', 'not_run', 'unknown']

export function summarizeCoverage(stories) {
  const criteria = stories.flatMap((story) => story.criteria)
  const countStates = (items) => Object.fromEntries(implementationStates.map((state) => [state, items.filter((item) => item.implementation === state).length]))
  return {
    stories: countStates(stories), criteria: { total: criteria.length, ...countStates(criteria) },
    verification: Object.fromEntries(verificationKinds.map((kind) => [kind, Object.fromEntries(verificationStates.map((state) => [state, criteria.filter((criterion) => criterion.verification[kind] === state).length]))])),
    criteriaWithExternalDecisions: criteria.filter((criterion) => criterion.externalDecision.length).length,
  }
}

export function applyAssessments(storiesById, assessmentFiles, diagnostics, normalizedPath) {
  const assessments = new Map()
  for (const file of assessmentFiles) {
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
    const assessmentFeature = path.posix.basename(source, '.json')
    if (!/^F\d{2}$/.test(assessmentFeature)) {
      diagnostics.push({ kind: 'invalid-coverage-feature-file', source })
      continue
    }
    for (const entry of data.stories) {
      const story = storiesById.get(entry?.id)
      if (!story || !Array.isArray(entry.criteria)) {
        diagnostics.push({ kind: 'invalid-coverage-story', source, anchor: entry?.id })
        continue
      }
      if (!entry.id.startsWith(`${assessmentFeature}-`)) {
        diagnostics.push({ kind: 'misplaced-coverage-story', source, anchor: entry.id })
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

export async function loadAssessmentFiles(root, normalizedPath) {
  const directory = path.join(root, '.dev-docs', 'coverage', 'assessments')
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  return Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry) => ({
      path: normalizedPath(path.relative(root, path.join(directory, entry.name))),
      text: await readFile(path.join(directory, entry.name), 'utf8'),
    })))
}
