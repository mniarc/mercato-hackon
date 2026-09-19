import type { OnboardingContext } from '../../../data/agents/onboarding'
import type { z } from 'zod'
import { contractFor, mustKeysOf } from '../../../data/contracts'
import type { AudytData } from '../../../data/schemas/audyt'
import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { KonkurencjaData } from '../../../data/schemas/konkurencja'
import type { QaFinding } from '../../../data/schemas/qa'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { CoverageItem, ZrodlaData } from '../../../data/schemas/zrodla'
import {
  briefFieldKeys,
  readinessOutputs,
  ustaleniaDataSchema,
  type BriefFieldKey,
  type UstaleniaData,
} from '../../../data/schemas/ustalenia'
import {
  fieldMapperResult,
  questionWriterResult,
  readinessAssessorResult,
  type FieldMapperInput,
  type FindingsBank,
  type OutputLanguage,
  type QuestionWriterInput,
  type ReadinessAssessorInput,
} from '../../../data/validators'
import { limits } from '../../../data/templates'
import { RESEARCH_FIELD_MAPPER_AGENT_ID, RESEARCH_QUESTION_WRITER_AGENT_ID, RESEARCH_READINESS_ASSESSOR_AGENT_ID } from '../../agentIds'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { checkClientView } from '../clientView'
import type { GateIssue } from '../gate'
import { resolveId } from '../ids'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type Ledger, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { renderUstalenia, renderUstaleniaClientView } from '../render/ustalenia'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 3.6 — from the register, the audit and the comparison to WEW-USTALENIA:
 * the ten KLI-BRIEF rows seeded by code and filled by the mapper, at most a batch
 * of client questions, evidence requests, readiness per downstream result. Nothing
 * a website cannot know (future goals, priorities, preferences) is ever a fact.
 */

export type FindingsPipelineOptions = {
  order: OrderFacts
  onboardingContext?: OnboardingContext | null
  outputLanguage: OutputLanguage
  zrodla: ZrodlaData
  audyt: AudytData
  konkurencja: KonkurencjaData | null
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
  repairFindings?: QaFinding[]
  groundingRetries?: number
}

export type FindingsPipelineResult = {
  data: UstaleniaData
  issues: DocumentIssue[]
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}

/** Fields a website cannot decide for the client: a proposed value is at best a hypothesis until the client answers. */
export const clientDecidedFields: readonly BriefFieldKey[] = ['priority_offer', 'priority_audience', 'business_direction', 'voice_preferences', 'success_and_limits']

const issueOf = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

/** Every id a findings document may cite: the register's, the audit's gaps/scenarios, the comparison's candidates. */
export function knownIdsOf(zrodla: ZrodlaData, audyt: AudytData | null, konkurencja: KonkurencjaData | null): Set<string> {
  const ids = new Set<string>()
  for (const s of zrodla.sources) ids.add(s.source_id)
  for (const f of zrodla.facts) ids.add(f.fact_id)
  for (const p of zrodla.proof_cards) ids.add(p.proof_id)
  for (const l of zrodla.language_samples) ids.add(l.sample_id)
  for (const a of zrodla.audience_signals) ids.add(a.signal_id)
  for (const t of zrodla.content_bank) ids.add(t.seed_id)
  for (const x of zrodla.conflicts) ids.add(x.conflict_id)
  for (const g of audyt?.gaps ?? []) ids.add(g.gap_id)
  for (const b of audyt?.buyer_map ?? []) ids.add(b.scenario_id)
  for (const d of konkurencja?.difference_candidates ?? []) ids.add(d.candidate_id)
  return ids
}

/** The bounded bank every findings agent reads — ids and one-line texts, never page content. */
export function findingsBankOf(order: OrderFacts, outputLanguage: OutputLanguage, zrodla: ZrodlaData, audyt: AudytData, konkurencja: KonkurencjaData | null): FindingsBank {
  const capacity = zrodla.coverage.find((c): c is Extract<CoverageItem, { item_type: 'plan_capacity' }> => c.item_type === 'plan_capacity') ?? null
  const voice = audyt.voice_audit
  return {
    order: { brand: order.brand, market: order.market, language: order.language, websiteUrl: order.websiteUrl, officialSocialUrl: order.officialSocialUrl, purchaseGoal: order.purchaseGoal },
    outputLanguage,
    facts: zrodla.facts.map((f) => ({ fact_id: f.fact_id, entity: f.entity, claim: f.claim, kind: f.kind, limitation: f.limitation })),
    proof_cards: zrodla.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method, observed_result: p.observed_result, limitations: p.limitations })),
    language_samples: zrodla.language_samples.map((l) => ({ sample_id: l.sample_id, channel: l.channel, excerpt: l.excerpt_or_paraphrase })),
    conflicts: zrodla.conflicts.map((x) => ({ conflict_id: x.conflict_id, question: x.question, state: x.state })),
    coverage: zrodla.coverage.flatMap((c) => (c.item_type === 'requirement_coverage' ? [{ requirement: c.requirement, readiness: c.readiness, gap: c.gap, owner: c.owner }] : [])),
    plan_capacity: capacity ? { required_topics: capacity.required_topics, distinct_count: capacity.distinct_count, ready_count: capacity.ready_count, readiness: capacity.readiness } : null,
    content_bank: zrodla.content_bank.map((t) => ({ seed_id: t.seed_id, audience_question: t.audience_question, readiness: t.readiness })),
    audit: {
      offer_map: audyt.offer_map.map((o) => ({ service: o.service, described_audience: o.described_audience, problem: o.problem, fact_ids: o.fact_ids })),
      buyer_map: audyt.buyer_map.map((b) => ({ scenario_id: b.scenario_id, status: b.status, initiator: b.initiator, job: b.job, objections: b.objections, fact_ids: b.fact_ids })),
      message_map: audyt.message_map.map((m) => ({ message: m.message, benefit: m.benefit, risk: m.risk, proof_ids: m.proof_ids, fact_ids: m.fact_ids })),
      voice_summary: [voice.sample_size, voice.formality.finding, voice.directness.finding, voice.technical_level.finding, voice.claim_certainty.finding, voice.future_voice_status].join(' '),
      journey: audyt.journey.map((j) => ({ stage: j.stage, cta: j.cta, destination_status: j.destination_status, fact_ids: j.fact_ids })),
      gaps: audyt.gaps.map((g) => ({ gap_id: g.gap_id, observation: g.observation, priority: g.priority, needed: g.needed, destination: g.destination, evidence_ids: g.evidence_ids })),
      reusable_assets: audyt.reusable_assets.map((r) => ({ asset: r.asset, value_for_audience: r.value_for_audience, proof_ids: r.proof_ids, seed_ids: r.seed_ids })),
    },
    competition: konkurencja
      ? {
          difference_candidates: konkurencja.difference_candidates.map((d) => ({ candidate_id: d.candidate_id, feature: d.feature, allowed_claim_strength: d.allowed_claim_strength, unknown: d.unknown, proof_ids: d.proof_ids })),
          implications: konkurencja.implications.map((i) => ({ finding: i.finding, strategy_field: i.strategy_field, client_answer_needed: i.client_answer_needed, evidence_ids: i.evidence_ids })),
        }
      : null,
  }
}

/** The ten seeded rows, priorities from WZR-BRIEF, descriptions from the contract. */
export function seededFieldRows(): FieldMapperInput['seeded_rows'] {
  const brief = contractFor('WZR-BRIEF')
  const must = new Set(mustKeysOf('WZR-BRIEF'))
  return briefFieldKeys.map((key) => {
    const field = brief.fields.find((f) => f.key === key)
    return { field_key: key, priority: must.has(key) ? 'must' : field?.priority === 'could' ? 'could' : 'should', field_description: field?.description ?? key }
  })
}

type RawFieldMap = z.infer<typeof fieldMapperResult>['data']['field_map']

/**
 * Gate for the field map: exactly the ten rows in template order (a missing row is
 * blocked, never invented), ids resolve, provenance never claims a client answer,
 * and a client-decided field is never a fact.
 */
export function gateFieldMap(rows: RawFieldMap, knownIds: Set<string>, seeded: FieldMapperInput['seeded_rows']): { value: UstaleniaData['field_map']; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const byKey = new Map<string, RawFieldMap[number]>()
  rows.forEach((row) => {
    if (!byKey.has(row.field_key)) byKey.set(row.field_key, row)
  })
  let dropped = 0
  const value = seeded.map((seed) => {
    const path = `field_map[${seed.field_key}]`
    const row = byKey.get(seed.field_key)
    if (!row) {
      issues.push(issueOf('MISSING_FIELD_ROW', path, 'not mapped by the agent; recorded as blocked'))
      dropped += 1
      return { field_key: seed.field_key, proposed_value: null, evidence_ids: [], provenance: 'inferred' as const, readiness: 'blocked' as const, decision_state: clientDecidedFields.includes(seed.field_key) ? ('awaiting_client' as const) : ('not_required' as const), priority: seed.priority, reason: 'Pole nie zostało zmapowane; brak propozycji.', status: 'unknown' as const }
    }
    const evidence_ids = row.evidence_ids.map((id) => resolveId(id, knownIds)).filter((id): id is string => id !== null)
    if (evidence_ids.length < row.evidence_ids.length) issues.push(issueOf('UNKNOWN_ID', path, 'dropped evidence ids that do not exist'))
    let provenance = row.provenance
    if (provenance === 'client_answer' || provenance === 'synthetic') {
      issues.push(issueOf('NO_CLIENT_ANSWER_YET', path, `provenance ${provenance} before any client answer; recorded as inferred`))
      provenance = 'inferred'
    }
    let status = row.status
    let decision_state = row.decision_state
    if (status === 'client_decision') {
      issues.push(issueOf('NO_CLIENT_ANSWER_YET', path, 'a client decision cannot precede the client; recorded as hypothesis'))
      status = 'hypothesis'
    }
    if (decision_state === 'client_selected' || decision_state === 'simulated_selection') {
      issues.push(issueOf('NO_CLIENT_ANSWER_YET', path, `${decision_state} without a decision ref; awaiting the client`))
      decision_state = 'awaiting_client'
    }
    if (clientDecidedFields.includes(seed.field_key)) {
      if (status === 'fact') {
        issues.push(issueOf('FUTURE_AS_FACT', path, 'a future goal, priority or preference read off the website is a hypothesis, not a fact'))
        status = 'hypothesis'
      }
      if (decision_state === 'not_required') decision_state = 'awaiting_client'
    }
    let readiness = row.readiness
    if (readiness === 'ready' && evidence_ids.length === 0 && row.proposed_value) {
      issues.push(issueOf('UNSUPPORTED_READINESS', path, 'ready without evidence; marked conditional'))
      readiness = 'conditional'
    }
    if (!row.proposed_value && readiness === 'ready') {
      readiness = 'blocked'
      issues.push(issueOf('UNSUPPORTED_READINESS', path, 'ready with no proposed value; marked blocked'))
    }
    return { field_key: seed.field_key, proposed_value: row.proposed_value, evidence_ids, provenance, readiness, decision_state, priority: seed.priority, reason: row.reason, status }
  })
  return { value, issues, kept: value.length - dropped, dropped }
}

const ALREADY_KNOWN_PATTERNS = [/\b(www|website|strona www|adres strony|witryn)/i, /\b(linkedin|profil(u)? (społecznościow|firmow)|social profile)/i, /\b(nazw[aęy] (firmy|marki)|brand name|company name)\b/i]

type RawQuestions = z.infer<typeof questionWriterResult>['data']

/** Questions: never about data we hold, one decision each, Must first, at most the batch; evidence requests cite existing ids. */
export function gateQuestions(data: RawQuestions, knownIds: Set<string>, batchMax = limits.clientText.questionBatchMax): { value: Pick<UstaleniaData, 'questions' | 'evidence_requests'>; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const rank = { must: 0, should: 1, could: 2 } as const
  const seen: string[] = []
  const filtered = data.questions.filter((q, index) => {
    const path = `questions[${index}]`
    if (ALREADY_KNOWN_PATTERNS.some((pattern) => pattern.test(q.question))) {
      issues.push(issueOf('ASKS_KNOWN_DATA', path, `asks for data already in the order: "${q.question.slice(0, 80)}"`, 'dropped'))
      return false
    }
    if (seen.some((previous) => previous === q.question.trim().toLowerCase())) {
      issues.push(issueOf('DUPLICATE_QUESTION', path, 'same question twice', 'dropped'))
      return false
    }
    seen.push(q.question.trim().toLowerCase())
    return true
  })
  const ordered = [...filtered].sort((a, b) => rank[a.priority] - rank[b.priority])
  if (ordered.length > batchMax) issues.push(issueOf('LIMIT_TRUNCATED', 'questions', `${ordered.length} questions; the batch keeps the first ${batchMax} (Must first)`))
  const questions = ordered.slice(0, batchMax).map((q, index) => ({
    question_id: `Q${String(index + 1).padStart(2, '0')}`,
    question: q.question,
    hint: q.hint,
    reason: q.reason,
    brief_field: q.brief_field,
    priority: q.priority,
    if_unanswered: q.if_unanswered,
    state: 'open',
    ...(q.options ? { options: q.options.map((o) => ({ ...o, fact_ids: o.fact_ids.map((id) => resolveId(id, knownIds)).filter((id): id is string => id !== null) })) } : {}),
  }))
  const evidence_requests = data.evidence_requests.map((r, index) => {
    const resolved = r.evidence_ids.map((id) => resolveId(id, knownIds)).filter((id): id is string => id !== null)
    if (resolved.length < r.evidence_ids.length) issues.push(issueOf('UNKNOWN_ID', `evidence_requests[${index}]`, 'dropped evidence ids that do not exist'))
    return { request_id: `ER${String(index + 1).padStart(2, '0')}`, needed: r.needed, claim_supported: r.claim_supported, without_it: r.without_it, owner: r.owner, status: 'open', priority: r.priority }
  })
  const dropped = data.questions.length - filtered.length + Math.max(0, ordered.length - batchMax)
  return { value: { questions, evidence_requests }, issues, kept: questions.length + evidence_requests.length, dropped }
}

type RawReadiness = z.infer<typeof readinessAssessorResult>['data']

/** Readiness: exactly the five outputs, in order; an unassessed output is blocked, never assumed ready. */
export function gateReadiness(data: RawReadiness): { value: Pick<UstaleniaData, 'readiness' | 'research_return'>; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const byOutput = new Map(data.readiness.map((r) => [r.output, r]))
  const readiness = readinessOutputs.map((output) => {
    const row = byOutput.get(output)
    if (row) return row
    issues.push(issueOf('MISSING_READINESS_ROW', `readiness[${output}]`, `${output} not assessed; recorded as blocked`))
    return { output, input_fields: [], state: 'blocked' as const, missing: 'not assessed', owner: 'agencja' }
  })
  return { value: { readiness, research_return: data.research_return }, issues, kept: readiness.length, dropped: 0 }
}

export async function runFindingsPipeline(opts: FindingsPipelineOptions): Promise<FindingsPipelineResult> {
  const onEvent = opts.onEvent ?? (() => {})
  const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
  const issues: DocumentIssue[] = []
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
  const knownIds = knownIdsOf(opts.zrodla, opts.audyt, opts.konkurencja)
  const bank = findingsBankOf(opts.order, opts.outputLanguage, opts.zrodla, opts.audyt, opts.konkurencja)
  const repair = (opts.repairFindings ?? []).map((f) => ({ path: f.path, gap: f.gap, fix_hint: f.fix_hint }))
  if (!opts.konkurencja) {
    issues.push({ code: 'COMPETITION_MISSING', severity: 'limitation', detail: 'WEW-KONKURENCJA is not available; alternatives and differentiators are mapped as unknown, never invented', path: 'field_map' })
  }
  const seeded = seededFieldRows()

  const mapped = await step<z.infer<typeof fieldMapperResult>['data']>({
    step: '3.6',
    agentId: RESEARCH_FIELD_MAPPER_AGENT_ID,
    label: 'field_map',
    input: { ...bank, seeded_rows: seeded, repair_findings: repair, onboarding_context: opts.onboardingContext ?? null } satisfies FieldMapperInput,
    parse: (raw) => fieldMapperResult.parse(raw).data,
    gate: (data) => {
      const gated = gateFieldMap(data.field_map, knownIds, seeded)
      return { ...gated, value: { field_map: gated.value } }
    },
  })
  issues.push(...mapped.issues)
  const fieldMap = gateFieldMap(mapped.value.field_map, knownIds, seeded).value

  const alreadyKnown = [
    `brand: ${opts.order.brand}`,
    `website: ${opts.order.websiteUrl}`,
    `market / language: ${opts.order.market} / ${opts.order.language}`,
    ...(opts.order.officialSocialUrl ? [`social profile: ${opts.order.officialSocialUrl}`] : []),
    ...(opts.order.purchaseGoal ? [`purchase goal: ${opts.order.purchaseGoal}`] : []),
    `purchased scope: ${opts.order.sku}, ${opts.order.topics} topics`,
  ]
  const asked = await step<RawQuestions>({
    step: '3.6',
    agentId: RESEARCH_QUESTION_WRITER_AGENT_ID,
    label: 'questions',
    input: {
      order: bank.order,
      outputLanguage: opts.outputLanguage,
      coverage: bank.coverage,
      plan_capacity: bank.plan_capacity,
      conflicts: bank.conflicts,
      field_map: fieldMap,
      audit_gaps: bank.audit.gaps.map((g) => ({ gap_id: g.gap_id, observation: g.observation, priority: g.priority, needed: g.needed, destination: g.destination })),
      reusable_assets: bank.audit.reusable_assets.map((r) => ({ asset: r.asset, proof_ids: r.proof_ids, seed_ids: r.seed_ids })),
      proof_cards: bank.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, observed_result: p.observed_result })),
      already_known: alreadyKnown,
      onboarding_context: opts.onboardingContext ?? null,
      question_batch_max: limits.clientText.questionBatchMax,
      repair_findings: repair,
    } satisfies QuestionWriterInput,
    parse: (raw) => questionWriterResult.parse(raw).data,
    gate: (data) => {
      const gated = gateQuestions(data, knownIds)
      return { ...gated, value: { questions: gated.value.questions.map((q) => ({ question: q.question, hint: q.hint, reason: q.reason, brief_field: q.brief_field, priority: q.priority, if_unanswered: q.if_unanswered, ...(q.options ? { options: q.options } : {}) })), evidence_requests: data.evidence_requests } }
    },
  })
  issues.push(...asked.issues)
  const { questions, evidence_requests } = gateQuestions(asked.value, knownIds).value

  const assessed = await step<RawReadiness>({
    step: '3.6',
    agentId: RESEARCH_READINESS_ASSESSOR_AGENT_ID,
    label: 'readiness',
    input: {
      order: bank.order,
      outputLanguage: opts.outputLanguage,
      coverage: bank.coverage,
      plan_capacity: bank.plan_capacity,
      field_map: fieldMap,
      questions: questions.map((q) => ({ question_id: q.question_id, brief_field: q.brief_field, priority: q.priority })),
      evidence_requests: evidence_requests.map((r) => ({ request_id: r.request_id, claim_supported: r.claim_supported })),
      outputs: [...readinessOutputs],
      gates: [
        'Q-R: sources with access scope, atomic facts with limits, offer and purchase situations, language sample, comparison to 3 companies, gaps assigned to brief fields.',
        'Q-FREEZE: priority and audience agreed, promises and proof rights settled, UVP candidates with mechanism and comparison limits, no critical fact gap, plan capacity of 12 distinct supported angles, voice preferences confirmed or explicitly proposed, CTA draft readiness with an explicit limit.',
      ],
    } satisfies ReadinessAssessorInput,
    parse: (raw) => readinessAssessorResult.parse(raw).data,
    gate: (data) => {
      const gated = gateReadiness(data)
      return { ...gated, value: { readiness: gated.value.readiness, research_return: gated.value.research_return } }
    },
  })
  issues.push(...assessed.issues)

  const data = ustaleniaDataSchema.parse({ field_map: fieldMap, questions, evidence_requests, readiness: assessed.value.readiness, research_return: assessed.value.research_return })
  const mustBlocked = data.field_map.filter((row) => row.priority === 'must' && row.readiness === 'blocked')
  if (mustBlocked.length) {
    issues.push({ code: 'MUST_FIELDS_BLOCKED', severity: 'brief_blocker', detail: `${mustBlocked.map((r) => r.field_key).join(', ')}: no evidence and no question can pre-fill them; the brief will carry them as open`, path: 'field_map' })
  }
  const unanswerable = data.field_map.filter((row) => row.priority === 'must' && row.readiness !== 'ready' && !data.questions.some((q) => q.brief_field === row.field_key))
  if (unanswerable.length) {
    issues.push({ code: 'MUST_FIELD_WITHOUT_QUESTION', severity: 'limitation', detail: `${unanswerable.map((r) => r.field_key).join(', ')}: not ready and not asked in this batch (batch limit ${limits.clientText.questionBatchMax})`, path: 'questions' })
  }
  return { data, issues, stats }
}

/** DB wrapper: loads the pinned inputs, runs the pipeline, stores one WEW-USTALENIA version and one 3.6 task run. */
export async function runFindingsStep(ctx: StepContext): Promise<StepOutcome> {
  const { em, scope, orderRef } = ctx
  const zrodla = await currentInputVersion(em, scope, orderRef, 'WZR-ZRODLA')
  const audyt = await currentInputVersion(em, scope, orderRef, 'WZR-AUDYT')
  if (!zrodla || !audyt) throw new Error('[internal] 3.6 needs WEW-ZRODLA and WEW-AUDYT versions for this order')
  const konkurencja = await currentInputVersion(em, scope, orderRef, 'WZR-KONKURENCJA')
  const inputVersions = [ctx.orderVersion, ...[zrodla, audyt, konkurencja].filter((v): v is NonNullable<typeof v> => v !== null).map((v) => ({ document_id: v.document_id, version: v.version, status: v.status }))]
  const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: '3.6', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const result = await runFindingsPipeline({
      order: ctx.order,
      onboardingContext: ctx.onboardingContext ?? null,
      outputLanguage: ctx.order.outputLanguage,
      zrodla: zrodla.data as ZrodlaData,
      audyt: audyt.data as AudytData,
      konkurencja: (konkurencja?.data as KonkurencjaData | undefined) ?? null,
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      onEvent: ctx.onEvent,
      repairFindings: ctx.repairFindings,
    })
    const clientView = checkClientView('WZR-USTALENIA', renderUstaleniaClientView(result.data))
    if (clientView.issue) result.issues.push(clientView.issue)
    const saved = await saveDocumentVersion(em, scope, {
      orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-USTALENIA',
      status: 'ready_for_review',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues: result.issues,
      renderedMd: renderUstalenia({ brand: ctx.order.brand, data: result.data, issues: result.issues }),
      clientViewMd: clientView.markdown,
      taskRunId: run.id,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(em, run, { status: 'done', outputVersionId: saved.version.id, summary: { stats: result.stats }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    const paused = error instanceof BudgetPausedError
    await finishTaskRun(em, run, { status: paused ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
