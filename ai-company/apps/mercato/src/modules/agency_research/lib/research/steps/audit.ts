import { auditMapperResult, auditVoiceResult, type AuditMaps, type AuditRegisterInput } from '../../../data/agents/audit'
import { audytDataSchema, type AudytData } from '../../../data/schemas/audyt'
import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { BusinessProfile, ZrodlaData } from '../../../data/schemas/zrodla'
import { mustKeysOf } from '../../../data/contracts'
import { limits } from '../../../data/templates'
import { RESEARCH_AUDIT_MAPPER_AGENT_ID, RESEARCH_AUDIT_VOICE_AGENT_ID } from '../../agents/ids.audit'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { checkClientView } from '../clientView'
import { unresolvedCitations, type GateIssue } from '../gate'
import { resolveId } from '../ids'
import { BudgetPausedError } from '../ledger'
import { createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type Ledger, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { renderAudytClientView, renderAudyt } from '../render/audyt'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 3.3 — WEW-AUDYT from the register. Two syntheses (maps, then voice + gaps
 * with the maps in hand), ids resolved against the pinned WEW-ZRODLA, gaps capped
 * at 3–5, scenario and gap ids minted in code. The audit never records a future
 * vision as a fact and never judges conversion without data.
 */

export type AuditPipelineOptions = {
  order: OrderFacts
  zrodla: ZrodlaData
  businessProfile: BusinessProfile
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
  repairFindings?: unknown[]
  groundingRetries?: number
}

export type AuditPipelineResult = {
  data: AudytData
  issues: DocumentIssue[]
  clientView: string
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}

export function registerIds(zrodla: ZrodlaData): Set<string> {
  return new Set([
    ...zrodla.sources.map((s) => s.source_id),
    ...zrodla.facts.map((f) => f.fact_id),
    ...zrodla.proof_cards.map((p) => p.proof_id),
    ...zrodla.language_samples.map((s) => s.sample_id),
    ...zrodla.audience_signals.map((s) => s.signal_id),
    ...zrodla.content_bank.map((s) => s.seed_id),
    ...zrodla.conflicts.map((c) => c.conflict_id),
  ])
}

const issue = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

/** Keeps only citations that exist; drops an item whose every citation is unknown when a citation is required. */
function resolveList(list: string[], known: Set<string>, path: string, issues: GateIssue[]): string[] {
  const kept = list.map((id) => resolveId(id, known)).filter((id): id is string => id !== null)
  if (kept.length < list.length) issues.push(issue('UNKNOWN_ID', path, `dropped ${list.length - kept.length} unknown citation(s)`))
  return [...new Set(kept)]
}

export function gateAuditMaps(maps: AuditMaps, known: Set<string>): { value: AuditMaps; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  let dropped = 0
  const offer_map = maps.offer_map.flatMap((row, index) => {
    const fact_ids = resolveList(row.fact_ids, known, `offer_map[${index}]`, issues)
    if (fact_ids.length === 0) {
      dropped += 1
      issues.push(issue('UNSOURCED_ITEM', `offer_map[${index}]`, `"${row.service}" cites no existing fact`, 'dropped'))
      return []
    }
    return [{ ...row, fact_ids }]
  })
  const buyer_map = maps.buyer_map.map((row, index) => {
    const fact_ids = resolveList(row.fact_ids, known, `buyer_map[${index}]`, issues)
    // Customer voice needs a customer: without a fact behind it the scenario is a hypothesis.
    const status = row.direct_customer_voice && fact_ids.length > 0 ? row.status : 'hypothesis'
    if (status !== row.status) issues.push(issue('NO_AUTO_PROMOTION', `buyer_map[${index}]`, 'evidence status without customer voice; marked hypothesis'))
    return { ...row, status, fact_ids, direct_customer_voice: row.direct_customer_voice && fact_ids.length > 0 }
  })
  const message_map = maps.message_map.flatMap((row, index) => {
    const fact_ids = resolveList(row.fact_ids, known, `message_map[${index}]`, issues)
    const proof_ids = resolveList(row.proof_ids, known, `message_map[${index}].proof_ids`, issues)
    if (fact_ids.length === 0) {
      dropped += 1
      issues.push(issue('UNSOURCED_ITEM', `message_map[${index}]`, `"${row.message}" cites no existing fact`, 'dropped'))
      return []
    }
    return [{ ...row, fact_ids, proof_ids }]
  })
  const journey = maps.journey.flatMap((row, index) => {
    const fact_ids = resolveList(row.fact_ids, known, `journey[${index}]`, issues)
    if (fact_ids.length === 0) {
      dropped += 1
      issues.push(issue('UNSOURCED_ITEM', `journey[${index}]`, `stage "${row.stage}" cites no existing fact`, 'dropped'))
      return []
    }
    // Conversion is never judged without data.
    const friction = row.friction && /konwersj|conversion|drop-?off|bounce/i.test(row.friction) ? null : row.friction
    if (friction !== row.friction) issues.push(issue('ROI_WITHOUT_EVIDENCE', `journey[${index}]`, 'a conversion judgement without data was removed'))
    return [{ ...row, fact_ids, friction, friction_status: friction ? row.friction_status : 'not_established_in_available_evidence' }]
  })
  const relationship = maps.relationship.map((row, index) => ({ ...row, fact_ids: resolveList(row.fact_ids, known, `relationship[${index}]`, issues) }))
  if (offer_map.length === 0 || buyer_map.length === 0) issues.push(issue('MUST_FIELD_MISSING', 'offer_map/buyer_map', 'the audit needs at least one offer row and one buyer scenario', 'blocking'))
  return { value: { offer_map, buyer_map, message_map, journey, relationship }, issues, kept: offer_map.length + buyer_map.length + message_map.length + journey.length, dropped }
}

type VoiceSections = ReturnType<typeof auditVoiceResult.parse>['data']

export function gateAuditVoice(sections: VoiceSections, known: Set<string>): { value: VoiceSections; issues: GateIssue[]; kept: number; dropped: number } {
  const issues: GateIssue[] = []
  const dims = ['formality', 'directness', 'technical_level', 'emotion', 'claim_certainty', 'recurring_phrases', 'channel_difference'] as const
  const voice_audit = { ...sections.voice_audit }
  for (const dim of dims) {
    voice_audit[dim] = { ...voice_audit[dim], sample_ids: resolveList(voice_audit[dim].sample_ids, known, `voice_audit.${dim}`, issues) }
  }
  const order = { must: 0, should: 1, could: 2 }
  const gaps = sections.gaps
    .map((gap, index) => ({ ...gap, evidence_ids: resolveList(gap.evidence_ids, known, `gaps[${index}]`, issues) }))
    .sort((a, b) => order[a.priority] - order[b.priority])
  const cappedGaps = gaps.slice(0, 5)
  if (gaps.length > 5) issues.push(issue('LIMIT_TRUNCATED', 'gaps', `${gaps.length} gaps; kept the 5 highest-priority ones`))
  if (cappedGaps.length < 3) issues.push(issue('LIST_SHORT', 'gaps', `${cappedGaps.length} gaps; the template asks for 3–5`, 'limitation'))
  const reusable_assets = sections.reusable_assets.map((asset, index) => ({
    ...asset,
    proof_ids: resolveList(asset.proof_ids, known, `reusable_assets[${index}].proof_ids`, issues),
    seed_ids: resolveList(asset.seed_ids, known, `reusable_assets[${index}].seed_ids`, issues),
  }))
  return { value: { voice_audit, gaps: cappedGaps, reusable_assets }, issues, kept: cappedGaps.length + reusable_assets.length, dropped: gaps.length - cappedGaps.length }
}

function registerInput(opts: AuditPipelineOptions): AuditRegisterInput {
  const { order, zrodla } = opts
  return {
    order: { brand: order.brand, market: order.market, language: order.language, websiteUrl: order.websiteUrl, purchaseGoal: order.purchaseGoal },
    outputLanguage: order.outputLanguage,
    business_profile: opts.businessProfile,
    sources: zrodla.sources.filter((s) => s.access !== 'unavailable').map((s) => ({ source_id: s.source_id, publisher: s.publisher, kind: s.kind, url: s.url_or_file, access: s.access })),
    facts: zrodla.facts.filter((f) => f.entity === order.brand || !f.fact_id.startsWith('C')).map((f) => ({ fact_id: f.fact_id, kind: f.kind, claim: f.claim, use_scope: f.use_scope, limitation: f.limitation, source_ids: f.source_ids })),
    proof_cards: zrodla.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method, observed_result: p.observed_result, fact_ids: p.fact_ids, limitations: p.limitations })),
    audience_signals: zrodla.audience_signals.map((s) => ({ signal_id: s.signal_id, role_or_organization: s.role_or_organization, trigger: s.trigger, problem: s.problem, objection: s.objection, evidence_status: s.evidence_status, fact_ids: s.fact_ids })),
    conflicts: zrodla.conflicts.map((c) => ({ conflict_id: c.conflict_id, facts: c.facts, detail: c.detail, question: c.question })),
    repair_findings: opts.repairFindings ?? [],
  }
}

export async function runAuditPipeline(opts: AuditPipelineOptions): Promise<AuditPipelineResult> {
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
  const known = registerIds(opts.zrodla)
  const input = registerInput(opts)

  const maps = await step<AuditMaps>({
    step: '3.3',
    agentId: RESEARCH_AUDIT_MAPPER_AGENT_ID,
    label: 'audit_maps',
    input,
    parse: (raw) => auditMapperResult.parse(raw).data,
    gate: (value) => gateAuditMaps(value, known),
  })
  issues.push(...maps.issues)
  const buyerMap = maps.value.buyer_map.map((row, index) => ({ scenario_id: `B${String(index + 1).padStart(2, '0')}`, ...row }))

  const voice = await step<VoiceSections>({
    step: '3.3',
    agentId: RESEARCH_AUDIT_VOICE_AGENT_ID,
    label: 'audit_voice_gaps',
    input: {
      order: input.order,
      outputLanguage: input.outputLanguage,
      repair_findings: input.repair_findings,
      language_samples: opts.zrodla.language_samples.map((s) => ({ sample_id: s.sample_id, source_id: s.source_id, channel: s.channel, excerpt: s.excerpt_or_paraphrase, linguistic_features: s.linguistic_features, situation: s.situation, observed_function: s.observed_function })),
      voice_facts: opts.zrodla.facts.filter((f) => f.use_scope.some((scope) => /language|język|tone|ton/i.test(scope))).map((f) => ({ fact_id: f.fact_id, claim: f.claim })),
      maps: {
        offer_map: maps.value.offer_map.map((r) => ({ service: r.service, fact_ids: r.fact_ids })),
        buyer_map: buyerMap.map((r) => ({ scenario_id: r.scenario_id, status: r.status, job: r.job })),
        message_map: maps.value.message_map.map((r) => ({ message: r.message, risk: r.risk, fact_ids: r.fact_ids })),
        journey: maps.value.journey.map((r) => ({ stage: r.stage, friction_status: r.friction_status, fact_ids: r.fact_ids })),
      },
      coverage: opts.zrodla.coverage.flatMap((c) => (c.item_type === 'requirement_coverage' ? [{ requirement: c.requirement, readiness: c.readiness, gap: c.gap, owner: c.owner }] : [])),
      content_bank: opts.zrodla.content_bank.map((s) => ({ seed_id: s.seed_id, angle: s.angle, readiness: s.readiness, proof_ids: s.proof_ids })),
      proof_cards: opts.zrodla.proof_cards.map((p) => ({ proof_id: p.proof_id, proof_type: p.proof_type, artifact_or_method: p.artifact_or_method })),
    },
    parse: (raw) => auditVoiceResult.parse(raw).data,
    gate: (value) => gateAuditVoice(value, known),
  })
  issues.push(...voice.issues)

  const data = audytDataSchema.parse({
    offer_map: maps.value.offer_map,
    buyer_map: buyerMap,
    message_map: maps.value.message_map,
    voice_audit: voice.value.voice_audit,
    journey: maps.value.journey,
    relationship: maps.value.relationship,
    gaps: voice.value.gaps.map((gap, index) => ({ gap_id: `G${String(index + 1).padStart(2, '0')}`, ...gap })),
    reusable_assets: voice.value.reusable_assets,
  })
  for (const key of mustKeysOf('WZR-AUDYT')) {
    const value = (data as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value) && value.length === 0) issues.push({ code: 'MUST_FIELD_MISSING', severity: 'blocking', detail: `${key} is empty`, path: key })
  }
  issues.push(...unresolvedCitations(data, known))
  const view = checkClientView('WZR-AUDYT', renderAudytClientView({ brand: opts.order.brand, data, zrodla: opts.zrodla, language: opts.order.outputLanguage }))
  if (view.issue) issues.push(view.issue)
  return { data, issues, clientView: view.markdown, stats }
}

/** DB wrapper: loads the pinned register, runs the pipeline, stores WEW-AUDYT and its task run. */
export async function runAuditStep(ctx: StepContext): Promise<StepOutcome> {
  const zrodla = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
  if (!zrodla) throw new Error('[internal] 3.3 needs a stored WEW-ZRODLA version; run 3.2 first')
  const previous = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-AUDYT')
  const sourcesRun = await ctx.em.getConnection().execute(`select summary from agency_research_task_runs where tenant_id = ? and organization_id = ? and order_ref = ? and step_id = '3.2' and status = 'done' order by created_at desc limit 1`, [ctx.scope.tenantId, ctx.scope.organizationId, ctx.orderRef])
  const summary = (Array.isArray(sourcesRun) ? sourcesRun[0]?.summary : null) as { businessProfile?: BusinessProfile } | null
  if (!summary?.businessProfile) throw new Error('[internal] 3.3 needs the O-3.2 business profile from a completed 3.2 task run')
  const inputVersions = [ctx.orderVersion, { document_id: zrodla.document_id, version: zrodla.version, status: zrodla.status }]
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '3.3', attempt: ctx.attempt, runner: ctx.runner, models: ctx.models, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const result = await runAuditPipeline({
      order: ctx.order,
      zrodla: zrodla.data as ZrodlaData,
      businessProfile: summary.businessProfile,
      runAgent: ctx.runAgent,
      ledger: ctx.ledger,
      models: ctx.models,
      cache: ctx.cache,
      onEvent: ctx.onEvent,
      repairFindings: ctx.repairFindings,
    })
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-AUDYT',
      status: 'ready_for_review',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues: result.issues,
      renderedMd: renderAudyt({ brand: ctx.order.brand, data: result.data, issues: result.issues, versionLabel: previous ? String(Number(previous.version.split('.')[0]) + 1) : '1' }),
      clientViewMd: result.clientView,
      taskRunId: run.id,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { stats: result.stats }, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    const paused = error instanceof BudgetPausedError
    await finishTaskRun(ctx.em, run, { status: paused ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
