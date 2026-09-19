import { currentInputVersion } from '../../store'
import type { StepContext, StrategyExecutionInput, StrategyExecutionInputs, StrategyExecutionOutputs } from './context'

const templates = {
  brief: 'WZR-BRIEF', zrodla: 'WZR-ZRODLA', audyt: 'WZR-AUDYT', konkurencja: 'WZR-KONKURENCJA', ustalenia: 'WZR-USTALENIA',
  strategy: 'WZR-STRATEGIA', tov: 'WZR-TOV',
} as const

/** Legacy full-pipeline calls keep their loaders; phase-only calls never fall back to latest. */
export async function readStrategyFoundation(ctx: StepContext, key: keyof StrategyExecutionInputs): Promise<StrategyExecutionInput | null> {
  if (ctx.strategyInputs) {
    if (!ctx.strategyOutputs) throw new Error('[internal] Pinned strategy execution requires its own output pair')
    return ctx.strategyInputs[key]
  }
  return currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, templates[key])
}

export async function readStrategyPairVersion(ctx: StepContext, key: keyof StrategyExecutionOutputs): Promise<StrategyExecutionInput | null> {
  if (ctx.strategyInputs) {
    if (!ctx.strategyOutputs) throw new Error('[internal] Pinned strategy execution requires its own output pair')
    return ctx.strategyOutputs[key]
  }
  return currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, templates[key])
}

export function recordStrategyPairVersion(ctx: StepContext, key: keyof StrategyExecutionOutputs, version: StrategyExecutionInput): void {
  if (!ctx.strategyInputs) return
  if (!ctx.strategyOutputs) throw new Error('[internal] Pinned strategy execution requires its own output pair')
  ctx.strategyOutputs[key] = version
}
