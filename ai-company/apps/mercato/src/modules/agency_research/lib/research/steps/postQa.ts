import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import { findingKinds, type QaFinding } from '../../../data/schemas/qa'
import { postDataSchema, type PostData } from '../../../data/schemas/post'
import { tovDataSchema, type TovData } from '../../../data/schemas/tov'
import { zleceniePostuDataSchema, type ZleceniePostuData } from '../../../data/schemas/zleceniePostu'
import { postEditorResult, type PostEditorInput, type PostEditorReview } from '../../../data/agents/post'
import { mustKeysOf } from '../../../data/contracts'
import { idPrefixes, limits } from '../../../data/templates'
import { RESEARCH_POST_EDITOR_AGENT_ID } from '../../agents/ids.post'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { openEscalation, type EscalationInput } from '../escalate'
import { mintId, resolveId } from '../ids'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { renderPost, renderPostClientView } from '../render/post'
import { simulationIssue } from '../simulation'
import { normalizeForMatch } from '../util'
import type { StepContext, StepOutcome } from './context'
import { forbiddenLinks, knownPostIds, normalizeUrl, prohibitedClaimsFound, unsupportedNumbers } from './post'
import { slopValidatorFindings } from '../deslop'

/**
 * Step 7.3 — Q-T, the independent editor. Code computes the deterministic
 * findings first (fragments verbatim, ids resolved, links allowed, digits backed
 * by a card, prohibited claims, MUST keys, the length metrics, no approval
 * recorded by anyone, the deslop word lists); the editor agent reads what needs reading and answers the
 * ToV copy checks; the verdict is exactly one of pass_for_draft / needs_fix /
 * reject. Every editor pass is a NEW KLI-POST version with the review inside —
 * versions never change. Exhausted repairs open an E.1 exception.
 */

export type PostQaVerdict = 'pass_for_draft' | 'needs_fix' | 'reject'

const MUST_FIELDS = mustKeysOf('WZR-POST')

const finding = (code: QaFinding['code'], path: string, gap: string, severity: QaFinding['severity'] = 'blocking', owner: QaFinding['owner'] = 'agent', hint: string | null = null): QaFinding => ({
  code,
  path,
  severity,
  gap,
  owner,
  fix_step: owner === 'agent' ? '7.2' : null,
  fix_hint: hint,
})

/** Deterministic checks — the validator half of Q-T. Every finding is an agent fault repaired in 7.2. */
export function postValidatorFindings(args: { post: PostData; instruction: ZleceniePostuData }): QaFinding[] {
  const { post, instruction } = args
  const findings: QaFinding[] = []
  const record = post as unknown as Record<string, unknown>
  for (const key of MUST_FIELDS) {
    const value = record[key]
    const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0 && key !== 'links_and_mentions')
    if (empty) findings.push(finding('missing_must_field', `KLI-POST.${key}`, `MUST field ${key} is empty`))
  }
  const known = knownPostIds(instruction)
  const text = normalizeForMatch(post.text)
  post.claims_map.forEach((row, index) => {
    const path = `KLI-POST.claims_map[${row.id}]`
    if (!text.includes(normalizeForMatch(row.fragment))) findings.push(finding('quote_not_verbatim', path, `fragment ${index + 1} is not a verbatim run of the text`))
    for (const id of [row.claim_id, ...row.fact_ids, ...row.creative_payload_ids, ...row.source_ids]) {
      if (id && !known.has(id)) findings.push(finding('unresolved_reference', path, `${id} is not an id of the evidence payload`))
    }
    if (row.kind === 'fact' && row.claim_id === null && row.fact_ids.length === 0) findings.push(finding('unsourced_claim', path, `a fact fragment cites no evidence card: "${row.fragment.slice(0, 60)}"`))
  })
  for (const url of forbiddenLinks(post.text, instruction)) findings.push(finding('other', 'KLI-POST.text', `${url} is not an allowed link of the instruction`))
  const allowedLinks = new Set(instruction.delivery_constraints.links.map((link) => normalizeUrl(link.url)))
  const allowedMentions = new Set(instruction.delivery_constraints.mentions.map((mention) => normalizeForMatch(mention)))
  post.links_and_mentions.forEach((row, index) => {
    const allowed = row.type === 'link' ? allowedLinks.has(normalizeUrl(row.value)) : allowedMentions.has(normalizeForMatch(row.value))
    if (!allowed) findings.push(finding('other', `KLI-POST.links_and_mentions[${index}]`, `${row.type} ${row.value} is not in the instruction`))
    if (row.opened_during_authoring) findings.push(finding('other', `KLI-POST.links_and_mentions[${index}]`, 'a link was opened during authoring; the author works without network'))
  })
  for (const number of unsupportedNumbers(post.text, instruction)) findings.push(finding('unsourced_claim', 'KLI-POST.text', `"${number}" appears in the text but in no evidence card`))
  for (const claim of prohibitedClaimsFound(post.text, instruction.delivery_constraints.prohibited_claims)) findings.push(finding('contradiction', 'KLI-POST.text', `the text carries a prohibited claim: ${claim}`))
  const metrics = post.qa.metrics
  if (metrics.platform_limit_compliance === 'over_limit') findings.push(finding('limit_exceeded', 'KLI-POST.text', `${metrics.character_count_with_spaces_and_newlines} characters, adapter limit ${metrics.platform_character_limit}`))
  if (!metrics.within_internal_word_target) findings.push(finding('limit_exceeded', 'KLI-POST.text', `${metrics.word_count} words, target ${metrics.words_target[0]}–${metrics.words_target[1]}`, 'major'))
  if (metrics.client_note_word_count > metrics.client_note_max_words) findings.push(finding('limit_exceeded', 'KLI-POST.client_note', `${metrics.client_note_word_count} words, limit ${metrics.client_note_max_words}`))
  if (post.target.publication_allowed || post.qa.real_approval_recorded || post.qa.publication_gate === 'open') {
    findings.push(finding('other', 'KLI-POST.qa.publication_gate', 'a publication or approval state was recorded without a client decision'))
  }
  if (post.qa.additional_sources_used !== 0 || post.qa.additional_research_performed !== 0) findings.push(finding('other', 'KLI-POST.qa', 'the author reports research outside the instruction'))
  if (post.qa.unsupported_facts_added > 0) findings.push(finding('unsourced_claim', 'KLI-POST.qa.unsupported_facts_added', `${post.qa.unsupported_facts_added} unsupported fact row(s)`))
  // deslop's deterministic half: catalogue phrases and budgets, minor/major only — the editor confirms them against the ToV.
  findings.push(...slopValidatorFindings(post.text))
  return findings
}

const isFindingKind = (code: string): code is QaFinding['code'] => (findingKinds as readonly string[]).includes(code)

/** The editor's findings in the QA finding shape: blockers are blocking agent faults; the rest travel as major/minor notes. */
export function editorFindingsAsQa(review: PostEditorReview): QaFinding[] {
  return review.findings.map((item) => ({
    code: isFindingKind(item.code) ? item.code : 'other',
    path: item.fragment ? `KLI-POST.text["${item.fragment.slice(0, 40)}"]` : 'KLI-POST.text',
    severity: item.severity === 'blocker' ? 'blocking' : item.severity,
    gap: item.issue,
    owner: 'agent',
    fix_step: '7.2',
    fix_hint: item.fix_hint,
  }))
}

/** The verdict rules, in one place: a rejection stands, then any blocker or an editor `needs_fix`, else pass. */
export function mergePostQaVerdict(validator: QaFinding[], review: PostEditorReview): PostQaVerdict {
  if (review.result === 'reject') return 'reject'
  const blocking = [...validator, ...editorFindingsAsQa(review)].some((item) => item.severity === 'blocking')
  if (blocking || review.result === 'needs_fix') return 'needs_fix'
  return 'pass_for_draft'
}

const T = {
  pl: {
    reviewer: 'Agent redaktor, osobny od autora postu',
    reviewType: 'semantic_review_against_frozen_payload',
    pass: 'kontrola redaktora zaliczona — szkic do akceptacji klienta, publikacja zablokowana',
    fix: 'kontrola redaktora: do poprawy w 7.2',
    reject: 'kontrola redaktora: odrzucony — ujęcie nie mieści się w instrukcji',
    reviewTypeLabel: 'samoocena autora + osobna kontrola redaktora (7.3)',
  },
  en: {
    reviewer: 'Editor agent, separate from the post author',
    reviewType: 'semantic_review_against_frozen_payload',
    pass: 'editor review passed — draft for client approval, publication blocked',
    fix: 'editor review: fix in 7.2',
    reject: 'editor review: rejected — the angle does not fit the instruction',
    reviewTypeLabel: 'author self-check + separate editor review (7.3)',
  },
} as const

/** Pure: the reviewed version's data — the editor's review inside the qa block, the editor's copy-check answers winning over the self-check. */
export function applyEditorReview(args: { outputLanguage: 'pl' | 'en'; post: PostData; review: PostEditorReview; verdict: PostQaVerdict }): PostData {
  const { post, review, verdict } = args
  const t = T[args.outputLanguage]
  const editorChecks = new Map(review.copy_checks.map((check) => [check.id, check]))
  return postDataSchema.parse({
    ...post,
    qa: {
      ...post.qa,
      review_type: t.reviewTypeLabel,
      status: verdict === 'pass_for_draft' ? t.pass : verdict === 'reject' ? t.reject : t.fix,
      is_independent_review: true,
      independent_editor_review: {
        reviewer: t.reviewer,
        review_type: t.reviewType,
        result: review.result,
        checked: review.checked,
        not_verified: review.not_verified,
        findings: review.findings,
        new_research: 0,
        is_client_approval: false,
      },
      copy_checks: post.qa.copy_checks.map((check) => {
        const answer = editorChecks.get(check.id)
        return answer ? { ...check, result: answer.result, evidence: answer.evidence } : check
      }),
      publication_gate: 'blocked',
      real_approval_recorded: false,
    },
  })
}

export type PostQaOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  post: PostData
  instruction: ZleceniePostuData
  tov: TovData
  validatorFindings?: QaFinding[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
}

export type PostQaResult = { verdict: PostQaVerdict; findings: QaFinding[]; review: PostEditorReview; summary: string }

const CRITERIA = [
  'No statement about the company, its clients, numbers, results or the market goes beyond an evidence card.',
  'A question, a metaphor or a hypothetical reader situation never poses as a research result.',
  'The text serves the selected topic: audience, goal, main message, angle and the reader value.',
  'The voice follows the extract and the copy checks; clichés from the ToV are absent.',
  'Only allowed links and mentions; the CTA promises no page, gift or reaction time without a card.',
  'Length within the target and under the platform limit when one is given.',
  'The author added no sources and did no research; unverifiable items are named, not assumed.',
  'Style (deslop, detect mode): no invented specific, no forbidden evidence upgrade; catalogue patterns and watched words are listed as slop_pattern findings with the fragment and a fix, the ToV winning on sanctioned structures.',
  'This review is editorial, never the client\'s approval.',
]

function editorInput(opts: PostQaOptions, validator: QaFinding[]): PostEditorInput {
  const { order, post, instruction, tov } = opts
  return {
    order: { brand: order.brand, market: order.market, language: order.language, sku: order.sku },
    outputLanguage: opts.outputLanguage,
    text: post.text,
    claims_map: post.claims_map.map((row) => ({ id: row.id, fragment: row.fragment, claim_id: row.claim_id, fact_ids: row.fact_ids, kind: row.kind, evidence_kind: row.evidence_kind, limitation: row.limitation })),
    links_and_mentions: post.links_and_mentions.map((row) => ({ type: row.type, value: row.value, purpose: row.purpose, operational_status: row.operational_status })),
    client_note: post.client_note,
    selected_item: instruction.selected_item,
    evidence_payload: instruction.evidence_payload.map((card) => ({ claim_id: card.claim_id, kind: card.kind, text: card.text, fact_ids: card.fact_ids, limitations: card.limitations, permitted_copy: card.permitted_copy })),
    reader_value: instruction.reader_value,
    voice_extract: instruction.voice_extract,
    prohibited_claims: instruction.delivery_constraints.prohibited_claims,
    allowed_links: instruction.delivery_constraints.links.map((link) => link.url),
    copy_checks: tov.copy_checks.map((question, index) => ({ id: mintId(idPrefixes.copyCheck, index, '-'), question })),
    length: {
      words: post.qa.metrics.word_count,
      words_target: post.qa.metrics.words_target,
      platform_character_limit: post.qa.metrics.platform_character_limit,
      characters: post.qa.metrics.character_count_with_spaces_and_newlines,
    },
    validator_findings: validator,
    criteria: CRITERIA,
  }
}

/** The editor's fragments must be in the text (else null) and its copy-check ids must be the ToV's. */
export function gateEditorReview(review: PostEditorReview, post: PostData): { value: PostEditorReview; issues: never[]; kept: number; dropped: number } {
  const text = normalizeForMatch(post.text)
  const checkIds = post.qa.copy_checks.map((check) => check.id)
  const findings = review.findings.map((item) => (item.fragment && !text.includes(normalizeForMatch(item.fragment)) ? { ...item, fragment: null } : item))
  const copyChecks = review.copy_checks.flatMap((check) => {
    const id = resolveId(check.id, checkIds)
    return id ? [{ ...check, id }] : []
  })
  return { value: { ...review, findings, copy_checks: copyChecks }, issues: [], kept: findings.length + copyChecks.length, dropped: review.copy_checks.length - copyChecks.length }
}

export async function runPostQa(opts: PostQaOptions): Promise<PostQaResult & { stats: { agentCalls: number; cachedSteps: number } }> {
  const onEvent = opts.onEvent ?? (() => {})
  const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
  const step = createStepRunner({
    runAgent: opts.runAgent,
    ledger: opts.ledger,
    models: opts.models,
    cache: opts.cache,
    groundingRetries: limits.generation.groundingRetries,
    onEvent,
    timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
    stats,
  })
  const validator = opts.validatorFindings ?? postValidatorFindings({ post: opts.post, instruction: opts.instruction })
  const { value: review } = await step<PostEditorReview>({
    step: '7.3',
    agentId: RESEARCH_POST_EDITOR_AGENT_ID,
    label: 'post_editor',
    input: editorInput(opts, validator),
    parse: (raw) => postEditorResult.parse(raw).data,
    gate: (data) => gateEditorReview(data, opts.post),
  })
  const findings = [...validator, ...editorFindingsAsQa(review)]
  return { verdict: mergePostQaVerdict(validator, review), findings, review, summary: review.summary, stats: { agentCalls: stats.agentCalls, cachedSteps: stats.cachedSteps } }
}

export type PostQaLoopResult = {
  verdict: PostQaVerdict
  findings: QaFinding[]
  taskRunId: string
  repairs: number
  postVersionId: string | null
  escalationVersionId?: string
}

/** The resolutions a Q-T exhaustion allows: rerun the author with staff guidance, accept a finding as a limit, or keep the block. */
export function postQaExhaustedResolutions(): EscalationInput['allowedResolutions'] {
  return [
    { code: 'rerun_with_guidance', requiredEvidence: 'A note naming which finding was misjudged or what the author must do differently.', permittedNextStep: '7.2' },
    { code: 'accept_with_explicit_limit', requiredEvidence: 'The finding recorded as a limitation on the post version, visible to the client.', permittedNextStep: '7.4' },
    { code: 'return_to_instruction', requiredEvidence: 'Which evidence the instruction lacks; the return point is 6.7 (or a P3 task).', permittedNextStep: '6.7' },
    { code: 'keep_blocked', requiredEvidence: 'The reason the order cannot proceed and who must act.', permittedNextStep: 'none' },
  ]
}

const asIssue = (item: QaFinding): DocumentIssue => ({ code: item.code.toUpperCase(), severity: item.severity, detail: item.gap, path: item.path })

/**
 * 7.3 with its return path: the editor judges the current version; a `needs_fix`
 * (or `reject`) re-runs 7.2 with the findings as repair input (≤ STD-LIMITY
 * post repair attempts), then E.1 `qa_exhausted` with resume point 7.2. A pass
 * moves the reviewed version to `ready_for_review` — the client's approval (7.4)
 * and the publication consent are separate records the spine owns.
 */
export async function runPostQaLoop(ctx: StepContext, deps: { postStep: (ctx: StepContext) => Promise<StepOutcome> }): Promise<PostQaLoopResult> {
  if (ctx.postInputs && !ctx.postOutputs) throw new Error('[internal] Pinned post QA requires its own post output')
  const maxRepairs = ctx.postQaRepairAttempts ?? limits.content.postRepairAttempts
  const load = async () => {
    const post = ctx.postInputs ? ctx.postOutputs!.post : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-POST')
    const instruction = ctx.postInputs ? ctx.postInputs.instruction : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZLECENIE-POSTU')
    const tov = ctx.postInputs ? ctx.postInputs.tov : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-TOV')
    if (!post || !instruction || !tov) throw new Error('[internal] 7.3 needs current KLI-POST, WEW-ZLECENIE-POSTU and KLI-TOV versions')
    const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })
    return { post, instruction, tov, inputVersions: [ctx.orderVersion, pin(post), pin(instruction), pin(tov)] }
  }
  let repairs = 0
  for (;;) {
    const current = await load()
    const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '7.3', attempt: repairs + 1, runner: ctx.runner, models: ctx.models, inputVersions: current.inputVersions })
    ctx.taskRunIds.push(run.id)
    let result: PostQaResult
    let savedId: string
    try {
      const post = postDataSchema.parse(current.post.data)
      result = await runPostQa({
        order: ctx.order,
        outputLanguage: ctx.order.outputLanguage,
        post,
        instruction: zleceniePostuDataSchema.parse(current.instruction.data),
        tov: tovDataSchema.parse(current.tov.data),
        runAgent: ctx.runAgent,
        ledger: ctx.ledger,
        models: ctx.models,
        cache: ctx.cache,
        onEvent: ctx.onEvent,
      })
      const reviewed = applyEditorReview({ outputLanguage: ctx.order.outputLanguage, post, review: result.review, verdict: result.verdict })
      const simulation = simulationIssue(ctx.postInputs
        ? current.inputVersions.filter((input) => input.document_id !== current.post.document_id)
        : current.inputVersions)
      const issues: DocumentIssue[] = [...result.findings.map(asIssue), ...(simulation ? [{ ...simulation, path: 'target.publication_status' }] : [])]
      const view = renderPostClientView({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: reviewed })
      const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
        orderRef: ctx.orderRef,
        brand: ctx.order.brand,
        templateId: 'WZR-POST',
        status: result.verdict === 'pass_for_draft' ? 'ready_for_review' : 'draft',
        inputVersions: current.inputVersions,
        data: reviewed as unknown as Record<string, unknown>,
        issues,
        renderedMd: renderPost({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: reviewed, issues }),
        clientViewMd: view.markdown,
        taskRunId: run.id,
        qaResult: { verdict: result.verdict, findings: result.findings, summary: result.summary, repairs },
        simulation: simulation !== null,
      })
      savedId = saved.version.id
      if (ctx.postInputs && ctx.postOutputs) {
        ctx.postOutputs.post = {
          document_id: saved.envelope.document_id, version: saved.envelope.version, status: saved.envelope.status,
          versionId: saved.version.id, data: reviewed,
        }
      }
      ctx.documentVersionIds.push(savedId)
    } catch (error) {
      await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
      throw error
    }
    await finishTaskRun(ctx.em, run, {
      status: result.verdict === 'pass_for_draft' ? 'done' : 'to_fix',
      outputVersionId: savedId,
      qaResult: { verdict: result.verdict, findings: result.findings, summary: result.summary, repairs },
      agentRunIds: ctx.agentRunIds,
      cost: ctx.ledger.snapshot(),
    })
    ctx.log(`7.3 attempt ${repairs + 1}: ${result.verdict} (${result.findings.length} findings)`)
    if (result.verdict === 'pass_for_draft') return { verdict: result.verdict, findings: result.findings, taskRunId: run.id, repairs, postVersionId: savedId }

    const blocking = result.findings.filter((item) => item.severity === 'blocking' && item.owner === 'agent')
    if (repairs < maxRepairs) {
      repairs += 1
      ctx.log(`7.3 → repair 7.2 (attempt ${repairs} of ${maxRepairs})`)
      await deps.postStep({ ...ctx, repairFindings: blocking.length ? blocking : result.findings, attempt: repairs + 1 })
      continue
    }
    const escalation = await openEscalation(
      ctx,
      {
        code: 'qa_exhausted',
        summary: `Post QA (Q-T) still ${result.verdict} after ${repairs} repair attempt(s) (STD-LIMITY post_repair_attempts = ${maxRepairs}): ${result.summary}`,
        triggerStep: '7.3',
        evidence: [
          { ref: run.id, fact: `7.3 task run, verdict ${result.verdict}, ${blocking.length} blocking findings` },
          { ref: savedId, fact: 'the reviewed KLI-POST version with the editor findings' },
          ...blocking.slice(0, 10).map((item) => ({ ref: item.path, fact: `${item.code}: ${item.gap}` })),
        ],
        blockedSteps: ['7.4', '7.5', '7.6', '7.7', '8.1', '8.2', '8.3', '8.7', '9.1', '9.3'],
        decisionQuestion: 'Which finding should be accepted as an explicit limit, should the author rerun with guidance, or does the instruction need different evidence (return to 6.7)?',
        allowedResolutions: postQaExhaustedResolutions(),
        resumeStep: '7.2',
      },
      current.inputVersions,
    )
    return { verdict: result.verdict, findings: result.findings, taskRunId: run.id, repairs, postVersionId: savedId, escalationVersionId: escalation.versionId }
  }
}
