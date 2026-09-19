import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export const implementationStates = ['implemented', 'partial', 'missing', 'unassessed']
export const verificationKinds = ['focused', 'nativeApp', 'liveModel']
export const verificationStates = ['passed', 'not_run', 'unknown']

export const trialReadinessKinds = ['trial_proved', 'awaiting_trial', 'unwired', 'decision_gated', 'code_missing', 'unassessed']

export const trialReadinessLabels = {
  trial_proved: 'Proven in Real Run',
  awaiting_trial: 'Awaiting Real Trial Evidence',
  unwired: 'Not Wired to Real Run',
  decision_gated: 'Awaiting External Decision',
  code_missing: 'Missing Implementation',
  unassessed: 'Unassessed',
}

export const trialReadinessActionRoles = {
  trial_proved: 'Verified',
  awaiting_trial: 'QA / Trial Run',
  unwired: 'Engineering / Wiring',
  decision_gated: 'Product / Decision',
  code_missing: 'Engineering / Authoring',
  unassessed: 'Assessment Needed',
}

export function classifyCriterionReadiness(criterion) {
  const isNativePassed = criterion.verification?.nativeApp === 'passed'
  const isLivePassed = criterion.verification?.liveModel === 'passed'
  const isFocusedPassed = criterion.verification?.focused === 'passed'
  const hasPassedRun = isNativePassed || isLivePassed

  const hasDecision = Array.isArray(criterion.externalDecision) && criterion.externalDecision.length > 0
  const missingList = Array.isArray(criterion.missing) ? criterion.missing : []
  const evidenceList = Array.isArray(criterion.evidence) ? criterion.evidence : []
  const hasEvidence = evidenceList.length > 0

  if (hasPassedRun) {
    return {
      kind: 'trial_proved',
      label: trialReadinessLabels.trial_proved,
      actionRole: trialReadinessActionRoles.trial_proved,
      reason: isLivePassed ? 'Live-model execution verified.' : 'Native app / fixture trial run verified.',
    }
  }

  if (hasDecision) {
    return {
      kind: 'decision_gated',
      label: trialReadinessLabels.decision_gated,
      actionRole: trialReadinessActionRoles.decision_gated,
      reason: criterion.externalDecision.join('; '),
    }
  }

  if (criterion.implementation === 'missing' && !hasEvidence) {
    return {
      kind: 'code_missing',
      label: trialReadinessLabels.code_missing,
      actionRole: trialReadinessActionRoles.code_missing,
      reason: missingList.join('; ') || 'No implementation or evidence recorded.',
    }
  }

  const missingText = missingList.join(' ').toLowerCase()
  const evidenceText = evidenceList.map((e) => `${e.path} ${e.note}`).join(' ').toLowerCase()
  const unwiredPatterns = [
    'not wired', 'no connected', 'not connected', 'not activated', 'unwired',
    'proposal scaffold', 'unsupported', 'missing native activation', 'not demonstrated',
    'no real access', 'unrun', 'unobserved', 'scaffold does not', 'not implemented',
    'missing handoff', 'wiring is missing', 'destination preparation in progress',
    'no connected pre-purchase', 'wire saved', 'separate native task engine'
  ]
  const explicitlyUnwired = unwiredPatterns.some((pattern) => missingText.includes(pattern) || evidenceText.includes(pattern))

  if (explicitlyUnwired || (!isFocusedPassed && criterion.implementation === 'missing') || (!isFocusedPassed && missingList.length > 0 && !hasPassedRun)) {
    return {
      kind: 'unwired',
      label: trialReadinessLabels.unwired,
      actionRole: trialReadinessActionRoles.unwired,
      reason: missingList.join('; ') || 'Scaffold exists but is not wired to an executable workflow or test run.',
    }
  }

  if (criterion.implementation === 'implemented' || criterion.implementation === 'partial') {
    const needsLive = criterion.verification?.liveModel === 'not_run' || criterion.verification?.liveModel === 'unknown'
    return {
      kind: 'awaiting_trial',
      label: trialReadinessLabels.awaiting_trial,
      actionRole: trialReadinessActionRoles.awaiting_trial,
      reason: needsLive
        ? 'Plumbing implemented; requires real live-model execution to confirm or disprove.'
        : 'Plumbing implemented; requires real native app trial run to confirm or disprove.',
    }
  }

  return {
    kind: criterion.implementation === 'unassessed' ? 'unassessed' : 'code_missing',
    label: trialReadinessLabels[criterion.implementation] ?? 'Incomplete',
    actionRole: trialReadinessActionRoles[criterion.implementation] ?? 'Engineering',
    reason: missingList.join('; ') || 'Assessment incomplete.',
  }
}

export function summarizeCoverage(stories) {
  const criteria = stories.flatMap((story) => story.criteria)
  const countStates = (items) => Object.fromEntries(implementationStates.map((state) => [state, items.filter((item) => item.implementation === state).length]))
  const countTrialStates = (items) => Object.fromEntries(trialReadinessKinds.map((kind) => [kind, items.filter((item) => item.trialReadiness?.kind === kind).length]))
  return {
    stories: countStates(stories), criteria: { total: criteria.length, ...countStates(criteria) },
    verification: Object.fromEntries(verificationKinds.map((kind) => [kind, Object.fromEntries(verificationStates.map((state) => [state, criteria.filter((criterion) => criterion.verification[kind] === state).length]))])),
    criteriaWithExternalDecisions: criteria.filter((criterion) => criterion.externalDecision.length).length,
    trialReadiness: { total: criteria.length, ...countTrialStates(criteria) },
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
    story.criteria = story.criteria.map((criterion) => {
      const enriched = {
        ...criterion, implementation: 'unassessed', evidence: [], missing: [], externalDecision: [],
        verification: Object.fromEntries(verificationKinds.map((kind) => [kind, 'unknown'])),
        assessmentSource: null, ...assessments.get(`${story.id}/${criterion.id}`),
      }
      enriched.trialReadiness = classifyCriterionReadiness(enriched)
      return enriched
    })
    const states = story.criteria.map((criterion) => criterion.implementation)
    story.implementation = !states.length || states.every((state) => state === 'unassessed') ? 'unassessed'
      : states.every((state) => state === 'implemented') ? 'implemented'
        : states.every((state) => state === 'missing') ? 'missing' : 'partial'
    story.trialSummary = Object.fromEntries(trialReadinessKinds.map((kind) => [kind, story.criteria.filter((c) => c.trialReadiness?.kind === kind).length]))
    story.primaryBlocker = story.criteria.some((c) => c.trialReadiness?.kind === 'decision_gated') ? 'decision_gated'
      : story.criteria.some((c) => c.trialReadiness?.kind === 'unwired') ? 'unwired'
      : story.criteria.some((c) => c.trialReadiness?.kind === 'awaiting_trial') ? 'awaiting_trial'
      : story.criteria.some((c) => c.trialReadiness?.kind === 'code_missing') ? 'code_missing'
      : story.criteria.every((c) => c.trialReadiness?.kind === 'trial_proved') ? 'trial_proved' : 'unassessed'
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
