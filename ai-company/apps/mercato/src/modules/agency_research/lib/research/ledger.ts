import { limits } from '../../data/templates'

/**
 * Spend control. The OpenRouter key belongs to the client, so every model call is
 * accounted for and the run stops before it can exceed its cap — the check runs
 * before EVERY attempt (technical retries, grounding re-requests, QA repairs).
 *
 * Measured cost comes from the orchestrator's `agent_runs.cost_minor` (priced by
 * `OM_AGENT_MODEL_PRICING`); when a run has no measured cost the entry is an
 * estimate from the token counts and the local price table, flagged as such.
 */

export type LedgerEntry = {
  /** Epoch ms when the call was recorded — lets a task run take only its own entries. */
  at: number
  step: string
  agentId: string
  model: string | null
  inputTokens: number
  outputTokens: number
  costPln: number
  measured: boolean
  cached: boolean
  agentRunId: string | null
}

export type LedgerSnapshot = {
  currency: 'PLN'
  total: number
  cap: number
  warnAt: number
  warnedAt: string | null
  pausedAt: string | null
  entries: LedgerEntry[]
}

export type Usage = {
  model: string | null
  inputTokens: number
  outputTokens: number
  /** Minor units in `currency`, from the orchestrator; null when unpriced. */
  costMinor: number | null
  currency: string | null
  agentRunId: string | null
}

export class BudgetPausedError extends Error {
  constructor(readonly snapshot: LedgerSnapshot, readonly nextEstimatePln: number) {
    super(`[internal] research budget paused: ${snapshot.total.toFixed(2)} PLN spent, next call ~${nextEstimatePln.toFixed(2)} PLN, cap ${snapshot.cap} PLN`)
  }
}

/** USD per 1M tokens for the models this lane routes to; override with OM_AGENCY_RESEARCH_MODEL_PRICING. */
const DEFAULT_PRICES_USD: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'anthropic/claude-haiku-4.5': { inputPer1M: 1, outputPer1M: 5 },
  'anthropic/claude-sonnet-5': { inputPer1M: 3, outputPer1M: 15 },
  'mistralai/mistral-nemo': { inputPer1M: 0.02, outputPer1M: 0.04 },
}

export type PriceTable = Record<string, { inputPer1M: number; outputPer1M: number }>

export function resolvePriceTable(env: NodeJS.ProcessEnv = process.env): PriceTable {
  const raw = env.OM_AGENCY_RESEARCH_MODEL_PRICING
  if (!raw) return DEFAULT_PRICES_USD
  try {
    const parsed = JSON.parse(raw) as PriceTable
    return { ...DEFAULT_PRICES_USD, ...parsed }
  } catch {
    return DEFAULT_PRICES_USD
  }
}

export function resolveUsdPln(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.OM_AGENCY_RESEARCH_USD_PLN)
  return Number.isFinite(value) && value > 0 ? value : 3.7
}

function priceFor(model: string | null, table: PriceTable) {
  if (!model) return null
  const afterSlash = model.includes('/') ? model.slice(model.indexOf('/') + 1) : null
  return table[model] ?? (afterSlash ? table[afterSlash] : undefined) ?? null
}

export type Ledger = {
  /** Throws BudgetPausedError when the next call could push the run over its cap. */
  assertCanSpend(step: string, agentId: string, estimatePln: number): void
  record(step: string, agentId: string, usage: Usage | null, cached?: boolean): LedgerEntry
  estimateCallPln(model: string | null, inputChars: number, expectedOutputTokens: number): number
  snapshot(): LedgerSnapshot
  onEvent?: (event: LedgerEvent) => void
}

export type LedgerEvent = { type: 'budget_warning'; total: number; warnAt: number } | { type: 'budget_paused'; total: number; cap: number }

export type LedgerOptions = {
  maxPln?: number
  warnPln?: number
  prices?: PriceTable
  usdPln?: number
  onEvent?: (event: LedgerEvent) => void
  now?: () => Date
}

export function createLedger(opts: LedgerOptions = {}): Ledger {
  const cap = opts.maxPln ?? limits.cost.defaultMaxPlnPerRun
  const warnAt = opts.warnPln ?? Math.min(limits.cost.warnPlnPerRun, cap / 2)
  const prices = opts.prices ?? resolvePriceTable()
  const usdPln = opts.usdPln ?? resolveUsdPln()
  const now = opts.now ?? (() => new Date())
  const entries: LedgerEntry[] = []
  let total = 0
  let warnedAt: string | null = null
  let pausedAt: string | null = null

  const estimateCallPln = (model: string | null, inputChars: number, expectedOutputTokens: number) => {
    const price = priceFor(model, prices)
    if (!price) return 0
    const inputTokens = Math.ceil(inputChars / 4)
    return ((inputTokens * price.inputPer1M + expectedOutputTokens * price.outputPer1M) / 1_000_000) * usdPln
  }

  const snapshot = (): LedgerSnapshot => ({ currency: 'PLN', total, cap, warnAt, warnedAt, pausedAt, entries: [...entries] })

  return {
    estimateCallPln,
    snapshot,
    onEvent: opts.onEvent,
    assertCanSpend(step, agentId, estimatePln) {
      if (total + estimatePln > cap) {
        pausedAt = now().toISOString()
        opts.onEvent?.({ type: 'budget_paused', total, cap })
        throw new BudgetPausedError(snapshot(), estimatePln)
      }
    },
    record(step, agentId, usage, cached = false) {
      let costPln = 0
      let measured = false
      if (usage && !cached) {
        const price = priceFor(usage.model, prices)
        const estimatePln = price ? ((usage.inputTokens * price.inputPer1M + usage.outputTokens * price.outputPer1M) / 1_000_000) * usdPln : 0
        // The platform prices in whole cents: a small call rounds to 0 there, so the
        // local estimate is the safer number whenever it is the larger one.
        if (usage.costMinor !== null && usage.costMinor !== undefined && usage.costMinor > 0) {
          const major = usage.costMinor / 100
          const measuredPln = (usage.currency ?? 'USD').toUpperCase() === 'PLN' ? major : major * usdPln
          costPln = Math.max(measuredPln, estimatePln)
          measured = measuredPln >= estimatePln
        } else {
          costPln = estimatePln
        }
      }
      const entry: LedgerEntry = {
        at: now().getTime(),
        step,
        agentId,
        model: usage?.model ?? null,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        costPln,
        measured,
        cached,
        agentRunId: usage?.agentRunId ?? null,
      }
      entries.push(entry)
      total += costPln
      if (!warnedAt && total >= warnAt) {
        warnedAt = now().toISOString()
        opts.onEvent?.({ type: 'budget_warning', total, warnAt })
      }
      return entry
    },
  }
}

export function formatLedger(snapshot: LedgerSnapshot): string {
  const byStep = new Map<string, { calls: number; cached: number; pln: number; measured: number }>()
  for (const entry of snapshot.entries) {
    const row = byStep.get(entry.step) ?? { calls: 0, cached: 0, pln: 0, measured: 0 }
    row.calls += 1
    if (entry.cached) row.cached += 1
    row.pln += entry.costPln
    if (entry.measured) row.measured += 1
    byStep.set(entry.step, row)
  }
  const lines = [...byStep.entries()].map(
    ([step, row]) => `  ${step}: ${row.calls} calls (${row.cached} cached, ${row.measured} priced by the platform) — ${row.pln.toFixed(2)} PLN`,
  )
  return [`Spend: ${snapshot.total.toFixed(2)} PLN of ${snapshot.cap} PLN cap${snapshot.pausedAt ? ' — PAUSED' : ''}`, ...lines].join('\n')
}
