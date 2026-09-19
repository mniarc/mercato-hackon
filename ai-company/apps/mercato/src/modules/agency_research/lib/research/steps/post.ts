import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { QaFinding } from '../../../data/schemas/qa'
import { postDataSchema, type PostData } from '../../../data/schemas/post'
import { zleceniePostuDataSchema, type ZleceniePostuData } from '../../../data/schemas/zleceniePostu'
import { postAuthorResult, type PostAuthorInput, type PostDraft } from '../../../data/agents/post'
import { idPrefixes, limits } from '../../../data/templates'
import { RESEARCH_POST_AUTHOR_AGENT_ID } from '../../agents/ids.post'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { GateError, type GateIssue } from '../gate'
import { mintId, resolveId } from '../ids'
import type { Ledger } from '../ledger'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { renderPost, renderPostClientView } from '../render/post'
import { simulationIssue } from '../simulation'
import { countClientWords, normalizeForMatch, wordSetSimilarity } from '../util'
import type { StepContext, StepOutcome } from './context'
import { isSpecialistTov, parseDownstreamTov, tovCopyChecks, type DownstreamTov } from './tovInput'

/**
 * Step 7.2 — KLI-POST. The author is asked once with the instruction and the ToV
 * as its whole world; the document is assembled here: every claims-map fragment
 * must be a verbatim run of the text, every cited id must exist in the
 * instruction's evidence payload, every link in the text must be an allowed link,
 * every digit must be present in an evidence card, prohibited claims stay out.
 * The target, the metrics and the qa block are computed, never written by the
 * model; the editor (7.3) fills `independent_editor_review` in a new version.
 */

export type PostPipelineOptions = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  instruction: ZleceniePostuData
  tov: DownstreamTov
  previousPost?: PostData | null
  repairFindings?: QaFinding[]
  /** True when a consumed client-facing input is not approved (`simulation_flag`). */
  simulated?: boolean
  /** The version label the author's self-check is bound to ("1.0", "2.0", …). */
  versionLabel?: string
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
  groundingRetries?: number
}

export type PostPipelineResult = {
  data: PostData
  issues: DocumentIssue[]
  clientViewMd: string
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}

const issue = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

const URL_PATTERN = /https?:\/\/[^\s)>\]"']+/g
const NUMBER_PATTERN = /\d+(?:[.,]\d+)*%?/g
const PROHIBITED_SIMILARITY = 0.6

/** Trailing punctuation belongs to the sentence, not to the address. */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/[.,;:!?)]+$/g, '').replace(/\/+$/, '').toLowerCase()
}

/** Every id the author may cite: claims, facts, seeds, sources of the evidence payload. */
export function knownPostIds(instruction: ZleceniePostuData): Set<string> {
  const known = new Set<string>()
  for (const card of instruction.evidence_payload) {
    known.add(card.claim_id)
    if (card.fact_id) known.add(card.fact_id)
    if (card.seed_id) known.add(card.seed_id)
    for (const id of card.fact_ids) known.add(id)
    for (const id of card.source_ids) known.add(id)
    for (const source of card.source_payload) known.add(source.source_id)
  }
  return known
}

/** The corpus a digit in the post must come from: evidence texts, the topic, the reader value, the allowed links. */
export function evidenceCorpus(instruction: ZleceniePostuData): string {
  return [
    ...instruction.evidence_payload.flatMap((card) => [card.text, card.permitted_copy ?? '', ...card.limitations]),
    instruction.selected_item.main_message,
    instruction.selected_item.angle,
    instruction.selected_item.audience_question,
    instruction.reader_value.title,
    ...instruction.reader_value.items,
    instruction.reader_value.example_option ?? '',
    ...instruction.delivery_constraints.links.map((link) => link.url),
    ...instruction.delivery_constraints.mentions,
  ].join('\n')
}

/** Digits in the text that no evidence card contains; list markers at a line start are structure, not claims. */
export function unsupportedNumbers(text: string, instruction: ZleceniePostuData): string[] {
  const corpus = evidenceCorpus(instruction)
  const corpusNumbers = new Set(corpus.match(NUMBER_PATTERN) ?? [])
  const body = text.replace(/^\s*\d+[.)]\s/gm, ' ')
  const found = body.match(NUMBER_PATTERN) ?? []
  return [...new Set(found.filter((number) => !corpusNumbers.has(number) && !corpusNumbers.has(number.replace(/%$/, ''))))]
}

/** URLs in the text that are not in the instruction's allowed links. */
export function forbiddenLinks(text: string, instruction: ZleceniePostuData): string[] {
  const allowed = new Set(instruction.delivery_constraints.links.map((link) => normalizeUrl(link.url)))
  const found = text.match(URL_PATTERN) ?? []
  return [...new Set(found.filter((url) => !allowed.has(normalizeUrl(url))))]
}

const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0)

/** A prohibited claim present verbatim or as a near-identical sentence. */
export function prohibitedClaimsFound(text: string, prohibited: string[]): string[] {
  const normalised = normalizeForMatch(text)
  const parts = sentences(text)
  return prohibited.filter((claim) => {
    const target = normalizeForMatch(claim)
    if (target.length && normalised.includes(target)) return true
    return parts.some((sentence) => wordSetSimilarity(sentence, claim) >= PROHIBITED_SIMILARITY)
  })
}

function keepKnown(ids: string[], known: Set<string>, path: string, issues: GateIssue[]): string[] {
  const kept: string[] = []
  for (const cited of ids) {
    const resolved = resolveId(cited, known)
    if (resolved) kept.push(resolved)
    else issues.push(issue('UNKNOWN_ID', path, `${cited} is not an id of the evidence payload; dropped`))
  }
  return [...new Set(kept)]
}

/**
 * The gate over the author's draft. A forbidden link, an unsupported number or a
 * prohibited claim rejects the whole call (the text itself is wrong); an unknown
 * id or a fragment not in the text drops the row with an issue. A draft whose
 * claims map is empty after the drops is rejected as well — a post nobody can
 * check is not evidence of anything.
 */
export function gatePostDraft(draft: PostDraft, instruction: ZleceniePostuData): { value: PostDraft; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const blocking: GateIssue[] = []
  for (const url of forbiddenLinks(draft.text, instruction)) blocking.push(issue('FORBIDDEN_LINK', 'text', `${url} is not an allowed link of the instruction`, 'dropped'))
  for (const number of unsupportedNumbers(draft.text, instruction)) blocking.push(issue('UNSUPPORTED_NUMBER', 'text', `"${number}" appears in the text but in no evidence card`, 'dropped'))
  for (const claim of prohibitedClaimsFound(draft.text, instruction.delivery_constraints.prohibited_claims)) blocking.push(issue('PROHIBITED_CLAIM', 'text', `the text carries a prohibited claim: ${claim}`, 'dropped'))
  if (blocking.length) throw new GateError('post_author text', blocking)

  const known = knownPostIds(instruction)
  const text = normalizeForMatch(draft.text)
  const claims: PostDraft['claims_map'] = []
  draft.claims_map.forEach((row, index) => {
    const path = `claims_map[${index}]`
    if (!text.includes(normalizeForMatch(row.fragment))) {
      issues.push(issue('FRAGMENT_NOT_IN_TEXT', path, `"${row.fragment.slice(0, 60)}" is not a verbatim run of the text; dropped`, 'dropped'))
      return
    }
    const claimId = row.claim_id ? resolveId(row.claim_id, known) : null
    if (row.claim_id && !claimId) issues.push(issue('UNKNOWN_ID', `${path}.claim_id`, `${row.claim_id} is not an id of the evidence payload; cleared`))
    claims.push({
      ...row,
      claim_id: claimId,
      fact_ids: keepKnown(row.fact_ids, known, `${path}.fact_ids`, issues),
      creative_payload_ids: keepKnown(row.creative_payload_ids, known, `${path}.creative_payload_ids`, issues),
      source_ids: keepKnown(row.source_ids, known, `${path}.source_ids`, issues),
    })
  })
  if (!claims.length) throw new GateError('post_author claims_map', [issue('CLAIMS_MAP_EMPTY', 'claims_map', 'no claims-map row survived the fragment check', 'dropped'), ...issues])

  const allowedLinks = new Set(instruction.delivery_constraints.links.map((link) => normalizeUrl(link.url)))
  const allowedMentions = new Set(instruction.delivery_constraints.mentions.map((mention) => normalizeForMatch(mention)))
  const links: PostDraft['links_and_mentions'] = []
  draft.links_and_mentions.forEach((row, index) => {
    const path = `links_and_mentions[${index}]`
    const allowed = row.type === 'link' ? allowedLinks.has(normalizeUrl(row.value)) : allowedMentions.has(normalizeForMatch(row.value))
    if (!allowed) {
      issues.push(issue('LINK_NOT_ALLOWED', path, `${row.type} ${row.value} is not in the instruction; dropped`, 'dropped'))
      return
    }
    links.push({
      ...row,
      claim_id: row.claim_id ? resolveId(row.claim_id, known) : null,
      fact_id: row.fact_id ? resolveId(row.fact_id, known) : null,
      source_id: row.source_id ? resolveId(row.source_id, known) : null,
    })
  })
  const dropped = draft.claims_map.length - claims.length + (draft.links_and_mentions.length - links.length)
  return { value: { ...draft, claims_map: claims, links_and_mentions: links }, issues, kept: claims.length + links.length, dropped }
}

/** The metrics of a text as Rafał's rule counts them: visible tokens; URLs are single tokens. */
export function postMetrics(text: string, clientNote: string, constraints: ZleceniePostuData['delivery_constraints']): PostData['qa']['metrics'] {
  const wordCount = text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
  const [min, max] = constraints.product_length_target.words
  const limit = constraints.max_text_length
  const characters = text.length
  return {
    word_count: wordCount,
    word_count_rule: constraints.product_length_target.word_count_rule,
    character_count_with_spaces_and_newlines: characters,
    character_count_without_whitespace: text.replace(/\s/g, '').length,
    line_break_count: (text.match(/\n/g) ?? []).length,
    words_target: [min, max],
    within_internal_word_target: wordCount >= min && wordCount <= max,
    client_note_word_count: countClientWords(clientNote),
    client_note_max_words: limits.clientText.postClientNoteWordsMax,
    platform_character_limit: limit,
    platform_limit_compliance: limit === null ? 'unverified' : characters <= limit ? 'within_limit' : 'over_limit',
  }
}

const T = {
  pl: {
    reviewType: 'samoocena autora + osobna kontrola redaktora (7.3)',
    awaiting: 'szkic autora — czeka na kontrolę redaktora',
    observed: 'observed_in_frozen_input',
    notObserved: 'declared_in_instruction_not_observed',
    correctionsNote: (codes: string[]) => `Wersja naprawcza po ustaleniach QA: ${codes.join(', ')}.`,
  },
  en: {
    reviewType: 'author self-check + separate editor review (7.3)',
    awaiting: 'author draft — awaiting editor review',
    observed: 'observed_in_frozen_input',
    notObserved: 'declared_in_instruction_not_observed',
    correctionsNote: (codes: string[]) => `Repair version after QA findings: ${codes.join(', ')}.`,
  },
} as const

/** Pure assembly of the gated draft into KLI-POST data; the rules that belong to code live here. */
export function assemblePost(args: {
  outputLanguage: 'pl' | 'en'
  draft: PostDraft
  instruction: ZleceniePostuData
  tov: DownstreamTov
  simulated: boolean
  versionLabel: string
  repairFindings: QaFinding[]
}): { data: PostData; issues: DocumentIssue[] } {
  const { draft, instruction, tov, outputLanguage } = args
  const t = T[outputLanguage]
  const issues: DocumentIssue[] = []
  const constraints = instruction.delivery_constraints
  const linkByUrl = new Map(constraints.links.map((link) => [normalizeUrl(link.url), link]))
  const metrics = postMetrics(draft.text, draft.client_note, constraints)
  if (metrics.client_note_word_count > metrics.client_note_max_words) {
    issues.push({ code: 'CLIENT_NOTE_OVER_BUDGET', severity: 'limitation', detail: `client note has ${metrics.client_note_word_count} words, limit ${metrics.client_note_max_words}`, path: 'client_note' })
  }
  if (!metrics.within_internal_word_target) {
    issues.push({ code: 'WORD_TARGET_MISSED', severity: 'limitation', detail: `text has ${metrics.word_count} words, target ${metrics.words_target[0]}–${metrics.words_target[1]}`, path: 'text' })
  }
  if (metrics.platform_limit_compliance === 'over_limit') {
    issues.push({ code: 'PLATFORM_LIMIT_EXCEEDED', severity: 'blocking_publication', detail: `${metrics.character_count_with_spaces_and_newlines} characters, adapter limit ${metrics.platform_character_limit}`, path: 'text' })
  }
  if (metrics.platform_limit_compliance === 'unverified') {
    issues.push({ code: 'PLATFORM_LIMIT_UNKNOWN', severity: 'limitation', detail: 'no versioned adapter limit in the instruction; final format QA cannot confirm the platform limit', path: 'target.platform_character_limit' })
  }

  // The self-check answers are matched to the ToV questions by id, then by position; unanswered checks stay visible as such.
  const questions = tovCopyChecks(tov)
  const checkIds = questions.map((_, index) => mintId(idPrefixes.copyCheck, index, '-'))
  const answered = new Map(draft.self_check.copy_checks.map((check) => [resolveId(check.id, checkIds) ?? check.id, check]))
  const copyChecks: PostData['qa']['copy_checks'] = questions.map((question, index) => {
    const id = checkIds[index]
    const answer = answered.get(id) ?? draft.self_check.copy_checks[index]
    return { id, question, result: answer?.result ?? 'not_applicable', evidence: answer?.evidence ?? '—' }
  })

  const unsupported = draft.claims_map.filter((row) => row.kind === 'fact' && row.claim_id === null && row.fact_ids.length === 0).length
  const repairCodes = [...new Set(args.repairFindings.map((finding) => finding.code))]

  const data: PostData = {
    text: draft.text,
    target: {
      channel: constraints.channel,
      language: constraints.language,
      market: constraints.market,
      format: 'text',
      finished_post_count: constraints.finished_post_count,
      adapter_id: constraints.adapter_id,
      adapter_version: constraints.adapter_version,
      platform_character_limit: constraints.max_text_length,
      platform_limit_status: constraints.platform_limit_status === 'known' && constraints.max_text_length !== null ? 'known' : 'unverified',
      target_account_id: null,
      publication_status: args.simulated ? 'blocked_simulation' : 'not_requested',
      publication_allowed: false,
    },
    claims_map: draft.claims_map.map((row, index) => ({
      id: mintId(idPrefixes.claimMap, index, '-'),
      fragment: row.fragment,
      claim_id: row.claim_id,
      fact_ids: row.fact_ids,
      creative_payload_ids: row.creative_payload_ids,
      kind: row.kind,
      evidence_kind: row.evidence_kind,
      source_ids: row.source_ids,
      limitation: row.limitation,
      used_within_evidence: row.used_within_evidence,
      source_relationship: row.source_relationship,
    })),
    links_and_mentions: draft.links_and_mentions.map((row) => {
      const allowed = row.type === 'link' ? linkByUrl.get(normalizeUrl(row.value)) : undefined
      return {
        type: row.type,
        value: row.value,
        purpose: row.purpose,
        owner: allowed?.owner ?? null,
        contact_owner: allowed?.contact_owner ?? null,
        verification_status: allowed?.visibility_status === 'observed' ? t.observed : t.notObserved,
        operational_status: allowed?.operational_status === 'verified' ? 'verified' : allowed?.operational_status === 'failed' ? 'failed' : 'not_tested',
        opened_during_authoring: false,
        claim_id: row.claim_id,
        fact_id: row.fact_id,
        source_id: row.source_id,
      }
    }),
    client_note: draft.client_note,
    qa: {
      review_type: t.reviewType,
      status: t.awaiting,
      is_independent_review: false,
      independent_editor_review: null,
      copy_checks: copyChecks,
      metrics,
      instruction_alignment: draft.self_check.instruction_alignment,
      factual_scope: draft.self_check.factual_scope,
      tone_of_voice: draft.self_check.tone_of_voice,
      format: draft.self_check.format,
      links: draft.self_check.links,
      style_hygiene: draft.self_check.style_hygiene,
      unsupported_facts_added: unsupported,
      additional_sources_used: 0,
      additional_research_performed: 0,
      corrections_applied: repairCodes,
      corrections_note: repairCodes.length ? t.correctionsNote(repairCodes) : null,
      evidence_limitations: [...new Set([...draft.self_check.evidence_limitations, ...instruction.evidence_payload.flatMap((card) => card.limitations)])],
      publication_gate: 'blocked',
      real_approval_recorded: false,
      author_review_version: args.versionLabel,
    },
  }
  if (unsupported > 0) issues.push({ code: 'UNSUPPORTED_FACT_ROWS', severity: 'blocking', detail: `${unsupported} claims-map row(s) of kind fact cite no evidence`, path: 'claims_map' })
  return { data: postDataSchema.parse(data), issues }
}

export function authorInput(opts: PostPipelineOptions): PostAuthorInput {
  const { order, instruction, tov } = opts
  return {
    order: { brand: order.brand, market: order.market, language: order.language, sku: order.sku },
    outputLanguage: opts.outputLanguage,
    selected_item: instruction.selected_item,
    evidence_payload: instruction.evidence_payload,
    reader_value: instruction.reader_value,
    voice_extract: instruction.voice_extract,
    delivery_constraints: instruction.delivery_constraints,
    completion: instruction.completion,
    tov: isSpecialistTov(tov) ? tov : {
      voice_principles: tov.voice_principles,
      style_axes: tov.style_axes,
      wording: tov.wording,
      evidence_language: tov.evidence_language,
      copy_checks: tov.copy_checks.map((question, index) => ({ id: mintId(idPrefixes.copyCheck, index, '-'), question })),
    },
    previous_text: opts.repairFindings?.length ? (opts.previousPost?.text ?? null) : null,
    repair_findings: opts.repairFindings ?? [],
  }
}

export async function runPostPipeline(opts: PostPipelineOptions): Promise<PostPipelineResult> {
  const onEvent = opts.onEvent ?? (() => {})
  const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
  const step = createStepRunner({
    runAgent: opts.runAgent,
    ledger: opts.ledger,
    models: opts.models,
    cache: opts.cache,
    groundingRetries: opts.groundingRetries ?? limits.generation.groundingRetries,
    onEvent,
    timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
    stats,
  })
  const { value, issues: gateIssues } = await step<PostDraft>({
    step: '7.2',
    agentId: RESEARCH_POST_AUTHOR_AGENT_ID,
    label: 'post_author',
    input: authorInput(opts),
    parse: (raw) => postAuthorResult.parse(raw).data,
    gate: (draft) => gatePostDraft(draft, opts.instruction),
  })
  const assembled = assemblePost({
    outputLanguage: opts.outputLanguage,
    draft: value,
    instruction: opts.instruction,
    tov: opts.tov,
    simulated: opts.simulated ?? false,
    versionLabel: opts.versionLabel ?? '1.0',
    repairFindings: opts.repairFindings ?? [],
  })
  const issues: DocumentIssue[] = [...gateIssues, ...assembled.issues]
  const view = renderPostClientView({ outputLanguage: opts.outputLanguage, brand: opts.order.brand, data: assembled.data })
  if (view.issue) issues.push(view.issue)
  return { data: assembled.data, issues, clientViewMd: view.markdown, stats }
}

const nextLabel = (previous: InputVersion | null) => (previous ? `${Number(previous.version.split('.')[0]) + 1}.0` : '1.0')

/** The post's inputs per WZR-POST's execution policy: the instruction and the ToV, plus the previous post on a repair. */
export async function runPostStep(ctx: StepContext): Promise<StepOutcome> {
  if (ctx.postInputs && !ctx.postOutputs) throw new Error('[internal] Pinned post execution requires its own post output')
  const instruction = ctx.postInputs ? ctx.postInputs.instruction : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZLECENIE-POSTU')
  const tov = ctx.postInputs ? ctx.postInputs.tov : await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-TOV')
  if (!instruction || !tov) throw new Error('[internal] 7.2 needs current WEW-ZLECENIE-POSTU and KLI-TOV versions — run the process through 6.7 first')
  const currentPost = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-POST')
  const previous = ctx.postInputs ? ctx.postOutputs!.post : currentPost
  const pin = (v: InputVersion & { versionId: string }): InputVersion => ({
    document_id: v.document_id, version: v.version, status: v.status,
    ...(v.specialistTov ? { specialistTov: v.specialistTov } : {}),
  })
  const foundationVersions: InputVersion[] = [ctx.orderVersion, pin(instruction), pin(tov)]
  const inputVersions = [...foundationVersions, ...(previous ? [pin(previous)] : [])]
  const simulation = simulationIssue(ctx.postInputs ? foundationVersions : inputVersions)
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '7.2', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const result = await runPostPipeline({
      order: ctx.order,
      outputLanguage: ctx.order.outputLanguage,
      instruction: zleceniePostuDataSchema.parse(instruction.data),
      tov: parseDownstreamTov(tov),
      previousPost: previous ? postDataSchema.parse(previous.data) : null,
      repairFindings: ctx.repairFindings,
      simulated: simulation !== null,
      versionLabel: nextLabel(currentPost),
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      onEvent: ctx.onEvent,
    })
    const issues = simulation ? [...result.issues, { ...simulation, path: 'target.publication_status' }] : result.issues
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-POST',
      status: 'draft',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderPost({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: result.data, issues }),
      clientViewMd: result.clientViewMd,
      taskRunId: run.id,
      simulation: simulation !== null,
    })
    if (ctx.postInputs && ctx.postOutputs) {
      ctx.postOutputs.post = {
        document_id: saved.envelope.document_id, version: saved.envelope.version, status: saved.envelope.status,
        versionId: saved.version.id, data: result.data,
      }
    }
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { stats: result.stats, metrics: result.data.qa.metrics }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: error instanceof BudgetPausedError ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
