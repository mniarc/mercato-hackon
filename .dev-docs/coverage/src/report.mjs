import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { implementationStates, summarizeCoverage, trialReadinessActionRoles, trialReadinessKinds, trialReadinessLabels, verificationKinds } from './assessments.mjs'
import { defaultAppRoot } from './scanner.mjs'

export function formatReport(report) {
  const total = report.totals
  const partialCriteria = report.stories.flatMap((s) => s.criteria).filter((c) => c.implementation === 'partial')
  const partialByKind = trialReadinessKinds
    .map((k) => ({ kind: k, label: trialReadinessLabels[k], role: trialReadinessActionRoles[k], count: partialCriteria.filter((c) => c.trialReadiness?.kind === k).length }))
    .filter((item) => item.count > 0)
  const lines = [
    'Agency spec progress (current checkout, including uncommitted files; no remote branch scan)',
    'Documentation-derived; not product-completion %.',
    `Spec taxonomy: ${report.domains.length} source domains / ${total.features} features / ${total.stories} child stories.`,
    `Assessed implementation (stories): ${Object.entries(total.coverage.stories).map(([state, count]) => `${state} ${count}`).join('; ')}.`,
    `Acceptance criteria: ${total.coverage.criteria.total}; ${implementationStates.map((state) => `${state} ${total.coverage.criteria[state]}`).join('; ')}.`,
    `Recorded criterion proof: focused ${total.coverage.verification.focused.passed}; native app/fixture ${total.coverage.verification.nativeApp.passed}; live model ${total.coverage.verification.liveModel.passed}. These can overlap; live calls are not a feature-completion gate.`,
    `Criteria awaiting external decisions: ${total.coverage.criteriaWithExternalDecisions}. Proposed scope is reported separately, not automatically missing.`,
    `Criteria readiness & action roles: ${trialReadinessKinds.filter((k) => (total.coverage.trialReadiness?.[k] ?? 0) > 0).map((k) => `${trialReadinessLabels[k]} [${trialReadinessActionRoles[k]}]: ${total.coverage.trialReadiness[k]}`).join('; ')}.`,
    `Why criteria are partial (${partialCriteria.length} criteria): ${partialByKind.map((item) => `${item.label} [${item.role}]: ${item.count}`).join('; ')}.`,
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

const stateLabel = (state) => ({ implemented: 'Implemented', partial: 'Partial', missing: 'Missing', unassessed: 'Unassessed' }[state] ?? state)
const proofKindLabel = { focused: 'Focused proof', nativeApp: 'Native app / fixture proof', liveModel: 'Live-model proof' }
const proofStateLabel = { passed: 'Passed', not_run: 'No run recorded', unknown: 'Not assessed' }
const proofStateHelp = {
  passed: 'Passing proof is recorded; code implementation is assessed separately.',
  not_run: 'No run is recorded. This is not a failed test and does not mean code is missing.',
  unknown: 'Proof status has not been assessed. This is not a failed test and does not determine code implementation.',
}

function repositoryHref(source, appRoot, outputPath) {
  if (typeof source !== 'string' || !source || /^[a-z][a-z\d+.-]*:/i.test(source) || path.isAbsolute(source)) return null
  const target = path.resolve(appRoot, source.replaceAll('/', path.sep))
  const root = path.resolve(appRoot)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null
  const relative = path.relative(path.dirname(outputPath), target).replaceAll('\\', '/')
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
  const segments = implementationStates.map((state) => `<span class="bar-${state}" style="width:${total ? counts[state] / total * 100 : 0}%" title="${stateLabel(state)}: ${counts[state]}"></span>`).join('')
  return `<div class="bar" role="img" aria-label="${htmlEscape(noun)}: ${implementationStates.map((state) => `${stateLabel(state)} ${counts[state]}`).join(', ')}">${segments}</div><div class="counts">${implementationStates.map((state) => `<span><i class="dot bar-${state}"></i>${stateLabel(state)} <strong data-count="${counts[state]}">${counts[state]}</strong></span>`).join('')}</div>`
}

function criterionHtml(criterion, appRoot, outputPath) {
  const proof = verificationKinds.map((kind) => {
    const state = criterion.verification[kind]
    return `<span class="proof proof-${state}" title="${htmlEscape(proofStateHelp[state])}">${proofKindLabel[kind]}: ${proofStateLabel[state]}</span>`
  }).join('')
  const evidence = criterion.evidence.map((item) => `<li>${fileLink(item.path, item.path, appRoot, outputPath)}<span>${htmlEscape(item.note)}</span></li>`).join('')
  const remaining = criterion.missing.length
    ? `<div class="callout remaining"><b>Remaining reason / missing behavior</b><ul>${criterion.missing.map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul></div>`
    : ['partial', 'missing'].includes(criterion.implementation)
      ? '<div class="callout remaining"><b>Remaining reason</b><p>No structured remaining reason recorded; consult the evidence, notes and assessment source.</p></div>'
      : criterion.implementation === 'unassessed'
        ? '<div class="callout remaining"><b>Remaining reason</b><p>No manual code implementation assessment recorded.</p></div>' : ''
  return `<li class="criterion"><div class="criterion-title"><strong>${htmlEscape(criterion.id)}</strong><span class="badge state-${criterion.implementation}" title="Manual code implementation assessment">Code: ${stateLabel(criterion.implementation)}</span>${proof}</div><p>${htmlEscape(criterion.text)}</p>${evidence ? `<div class="evidence"><b>Recorded evidence and notes</b><ul>${evidence}</ul></div>` : ''}${remaining}${criterion.externalDecision.length ? `<div class="callout decision"><b>External decision</b><ul>${criterion.externalDecision.map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul></div>` : ''}${criterion.assessmentSource ? `<small>Assessment: ${fileLink(criterion.assessmentSource, criterion.assessmentSource, appRoot, outputPath)}</small>` : ''}</li>`
}

function storyHtml(story, appRoot, outputPath) {
  const searchable = [story.id, story.title, story.userStory, story.featureTitle, story.domain, story.scope, ...story.taskEvidence.flatMap((task) => [task.id, task.title, task.stateLabel]), ...story.criteria.flatMap((criterion) => [criterion.id, criterion.text, ...criterion.missing, ...criterion.externalDecision, ...criterion.evidence.flatMap((item) => [item.path, item.note])])].filter(Boolean).join(' ').toLowerCase()
  const tasks = story.taskEvidence.map((task) => `<li>${fileLink(task.source, task.id, appRoot, outputPath)} <span class="muted">${htmlEscape(task.stateLabel)}; ${htmlEscape(task.title)}</span></li>`).join('')
  const passedProof = verificationKinds.filter((kind) => story.criteria.some((criterion) => criterion.verification[kind] === 'passed')).join(' ')
  const hasDecision = story.criteria.some((criterion) => criterion.externalDecision.length)
  const hasMissing = story.criteria.some((criterion) => criterion.missing.length)
  return `<details class="story" data-story data-scope="${story.scope}" data-state="${story.implementation}" data-proof="${passedProof}" data-decision="${hasDecision}" data-missing="${hasMissing}" data-search="${htmlEscape(searchable)}"><summary><span class="story-id">${htmlEscape(story.id)}</span><span class="story-title">${htmlEscape(story.title)}</span><span class="badge scope-${story.scope}">${story.scope}</span><span class="badge state-${story.implementation}" title="Derived story code status; expand for criterion-level assessments">Code: ${stateLabel(story.implementation)}</span></summary><div class="story-body">${story.userStory ? `<p class="user-story">${htmlEscape(story.userStory)}</p>` : ''}<p class="links">Spec: ${fileLink(story.source, story.source, appRoot, outputPath)}</p><section><h4>Acceptance criteria <span>${story.criteria.length}</span></h4><ol class="criteria">${story.criteria.map((criterion) => criterionHtml(criterion, appRoot, outputPath)).join('')}</ol></section><section><h4>Linked tasks <span>${story.taskEvidence.length}</span></h4>${tasks ? `<ul class="tasks">${tasks}</ul>` : '<p class="muted">No linked tasks.</p>'}</section></div></details>`
}

function featureHtml(feature, appRoot, outputPath) {
  const title = feature.titles.join(' / ')
  return `<details class="feature" data-feature open><summary><span><strong>${htmlEscape(feature.id)}</strong>${title ? ` ${htmlEscape(title)}` : ''}</span><span class="muted">${feature.children.length} stories</span></summary><div class="feature-body">${coverageBar(feature.coverage, 'stories')}${feature.children.map((story) => storyHtml(story, appRoot, outputPath)).join('')}</div></details>`
}

function scopeCard(name, summary) {
  const heading = name === 'settled' ? 'Settled scope' : 'Proposed scope'
  const note = name === 'settled' ? 'Agreed product scope.' : 'Reported separately; proposals are not automatically missing work.'
  return `<article class="scope-card"><h3>${heading}</h3><p>${note}</p><div class="big-number">${summary.stories} <small>stories</small></div>${coverageBar(summary.coverage, 'stories')}</article>`
}

export function renderHtmlReport(report, { appRoot = defaultAppRoot, outputPath = path.join(appRoot, '.dev-docs', 'coverage', 'generated-report.html') } = {}) {
  const total = report.totals
  const domains = report.hierarchy.map((domain) => `<section class="domain" data-domain><header><div><p class="eyebrow">Domain</p><h2>${htmlEscape(domain.categories.join(' / ') || domain.domain)}</h2><p class="muted">${htmlEscape(domain.domain)} · ${domain.features.length} features · ${domain.stories} stories</p></div><div class="domain-bar">${coverageBar(domain.coverage, 'stories')}</div></header>${domain.features.map((feature) => featureHtml(feature, appRoot, outputPath)).join('')}</section>`).join('')
  const manualInputs = report.assessmentSources.length
    ? `${fileLink('.dev-docs/coverage/assessments', '.dev-docs/coverage/assessments/FNN.json', appRoot, outputPath)} (${report.assessmentSources.length} feature files; edit these)`
    : 'none'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agency specification coverage</title><style>
:root{color-scheme:light;--ink:#17202a;--muted:#62707f;--line:#dfe5e8;--paper:#fff;--wash:#f4f7f6;--accent:#0c6b58;--implemented:#2c8a66;--partial:#d89b25;--missing:#cf554e;--unassessed:#aab3ba}*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}a{color:#075f8c;text-underline-offset:2px}code{font-family:ui-monospace,monospace}main{width:min(1180px,calc(100% - 32px));margin:auto;padding:36px 0 72px}.masthead{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end}.eyebrow{margin:0 0 5px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(30px,5vw,52px);line-height:1.05;margin:0;max-width:760px}h2,h3,h4,p{margin-top:0}.lede{color:var(--muted);max-width:800px;font-size:16px}.notice{margin:24px 0;padding:16px 18px;border-left:4px solid var(--accent);background:#e8f2ef}.inputs{background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:14px 0;color:var(--muted)}.inputs p{margin:3px 0}.summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:18px 0}.scope-card,.dimensions,.legend,.domain,.toolbar{background:var(--paper);border:1px solid var(--line);border-radius:10px}.scope-card{padding:20px}.scope-card h3{margin-bottom:2px}.scope-card p{color:var(--muted)}.big-number{font-size:30px;font-weight:750;margin:10px 0}.big-number small{font-size:13px;color:var(--muted)}.legend,.dimensions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;padding:18px 20px}.legend{margin:18px 0}.legend h3,.dimensions h3{margin-bottom:8px}.legend p{margin-bottom:6px}.proof-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.proof-counts span{padding:7px 9px;background:var(--wash);border-radius:6px}.bar{display:flex;height:9px;border-radius:10px;overflow:hidden;background:#eef1f2}.bar span{min-width:0}.bar-implemented{background:var(--implemented)}.bar-partial{background:var(--partial)}.bar-missing{background:var(--missing)}.bar-unassessed{background:var(--unassessed)}.counts{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:7px;color:var(--muted);font-size:12px}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}.toolbar{position:sticky;top:8px;z-index:2;display:grid;grid-template-columns:2fr repeat(3,1fr) auto;gap:10px;padding:12px;margin:24px 0;box-shadow:0 5px 18px #26323812}.toolbar label{font-size:11px;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.toolbar input,.toolbar select{display:block;width:100%;margin-top:3px;border:1px solid #bac5ca;border-radius:6px;background:#fff;padding:8px;color:var(--ink)}#visible-count{align-self:end;padding:8px 2px;color:var(--muted);white-space:nowrap}.domain{margin:18px 0;padding:20px}.domain>header{display:grid;grid-template-columns:1fr minmax(270px,40%);gap:24px}.domain h2{margin-bottom:2px}.feature{border-top:1px solid var(--line);padding:12px 0}.feature>summary,.story>summary{cursor:pointer;list-style:none}.feature>summary::-webkit-details-marker,.story>summary::-webkit-details-marker{display:none}.feature>summary{display:flex;justify-content:space-between;font-size:16px}.feature-body{padding:10px 0 2px}.feature-body>.counts{margin-bottom:12px}.story{margin:8px 0;border:1px solid var(--line);border-radius:8px;background:#fff}.story>summary{display:flex;align-items:center;gap:8px;padding:11px}.story>summary:before{content:'›';font-size:20px;color:var(--muted);transition:transform .15s}.story[open]>summary:before{transform:rotate(90deg)}.story-title{flex:1}.story-id{font-weight:800}.story-body{padding:4px 18px 18px;border-top:1px solid var(--line)}.user-story{margin:14px 0;font-size:15px}.badge,.proof{display:inline-block;border-radius:99px;padding:2px 7px;font-size:11px;white-space:nowrap}.scope-settled{background:#e5f1ef;color:#155d50}.scope-proposal{background:#eee8fa;color:#624298}.state-implemented{background:#ddefe7;color:#176145}.state-partial{background:#fff0cf;color:#805606}.state-missing{background:#fde2df;color:#8a302c}.state-unassessed{background:#edf0f2;color:#59636a}.criteria{padding-left:20px}.criterion{padding:12px 0;border-top:1px solid #edf0f1}.criterion-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.criterion p{margin:6px 0}.proof{background:#eef2f4;color:#59636a}.proof-passed{background:#ddefe7;color:#176145}.proof-not_run{background:#f3eee3;color:#725d34}.evidence ul,.callout ul,.tasks{margin:5px 0;padding-left:20px}.evidence li span{display:block;color:var(--muted)}.callout{margin:8px 0;padding:9px 11px;border-radius:6px}.callout.remaining{background:#fff3dd}.callout.decision{background:#eee8fa}.links,.muted,small{color:var(--muted)}.empty{padding:28px;text-align:center;color:var(--muted)}[hidden]{display:none!important}@media(max-width:760px){main{width:min(100% - 20px,1180px);padding-top:20px}.masthead,.domain>header,.summary,.legend,.dimensions,.toolbar{grid-template-columns:1fr}.toolbar{position:static}.domain{padding:14px}.domain-bar{margin-bottom:8px}.story>summary{align-items:flex-start;flex-wrap:wrap}.story-title{flex-basis:70%}}
</style></head><body><main><header class="masthead"><div><p class="eyebrow">Current checkout · documentation-derived</p><h1>Agency specification coverage</h1></div><div><strong>${total.stories}</strong> canonical stories<br><span class="muted">${total.coverage.criteria.total} acceptance criteria</span></div></header><p class="lede">A navigable view of canonical specifications, explicit manual source assessments, recorded proof, task links, missing criteria and external decisions.</p><aside class="notice"><strong>Two independent dimensions:</strong> code implementation says what the source assessment found; verification proof says which focused, native/fixture or live-model runs are recorded. <strong>No run recorded</strong> is neither missing code nor a failed test. A linked or done task is not story completeness, and a partial story is not a product or effort percentage.</aside><section class="inputs" aria-label="Report inputs"><p><strong>Manual assessment inputs:</strong> ${manualInputs}</p><p><strong>Generated machine inventory:</strong> <code>.dev-docs/coverage/generated/inventory.json</code> (refresh; do not assess here)</p><p><strong>Generated HTML:</strong> <code>.dev-docs/coverage/generated-report.html</code> (refresh; do not edit)</p><p><strong>Generator and focused tests:</strong> <code>.dev-docs/coverage/src/</code></p><p><strong>Refresh both generated views:</strong> <code>node scripts/agency-spec-progress.mjs --refresh</code> (from <code>ai-company</code>)</p></section><section class="summary">${scopeCard('settled', report.scopes.settled)}${scopeCard('proposal', report.scopes.proposal)}</section><section class="legend" aria-label="Status legend"><div><h3>Code implementation</h3><p><b>Implemented</b>, <b>Partial</b>, <b>Missing</b> and <b>Unassessed</b> are manual criterion-level source assessments.</p><small>Criterion totals come directly from those assessments. Story code status is derived: all criteria implemented → Implemented; all missing → Missing; mixed assessed states → Partial; all unassessed → Unassessed.</small></div><div><h3>Verification proof</h3><p><b>Focused</b>, <b>Native app / fixture</b> and <b>Live-model</b> are separate proof channels.</p><small>Passed means a passing proof claim is recorded. No run recorded and Not assessed do not mean failed, and neither changes the code status. Task done records bounded task delivery, not story completion.</small></div></section><section class="dimensions"><div><h3>Code implementation · acceptance criteria</h3>${coverageBar(total.coverage, 'criteria')}<small>${total.coverage.criteria.total} canonical criterion statuses; story totals above are derived from them.</small></div><div><h3>Verification proof · independent</h3><div class="proof-counts"><span>Focused proof passed <strong>${total.coverage.verification.focused.passed}</strong></span><span>Native app / fixture proof passed <strong>${total.coverage.verification.nativeApp.passed}</strong></span><span>Live-model proof passed <strong>${total.coverage.verification.liveModel.passed}</strong></span><span>External decisions <strong>${total.coverage.criteriaWithExternalDecisions}</strong></span></div><small>Proof counts can overlap and never replace the source implementation assessment.</small></div></section><div class="toolbar" role="search"><label>Search<input id="search" type="search" placeholder="Story, criterion, task, evidence…"></label><label>Scope<select id="scope"><option value="">All</option><option value="settled">Settled</option><option value="proposal">Proposed</option></select></label><label>Code status<select id="state"><option value="">All</option>${implementationStates.map((state) => `<option value="${state}">${stateLabel(state)}</option>`).join('')}</select></label><label>Proof / gaps<select id="proof"><option value="">All</option><option value="focused">Focused proof passed</option><option value="nativeApp">Native app / fixture proof passed</option><option value="liveModel">Live-model proof passed</option><option value="missing">Has recorded missing behavior</option><option value="decision">Needs external decision</option></select></label><div id="visible-count" aria-live="polite"></div></div><div id="domains">${domains}</div><p id="empty" class="empty" hidden>No stories match these filters.</p><script>(()=>{const q=id=>document.getElementById(id),stories=[...document.querySelectorAll('[data-story]')],features=[...document.querySelectorAll('[data-feature]')],domains=[...document.querySelectorAll('[data-domain]')];function apply(){const text=q('search').value.trim().toLowerCase(),scope=q('scope').value,state=q('state').value,proof=q('proof').value;let visible=0;for(const story of stories){const proofMatch=!proof||(proof==='decision'?story.dataset.decision==='true':proof==='missing'?story.dataset.missing==='true':story.dataset.proof.split(' ').includes(proof));const show=(!text||story.dataset.search.includes(text))&&(!scope||story.dataset.scope===scope)&&(!state||story.dataset.state===state)&&proofMatch;story.hidden=!show;if(show)visible++}for(const feature of features)feature.hidden=![...feature.querySelectorAll('[data-story]')].some(story=>!story.hidden);for(const domain of domains)domain.hidden=![...domain.querySelectorAll('[data-story]')].some(story=>!story.hidden);q('visible-count').textContent='Showing '+visible+' of '+stories.length+' stories';q('empty').hidden=visible!==0}for(const id of ['search','scope','state','proof'])q(id).addEventListener('input',apply);apply()})()</script></main></body></html>`
}

export async function writeHtmlReport(report, outputPath, appRoot = defaultAppRoot) {
  const resolved = path.resolve(outputPath)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, renderHtmlReport(report, { appRoot, outputPath: resolved }), 'utf8')
  return resolved
}

export function buildInventorySnapshot(report) {
  const taskStates = [...new Set(report.tasks.map((task) => task.state))].sort()
  const storyInventory = (story) => ({
    id: story.id, source: story.source, domain: story.domain, featureId: story.featureId,
    featureTitle: story.featureTitle, category: story.category, epic: story.epic, title: story.title,
    scope: story.scope, scopeStatus: story.scopeStatus, processSteps: story.processSteps,
    criteria: story.criteria.map(({ id, text, line }) => ({ id, text, line })),
    taskIds: story.taskIds, doneTaskIds: story.doneTaskIds, adrIds: story.adrIds,
    mappingEvidence: story.mappingEvidence,
    taskEvidence: story.taskEvidence.map(({ id, title, source, state, stateLabel, stateLine, owns, taskGroup, mappingBasis }) => ({ id, title, source, state, stateLabel, stateLine, owns, taskGroup, mappingBasis })),
  })
  return {
    version: 1,
    interpretation: 'Deterministic machine-derived inventory of canonical specifications, tasks (including archive), mappings and diagnostics. It contains no manual implementation, evidence, missing-work, proof or external-decision assessments.',
    totals: {
      domains: report.domains.length, features: report.totals.features, stories: report.totals.stories,
      criteria: report.stories.reduce((sum, story) => sum + story.criteria.length, 0), tasks: report.tasks.length,
      tasksByState: Object.fromEntries(taskStates.map((state) => [state, report.tasks.filter((task) => task.state === state).length])),
      mappedStories: report.totals.mapped, taskLinkedStories: report.totals.taskLinked,
    },
    hierarchy: report.hierarchy.map((domain) => ({
      domain: domain.domain, categories: domain.categories, epics: domain.epics,
      features: domain.features.map((feature) => ({ id: feature.id, titles: feature.titles, children: feature.children.map(storyInventory) })),
    })),
    tasks: report.tasks,
    unmappedStories: report.unmappedStories,
    storiesWithoutTasks: report.storiesWithoutTasks,
    tasksWithoutStories: report.tasksWithoutStories,
    diagnostics: report.inventoryDiagnostics,
  }
}

export async function refreshOutputs(report, appRoot = defaultAppRoot) {
  const htmlPath = path.join(appRoot, '.dev-docs', 'coverage', 'generated-report.html')
  const inventoryPath = path.join(appRoot, '.dev-docs', 'coverage', 'generated', 'inventory.json')
  await mkdir(path.dirname(inventoryPath), { recursive: true })
  await Promise.all([
    writeHtmlReport(report, htmlPath, appRoot),
    writeFile(inventoryPath, `${JSON.stringify(buildInventorySnapshot(report), null, 2)}\n`, 'utf8'),
  ])
  return { htmlPath, inventoryPath }
}
