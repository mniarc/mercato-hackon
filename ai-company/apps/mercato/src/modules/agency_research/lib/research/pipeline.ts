import type { DocumentIssue } from '../../data/schemas/envelope'
import { RESEARCH_AGENT_TIERS } from '../agentIds'
import { limits } from '../../data/templates'
import { GateError, type GateIssue } from './gate'
import { BudgetPausedError, type Ledger, type Usage } from './ledger'
import { fingerprint } from './util'
import { PROMPT_PACK_VERSION, hasPackedPrompt } from '../agents/prompts'

/**
 * The pipeline core every step shares: the injected runner contract, the cache,
 * the event stream and the (budget → cache/agent → zod → gate → retry → ledger)
 * loop. Steps live in `./steps/*` and own their documents; this file owns how a
 * call is made and accounted for.
 *
 * `runAgent` is injected: in production `agentRuntime.run()` (persisted `agent_runs`,
 * admission, guardrails, cockpit); in tests a fixture runner; for prompt iteration
 * a bare structured-output call. The usage it returns feeds the ledger.
 */

export type ResearchAgentRunner = (
  agentId: string,
  input: unknown,
  opts: { runTimeoutMs: number; tier: string },
) => Promise<{ result: unknown; usage: Usage | null }>

export type PipelineCache = {
  get(key: string): Promise<unknown | null>
  set(key: string, value: unknown): Promise<void>
}

export type PipelineEvent =
  | { type: 'plan'; step: string; pages: number; chunks: number; estimatedPln: number }
  | { type: 'call'; step: string; agentId: string; label: string; cached: boolean; ms: number; costPln: number }
  | { type: 'gate'; step: string; section: string; kept: number; dropped: number; issues: GateIssue[] }
  | { type: 'gate_rejected'; step: string; section: string; attempt: number; issues: GateIssue[] }
  | { type: 'technical_retry'; step: string; agentId: string; label: string; attempt: number; error: string }
  | { type: 'budget_warning'; total: number; warnAt: number }
  | { type: 'budget_paused'; total: number; cap: number }

export type ModelSet = { extract: string; synthesis: string; qa: string }

export const DEFAULT_CONCURRENCY = 4
export const DEFAULT_EXTRACT_TIMEOUT_MS = 3 * 60_000
export const DEFAULT_SYNTHESIS_TIMEOUT_MS = 8 * 60_000
export const EXPECTED_OUTPUT_TOKENS = { extract: 2_500, synthesis: 6_000, qa: 1_500 } as const
const TECHNICAL_RETRY_DELAY_MS = 15_000

/** A provider / network failure (not a gate, not the budget) that a second attempt may clear. */
function isTechnicalError(error: unknown): boolean {
  return !(error instanceof GateError) && !(error instanceof BudgetPausedError)
}

export type StepFn = <T>(args: {
  step: string
  agentId: string
  label: string
  input: unknown
  parse: (raw: unknown) => T
  gate: (value: T) => { value: T; issues: GateIssue[]; kept: number; dropped: number }
}) => Promise<{ value: T; issues: GateIssue[]; cached: boolean }>

/** Builds the (budget → cache/agent → zod → gate → retry → ledger) loop shared by every call. */
export function createStepRunner(opts: {
  runAgent: ResearchAgentRunner
  ledger: Ledger
  models: ModelSet
  cache?: PipelineCache
  groundingRetries: number
  onEvent: (event: PipelineEvent) => void
  timeouts: { extract: number; synthesis: number; qa: number }
  stats: { agentCalls: number; cachedSteps: number; dropped: number; rejected: number }
}): StepFn {
  const { runAgent, ledger, models, cache, groundingRetries, onEvent, timeouts, stats } = opts
  return async ({ step, agentId, label, input, parse, gate }) => {
    const tier = RESEARCH_AGENT_TIERS[agentId as keyof typeof RESEARCH_AGENT_TIERS] ?? 'extract'
    const model = models[tier]
    // The prompt is part of the input: a new prompt pack never replays an output written under the old one.
    const key = `${agentId}:${fingerprint([agentId, input, model, hasPackedPrompt(agentId) ? PROMPT_PACK_VERSION : 'composed'])}`
    const cached = cache ? await cache.get(key) : null
    if (cached !== null && cached !== undefined) {
      // Cached results are judged again on read: a resume can never replay an ungrounded one.
      try {
        const gated = gate(parse(cached))
        stats.cachedSteps += 1
        stats.dropped += gated.dropped
        ledger.record(step, agentId, null, true)
        onEvent({ type: 'call', step, agentId, label, cached: true, ms: 0, costPln: 0 })
        onEvent({ type: 'gate', step, section: label, kept: gated.kept, dropped: gated.dropped, issues: gated.issues })
        return { value: gated.value, issues: gated.issues, cached: true }
      } catch (error) {
        if (!(error instanceof GateError)) throw error
      }
    }
    let attempt = 0
    let technicalAttempt = 0
    for (;;) {
      const inputChars = JSON.stringify(input).length
      ledger.assertCanSpend(step, agentId, ledger.estimateCallPln(model, inputChars, EXPECTED_OUTPUT_TOKENS[tier]))
      const started = Date.now()
      let call: Awaited<ReturnType<ResearchAgentRunner>>
      try {
        call = await runAgent(agentId, input, { runTimeoutMs: timeouts[tier], tier })
      } catch (error) {
        // STD-LIMITY: two technical attempts per task; a failed attempt is still a persisted run, never a silent loop.
        technicalAttempt += 1
        if (!isTechnicalError(error) || technicalAttempt >= limits.generation.technicalAttemptsPerTask) throw error
        onEvent({ type: 'technical_retry', step, agentId, label, attempt: technicalAttempt, error: error instanceof Error ? error.message : String(error) })
        await new Promise((resolve) => setTimeout(resolve, TECHNICAL_RETRY_DELAY_MS))
        continue
      }
      const { result, usage } = call
      stats.agentCalls += 1
      const entry = ledger.record(step, agentId, usage)
      onEvent({ type: 'call', step, agentId, label, cached: false, ms: Date.now() - started, costPln: entry.costPln })
      const parsed = parse(result)
      try {
        const gated = gate(parsed)
        stats.dropped += gated.dropped
        onEvent({ type: 'gate', step, section: label, kept: gated.kept, dropped: gated.dropped, issues: gated.issues })
        if (cache) await cache.set(key, result)
        // Why a rerun paid for this call: the input behind a miss is kept next to the cache when asked for.
        if (cache && process.env.OM_AGENCY_RESEARCH_DEBUG_INPUTS === '1') await cache.set(`${key}.input`, { agentId, label, model, input })
        return { value: gated.value, issues: gated.issues, cached: false }
      } catch (error) {
        if (!(error instanceof GateError)) throw error
        attempt += 1
        stats.rejected += 1
        onEvent({ type: 'gate_rejected', step, section: label, attempt, issues: error.issues })
        if (attempt > groundingRetries) throw error
      }
    }
  }
}


export { BudgetPausedError, GateError }
export type { DocumentIssue, GateIssue, Ledger, Usage }
