import { mustKeysOf } from '../../../data/contracts'
import type { AudytData } from '../../../data/schemas/audyt'
import type { DocumentIssue, InputVersion, TemplateId } from '../../../data/schemas/envelope'
import type { KonkurencjaData } from '../../../data/schemas/konkurencja'
import { qaResultSchema, type QaFinding, type QaResult } from '../../../data/schemas/qa'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { UstaleniaData } from '../../../data/schemas/ustalenia'
import type { ZrodlaData } from '../../../data/schemas/zrodla'
import { researchQaResult, type OutputLanguage } from '../../../data/validators'
import { limits } from '../../../data/templates'
import { RESEARCH_QA_AGENT_ID } from '../../agentIds'
import { currentInputVersion, finishTaskRun, startTaskRun } from '../../store'
import { openEscalation, qaExhaustedResolutions } from '../escalate'
import { unresolvedCitations } from '../gate'
import { BudgetPausedError, createStepRunner, DEFAULT_EXTRACT_TIMEOUT_MS, DEFAULT_SYNTHESIS_TIMEOUT_MS, type Ledger, type ModelSet, type PipelineCache, type PipelineEvent, type ResearchAgentRunner } from '../pipeline'
import { clientDecidedFields, knownIdsOf, seededFieldRows } from './findings'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 3.7 — quality control of the analysis. Deterministic checks first (a
 * schema-valid document is not yet a correct one), then the QA agent adds what a
 * rule cannot see; the verdict is exactly ready / to_fix / exception. A `to_fix`
 * re-runs the author step with the findings as input, at most the STD-LIMITY
 * repair attempts, then the exception goes to E.1. Internal QA never asks the
 * client for a revision.
 */

export type AnalysisDocuments = {
  zrodla: ZrodlaData
  audyt: AudytData
  konkurencja: KonkurencjaData | null
  ustalenia: UstaleniaData
}

export const authorStepOf: Record<keyof AnalysisDocuments, string> = { zrodla: '3.2', audyt: '3.3', konkurencja: '3.5', ustalenia: '3.6' }
const templateOf: Record<keyof AnalysisDocuments, TemplateId> = { zrodla: 'WZR-ZRODLA', audyt: 'WZR-AUDYT', konkurencja: 'WZR-KONKURENCJA', ustalenia: 'WZR-USTALENIA' }
const outputIdOf: Record<keyof AnalysisDocuments, string> = { zrodla: 'WEW-ZRODLA', audyt: 'WEW-AUDYT', konkurencja: 'WEW-KONKURENCJA', ustalenia: 'WEW-USTALENIA' }

const finding = (code: QaFinding['code'], path: string, severity: QaFinding['severity'], gap: string, owner: QaFinding['owner'], fixStep: string | null, hint: string | null = null): QaFinding => ({
  code,
  path,
  severity,
  gap,
  owner,
  fix_step: fixStep,
  fix_hint: hint,
})

/** Every id an item declares for itself (`*_id` values: facts, materials, variants, scenarios…) — a citation must point at one of these. */
export function declaredIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) declaredIds(item, out)
    return out
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/_id$/.test(key) && typeof child === 'string') out.add(child)
      else declaredIds(child, out)
    }
  }
  return out
}

/** What a rule can decide without a model: references, required fields, limits, the fact/interpretation line. */
export function validatorFindings(documents: AnalysisDocuments, findingsIssues: readonly DocumentIssue[] = []): QaFinding[] {
  const findings: QaFinding[] = []
  for (const row of seededFieldRows().filter((field) => field.priority === 'must')) {
    const path = `field_map[${row.field_key}]`
    if (findingsIssues.some((issue) => issue.code === 'MISSING_FIELD_ROW' && issue.path === path)) {
      findings.push(finding('missing_must_field', `WEW-USTALENIA.${path}`, 'blocking', 'the field mapper omitted a required row', 'agent', '3.6', 'map this required row from the pinned evidence; record genuine client decisions with an actionable question, never invent an answer'))
    }
  }
  const known = knownIdsOf(documents.zrodla, documents.audyt, documents.konkurencja)
  for (const doc of Object.values(documents)) if (doc) for (const id of declaredIds(doc)) known.add(id)
  for (const key of Object.keys(documents) as (keyof AnalysisDocuments)[]) {
    const data = documents[key]
    if (!data) continue
    for (const issue of unresolvedCitations(data, known)) {
      findings.push(finding('unresolved_reference', `${outputIdOf[key]}.${issue.path}`, 'blocking', issue.detail, 'agent', authorStepOf[key], 'cite only ids present in the pinned inputs'))
    }
    for (const mustKey of mustKeysOf(templateOf[key])) {
      const value = (data as Record<string, unknown>)[mustKey]
      const empty = value === null || value === undefined || (Array.isArray(value) && value.length === 0)
      if (empty) findings.push(finding('missing_must_field', `${outputIdOf[key]}.${mustKey}`, 'blocking', `required field ${mustKey} is empty`, 'agent', authorStepOf[key], 'fill the field from evidence or record the gap with an owner'))
    }
  }
  if (documents.ustalenia.questions.length > limits.clientText.questionBatchMax) {
    findings.push(finding('limit_exceeded', 'WEW-USTALENIA.questions', 'blocking', `${documents.ustalenia.questions.length} questions exceed the batch of ${limits.clientText.questionBatchMax}`, 'agent', '3.6', 'keep Must questions, defer the rest'))
  }
  if (documents.konkurencja && documents.konkurencja.selection.length > limits.research.competitorEntitiesMax) {
    findings.push(finding('limit_exceeded', 'WEW-KONKURENCJA.selection', 'blocking', `${documents.konkurencja.selection.length} competitors exceed the limit of ${limits.research.competitorEntitiesMax}`, 'agent', '3.4', 'keep the three closest by audience, need and offer'))
  }
  documents.audyt.buyer_map.forEach((scenario, index) => {
    if (scenario.status === 'evidence' && !scenario.direct_customer_voice) {
      findings.push(finding('fact_vs_interpretation', `WEW-AUDYT.buyer_map[${index}]`, 'major', 'buyer scenario marked as evidence without a direct customer voice', 'agent', '3.3', 'mark the scenario as hypothesis or cite the customer quote'))
    }
  })
  documents.zrodla.proof_cards.forEach((card, index) => {
    if (card.proof_type === 'measured_case' && !card.observed_result) {
      findings.push(finding('invented_effectiveness', `WEW-ZRODLA.proof_cards[${index}]`, 'blocking', 'measured case without an observed result', 'agent', '3.2', 'downgrade to declaration or cite the result fact'))
    }
  })
  documents.konkurencja?.difference_candidates.forEach((candidate, index) => {
    if (candidate.allowed_claim_strength === 'demonstrated_result' && candidate.proof_ids.length === 0) {
      findings.push(finding('invented_effectiveness', `WEW-KONKURENCJA.difference_candidates[${index}]`, 'blocking', 'a demonstrated result without a proof card', 'agent', '3.5', 'lower the claim strength or cite the proof'))
    }
  })
  documents.ustalenia.field_map.forEach((row) => {
    if (clientDecidedFields.includes(row.field_key) && row.status === 'fact') {
      findings.push(finding('fact_vs_interpretation', `WEW-USTALENIA.field_map[${row.field_key}]`, 'blocking', 'a future goal, priority or preference recorded as a fact from the website', 'agent', '3.6', 'mark as hypothesis awaiting the client'))
    }
  })
  return findings
}

const CLAIM_CODES = new Set(['unsourced_claim', 'invented_effectiveness', 'fact_vs_interpretation', 'other'])

/**
 * A first-party claim the register records WITH its limitation is correct research:
 * the site says it, the register says the site says it and that nothing backs it.
 * A QA finding that asks an author step to "fix" such a fact is really a question
 * for the client (supply the basis, or accept hedged wording), so its owner becomes
 * `client` and it stops routing repairs that cannot change anything.
 */
/** A gap the QA agent itself attributes to a pending client decision — the decision, not a writer ignoring a recorded one. */
export const CLIENT_DECISION_GAP = /(awaiting[_ ]client|awaiting the client|undecided by the client|client (has not|hasn't|must) (decide|confirm|choose|select)|client decision (is )?(pending|outstanding|missing|awaited|not (yet )?(made|recorded))|pending client|no confirmed (next-step |cta |contact )?destination|destination[^.]{0,40}(not (yet )?(confirmed|decided|provided)|unconfirmed)|awaiting confirmation from the client|decyzj\w* klienta)/i

/** A finding that says the document is right is commentary — unless a "but" follows the concession. */
export const CONCEDES_CORRECT = /\b(this is correct|correctly (identifies|states|labels|records|notes|acknowledges|flags)|is correct(ly)? (labeled|marked|stated))\b/i
const CONCESSION_REVERSED = /\b(but|however|yet|while|although|except|jednak|ale|natomiast|choć)\b/i

export function concedesCorrect(gap: string): boolean {
  return CONCEDES_CORRECT.test(gap) && !CONCESSION_REVERSED.test(gap)
}

/**
 * Evidence no author step can obtain from public sources — "lack of public knowledge is not a company
 * defect" (Rafał). Phrased as the evidence-request wording the QA agent uses, so that "TOP04 promises
 * 40 % faster; no proof card backs the number" (a writer's invention) does not match while "P03 is a
 * single-customer self-reported case, not independently verified" (an evidence request) does.
 */
export const NON_PUBLIC_EVIDENCE = /\b(interviews?|surveys?|conversion data|sales data|internal analytics|no analytics|independent (validation|verification)|third[- ]party (validation|verification)|(no|without|internal|independent) benchmarks?|(no|without|lacks?|undisclosed|disclosed|not disclosed) (calculation )?(methodology|method)|ICP validation|customer data|internal data|self-reported|single-customer|(not )?independently (verified|measured|audited|confirmed)|does not by itself prove|first-party (description|declaration|report|framing)|not (an )?independent(ly)? (verification|validation|measurement|source)|insufficient evidence exists|no proof card (exists|is available|in the register|backs (this|the) (claim|case|figure))|readiness:? ?'?(blocked|conditional)|plan[_ ]capacity|no (completion date|implementation evidence)|no (recorded|disclosed) (artifact|method)|selection criteri|decision criteri|buyer criteri|kryteri\w* (wyboru|decyzji)|wywiad)/i

/** Codes that describe the writer's own text; unobtainable evidence excuses them only when the finding is about recorded evidence (an F/P/X id). */
const WRITER_FAULT_CODES = new Set(['contradiction', 'invented_effectiveness', 'duplicate'])
const RECORDED_ID = /\b(F\d{2,}|P\d{2,}|X\d{2,})\b/

/** Unobtainable evidence is the client's gap — for a writer-fault code only when the finding points at recorded evidence, not at the writer's own number. */
export function unobtainableEvidence(f: Pick<QaFinding, 'code' | 'gap' | 'path'>): boolean {
  if (!NON_PUBLIC_EVIDENCE.test(f.gap)) return false
  return WRITER_FAULT_CODES.has(f.code) ? RECORDED_ID.test(`${f.path} ${f.gap}`) : true
}

/** An author step owns only the document its path names; the QA agent's own routing is advisory. */
function fixStepForPath(path: string): AuthorStepId | null {
  if (/^WEW-ZRODLA/.test(path)) return '3.2'
  if (/^WEW-AUDYT/.test(path)) return '3.3'
  if (/^WEW-KONKURENCJA/.test(path)) return '3.5'
  if (/^WEW-USTALENIA/.test(path)) return '3.6'
  // A bare id path: the alphabet says which register the item lives in (Rafał's id prefixes).
  const id = path.match(/^\s*(S-|F|P|L|A|T|X|C|G|D|Q|ER)\d/)?.[1]
  if (id === 'C') return '3.4'
  if (id === 'G') return '3.3'
  if (id === 'D') return '3.5'
  if (id === 'Q' || id === 'ER') return '3.6'
  if (id) return '3.2'
  return null
}

/**
 * The rules every production QA (Q-S, Q-P, Q-T) shares for the agent's own findings:
 * evidence public sources cannot give and gaps the finding itself attributes to a
 * pending client decision are the client's questions; a length the QA invented and
 * a finding that concedes the document is right are advice, never blockers.
 */
export function reclassifyProductionFindings(findings: QaFinding[]): QaFinding[] {
  return findings.map((f) => {
    if (f.owner === 'client' || f.owner === 'staff') return f
    if (unobtainableEvidence(f) || CLIENT_DECISION_GAP.test(f.gap)) {
      return { ...f, owner: 'client', fix_step: null, fix_hint: 'needs a client decision or evidence public sources cannot provide; a question, not a rewrite' }
    }
    if (f.severity === 'blocking' && (f.code === 'limit_exceeded' || concedesCorrect(f.gap))) return { ...f, severity: 'major' }
    return f
  })
}

export function reclassifyRecordedClaims(findings: QaFinding[], zrodla: ZrodlaData, ustalenia?: UstaleniaData | null): QaFinding[] {
  const byId = new Map(zrodla.facts.map((fact) => [fact.fact_id, fact]))
  const awaitingClient = new Set<string>((ustalenia?.field_map ?? []).filter((row) => row.decision_state === 'awaiting_client').map((row) => row.field_key))
  const recordedConflicts = new Set(zrodla.conflicts.map((conflict) => conflict.conflict_id))
  return findings.map((raw) => {
    // The QA agent sometimes prefixes paths with the input key it read them from.
    const f = /^documents\./.test(raw.path) ? { ...raw, path: raw.path.replace(/^documents\./, '') } : raw
    if (f.owner === 'client' || f.owner === 'staff') return f
    // A conflict the register already records is the register doing its job; which side is true is the client's answer.
    // Only when the finding is ABOUT the recorded conflict — a downstream document taking one side is still the writer's fault.
    const conflictId = f.path.match(/\b(X\d{2,})\b/)?.[1] ?? f.gap.match(/\bconflicts?\W+(X\d{2,})\b/i)?.[1]
    if (conflictId && recordedConflicts.has(conflictId) && /^(WEW-ZRODLA\.)?conflicts|^X\d/.test(f.path)) {
      return { ...f, owner: 'client', fix_step: null, fix_hint: `conflict ${conflictId} is recorded in the register with its question; the client resolves it` }
    }
    // A findings-map row already waiting for the client is a question by definition, not a missing field an agent forgot.
    const fieldKey = f.path.match(/^WEW-USTALENIA\.field_map[.[]\s*['"]?(\w+)/)?.[1]
    if (f.code === 'missing_must_field' && fieldKey && awaitingClient.has(fieldKey)) {
      return { ...f, owner: 'client', fix_step: null, fix_hint: 'the findings map already records this field as awaiting the client; it is a question for 4.3' }
    }
    // Asking for interviews, benchmarks or a methodology is a request to the client, not a rerun of a reading step.
    if (unobtainableEvidence(f)) {
      return { ...f, owner: 'client', fix_step: null, fix_hint: 'needs evidence that public sources cannot provide; recorded as a question / evidence request for the client' }
    }
    if (CLIENT_DECISION_GAP.test(f.gap)) {
      return { ...f, owner: 'client', fix_step: null, fix_hint: 'the finding itself says the client has not decided; a question for 4.3, not a rewrite' }
    }
    if (CLAIM_CODES.has(f.code)) {
      const cited = [...new Set(`${f.path} ${f.gap}`.match(/\bF\d{2,}\b/g) ?? [])].map((id) => byId.get(id)).filter((fact): fact is NonNullable<typeof fact> => Boolean(fact))
      if (cited.length && cited.every((fact) => fact.kind === 'first_party_claim' && fact.limitation)) {
        return { ...f, owner: 'client', fix_step: null, fix_hint: 'recorded as a first-party claim with its limitation; the client supplies the basis or accepts hedged wording (question / evidence request)' }
      }
    }
    const routed = fixStepForPath(f.path)
    return routed && routed !== f.fix_step ? { ...f, fix_step: routed } : f
  })
}

/**
 * Pure verdict rule over all findings: a blocking finding an agent step can fix →
 * to_fix; a blocking finding nobody in the process can fix (staff, or no step) →
 * exception; blocking findings owned by the client are questions, not failures.
 */
export function mergeQaVerdict(agent: QaResult, validator: QaFinding[]): QaResult {
  const findings = [...validator, ...agent.findings].slice(0, 20)
  const blocking = findings.filter((f) => f.severity === 'blocking')
  const exception = blocking.some((f) => f.owner === 'staff' || ((f.owner === 'agent' || f.owner === 'research') && !f.fix_step))
  const toFix = blocking.some((f) => (f.owner === 'agent' || f.owner === 'research') && f.fix_step)
  // The agent's own verdict is advisory: with no blocking finding the analysis is ready.
  const verdict: QaResult['verdict'] = exception ? 'exception' : toFix ? 'to_fix' : 'ready'
  return qaResultSchema.parse({ verdict, findings, summary: agent.summary })
}

export type AnalysisQaOptions = {
  order: OrderFacts
  outputLanguage: OutputLanguage
  documents: AnalysisDocuments
  findingsIssues?: readonly DocumentIssue[]
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  onEvent?: (event: PipelineEvent) => void
}

/** The register without its verbatim locators — the QA agent judges claims and citations, not page text. */
function compactForQa(documents: AnalysisDocuments): Record<string, unknown> {
  return {
    'WEW-ZRODLA': { ...documents.zrodla, facts: documents.zrodla.facts.map(({ locator: _locator, paraphrase: _paraphrase, ...fact }) => fact), sources: documents.zrodla.sources.map((s) => ({ source_id: s.source_id, access: s.access, kind: s.kind })) },
    'WEW-AUDYT': documents.audyt,
    // Timestamps are not evidence, and they would make every rerun a new QA call with a new verdict.
    'WEW-KONKURENCJA': documents.konkurencja ? { ...documents.konkurencja, channels: documents.konkurencja.channels.map(({ retrieved_at: _retrievedAt, ...channel }) => channel) } : null,
    'WEW-USTALENIA': documents.ustalenia,
  }
}

export const qaCriteria = [
  'Every important conclusion has a source and a limitation.',
  'Facts, hypotheses and missing data are distinguishable.',
  'No effectiveness, ROI or uniqueness claim rests on public reactions or on absence at competitors.',
  'No future vision, goal or priority of the client is recorded as a fact taken from the current website.',
  'Required fields are present; questions do not ask for data already in the register or the order.',
  'A blocking finding names the author step (3.2–3.6) that repairs it; client decisions are questions, not failures.',
]

export async function runAnalysisQa(opts: AnalysisQaOptions): Promise<{ result: QaResult; validator: QaFinding[]; stats: { agentCalls: number; cachedSteps: number } }> {
  const stats = { agentCalls: 0, cachedSteps: 0, dropped: 0, rejected: 0 }
  const step = createStepRunner({
    runAgent: opts.runAgent,
    ledger: opts.ledger,
    models: opts.models,
    cache: opts.cache,
    groundingRetries: 0,
    onEvent: opts.onEvent ?? (() => {}),
    timeouts: { extract: DEFAULT_EXTRACT_TIMEOUT_MS, synthesis: DEFAULT_SYNTHESIS_TIMEOUT_MS, qa: DEFAULT_EXTRACT_TIMEOUT_MS },
    stats,
  })
  const validator = validatorFindings(opts.documents, opts.findingsIssues)
  const judged = await step<QaResult>({
    step: '3.7',
    agentId: RESEARCH_QA_AGENT_ID,
    label: 'analysis_qa',
    input: {
      order: { brand: opts.order.brand, market: opts.order.market, language: opts.order.language, websiteUrl: opts.order.websiteUrl, purchaseGoal: opts.order.purchaseGoal },
      outputLanguage: opts.outputLanguage,
      documents: compactForQa(opts.documents),
      validator_findings: validator,
      criteria: qaCriteria,
    },
    parse: (raw) => researchQaResult.parse(raw).data,
    gate: (result) => ({ value: result, issues: [], kept: result.findings.length, dropped: 0 }),
  })
  const reclassified = { ...judged.value, findings: reclassifyRecordedClaims(judged.value.findings, opts.documents.zrodla, opts.documents.ustalenia) }
  return { result: mergeQaVerdict(reclassified, validator), validator, stats: { agentCalls: stats.agentCalls, cachedSteps: stats.cachedSteps } }
}

export type AuthorStepId = '3.2' | '3.3' | '3.4' | '3.5' | '3.6'
export type AuthorSteps = Partial<Record<AuthorStepId, (ctx: StepContext) => Promise<StepOutcome>>>

export type QaLoopOutcome = {
  verdict: QaResult['verdict']
  findings: QaFinding[]
  taskRunId: string
  repairs: number
  escalationVersionId?: string
}

async function loadAnalysis(ctx: StepContext): Promise<{ documents: AnalysisDocuments; inputVersions: InputVersion[]; findingsIssues: readonly DocumentIssue[] }> {
  const { em, scope, orderRef } = ctx
  const zrodla = await currentInputVersion(em, scope, orderRef, 'WZR-ZRODLA')
  const audyt = await currentInputVersion(em, scope, orderRef, 'WZR-AUDYT')
  const konkurencja = await currentInputVersion(em, scope, orderRef, 'WZR-KONKURENCJA')
  const ustalenia = await currentInputVersion(em, scope, orderRef, 'WZR-USTALENIA')
  if (!zrodla || !audyt || !ustalenia) throw new Error('[internal] 3.7 needs WEW-ZRODLA, WEW-AUDYT and WEW-USTALENIA versions for this order')
  const pinned = [zrodla, audyt, konkurencja, ustalenia].filter((v): v is NonNullable<typeof v> => v !== null)
  return {
    documents: { zrodla: zrodla.data as ZrodlaData, audyt: audyt.data as AudytData, konkurencja: (konkurencja?.data as KonkurencjaData | undefined) ?? null, ustalenia: ustalenia.data as UstaleniaData },
    findingsIssues: ustalenia.issues ?? [],
    inputVersions: [ctx.orderVersion, ...pinned.map((v) => ({ document_id: v.document_id, version: v.version, status: v.status }))],
  }
}

/**
 * DB wrapper: QA → (to_fix → author step with the findings → QA)* ≤ repair
 * attempts → E.1 on exhaustion or exception. Each QA pass is a 3.7 task run with
 * its `qa_result`; versions are never mutated.
 */
export async function runQaLoop(ctx: StepContext, opts: { authorSteps: AuthorSteps }): Promise<QaLoopOutcome> {
  const { em, scope, orderRef } = ctx
  const maxRepairs = limits.generation.qaRepairAttemptsPerRun
  let repairs = 0
  for (;;) {
    const { documents, inputVersions, findingsIssues } = await loadAnalysis(ctx)
    const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: '3.7', attempt: repairs + 1, runner: ctx.runner, models: ctx.models, inputVersions })
    ctx.taskRunIds.push(run.id)
    let result: QaResult
    try {
      result = (await runAnalysisQa({ order: ctx.order, outputLanguage: ctx.order.outputLanguage, documents, findingsIssues, runAgent: ctx.runAgent, ledger: ctx.ledger, models: ctx.models, cache: ctx.cache, onEvent: ctx.onEvent })).result
    } catch (error) {
      const paused = error instanceof BudgetPausedError
      await finishTaskRun(em, run, { status: paused ? 'paused_budget' : 'failed', agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
      throw error
    }
    await finishTaskRun(em, run, { status: result.verdict === 'ready' ? 'done' : result.verdict, qaResult: result, agentRunIds: ctx.agentRunIds, cost: ctx.ledger.snapshot() })
    ctx.log(`3.7 attempt ${repairs + 1}: ${result.verdict} (${result.findings.length} findings)`)
    if (result.verdict === 'ready') return { verdict: 'ready', findings: result.findings, taskRunId: run.id, repairs }

    const blocking = result.findings.filter((f) => f.severity === 'blocking')
    // In step order: a register rewritten by 3.2 must precede the steps that read it in the same round.
    const fixSteps = ([...new Set(blocking.map((f) => f.fix_step).filter((s): s is string => s !== null))] as AuthorStepId[]).sort()
    const canRepair = result.verdict === 'to_fix' && repairs < maxRepairs && fixSteps.length > 0 && fixSteps.every((s) => opts.authorSteps[s])
    if (canRepair) {
      repairs += 1
      // A new register from 3.2 carries only the client's material; the competitor facts 3.4 appended must be
      // re-appended before 3.3 / 3.5 / 3.6 read the register again, or every citation in WEW-KONKURENCJA dangles.
      // 3.5 re-runs the comparison only and never re-appends; 3.4 does.
      const competitors = opts.authorSteps['3.4']
      const reappend = fixSteps.includes('3.2') && !fixSteps.includes('3.4') && competitors && documents.konkurencja
      for (const stepId of fixSteps) {
        const author = opts.authorSteps[stepId]
        if (!author) continue
        ctx.log(`3.7 → repair ${stepId} (attempt ${repairs} of ${maxRepairs})`)
        await author({ ...ctx, repairFindings: blocking.filter((f) => f.fix_step === stepId), attempt: repairs + 1 })
        if (stepId === '3.2' && reappend && competitors) {
          ctx.log(`3.7 → 3.4 re-run after the register changed (competitor facts re-appended)`)
          await competitors({ ...ctx, repairFindings: [], attempt: repairs + 1 })
        }
      }
      continue
    }
    const code = result.verdict === 'exception' ? 'invalid_state' : 'qa_exhausted'
    const primaryStep = fixSteps[0] ?? '3.6'
    const escalation = await openEscalation(
      ctx,
      {
        code,
        summary: result.verdict === 'exception' ? `QA found a problem no author step can solve: ${result.summary}` : `QA still fails after ${repairs} repair attempt(s) (STD-LIMITY qa_repair_attempts_per_run = ${maxRepairs}): ${result.summary}`,
        triggerStep: '3.7',
        evidence: [
          { ref: run.id, fact: `3.7 task run, verdict ${result.verdict}, ${blocking.length} blocking findings` },
          ...blocking.slice(0, 10).map((f) => ({ ref: f.path, fact: `${f.code}: ${f.gap}` })),
        ],
        blockedSteps: ['3.8', '4.1', '4.2'],
        decisionQuestion: `Which blocking finding should be accepted as an explicit limit, and which author step (${fixSteps.join(', ') || primaryStep}) should be rerun with guidance?`,
        allowedResolutions: qaExhaustedResolutions(primaryStep),
        resumeStep: '3.7',
      },
      inputVersions,
    )
    return { verdict: result.verdict, findings: result.findings, taskRunId: run.id, repairs, escalationVersionId: escalation.versionId }
  }
}
