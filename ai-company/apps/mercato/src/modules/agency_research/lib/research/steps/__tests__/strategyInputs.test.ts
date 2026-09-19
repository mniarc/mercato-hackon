/** @jest-environment node */
import type { StepContext, StrategyExecutionInput, StrategyExecutionInputs } from '../context'
import { readStrategyFoundation, readStrategyPairVersion, recordStrategyPairVersion } from '../strategyInputs'
import { currentInputVersion } from '../../../store'

jest.mock('../../../store', () => ({ currentInputVersion: jest.fn() }))
const current = jest.mocked(currentInputVersion)
const snapshot = (name: string, version = '1.0'): StrategyExecutionInput => ({ document_id: `${name}@case`, version, versionId: `${name}-${version}`, data: { source: name, version }, status: 'approved' })
const inputs: StrategyExecutionInputs = {
  brief: snapshot('brief'), zrodla: snapshot('sources'), audyt: snapshot('audit'), konkurencja: snapshot('competitors'), ustalenia: snapshot('findings'),
}
const context = (): StepContext => ({
  em: {}, scope: { tenantId: 'tenant', organizationId: 'org' }, orderRef: 'case',
  strategyInputs: inputs, strategyOutputs: { strategy: null, tov: null },
}) as unknown as StepContext

beforeEach(() => { current.mockReset(); current.mockResolvedValue(snapshot('unrelated-latest', '99.0')) })

it('reads every foundation from the accepted/frozen snapshot without latest-version queries', async () => {
  const ctx = context()
  for (const key of Object.keys(inputs) as (keyof StrategyExecutionInputs)[]) {
    await expect(readStrategyFoundation(ctx, key)).resolves.toBe(inputs[key])
  }
  expect(current).not.toHaveBeenCalled()
})

it('does not adopt another execution’s current pair when this execution has not produced it', async () => {
  const ctx = context()
  await expect(readStrategyPairVersion(ctx, 'strategy')).resolves.toBeNull()
  await expect(readStrategyPairVersion(ctx, 'tov')).resolves.toBeNull()
  expect(current).not.toHaveBeenCalled()
})

it('carries each newly saved pair through shallow QA repair contexts while retaining the foundation', async () => {
  const ctx = context()
  const firstStrategy = snapshot('strategy')
  const firstTov = snapshot('tov')
  recordStrategyPairVersion(ctx, 'strategy', firstStrategy)
  recordStrategyPairVersion(ctx, 'tov', firstTov)
  const repairContext = { ...ctx, attempt: 2 }
  await expect(readStrategyPairVersion(repairContext, 'strategy')).resolves.toBe(firstStrategy)
  const repairedStrategy = snapshot('strategy', '2.0')
  recordStrategyPairVersion(repairContext, 'strategy', repairedStrategy)
  await expect(readStrategyPairVersion(ctx, 'strategy')).resolves.toBe(repairedStrategy)
  await expect(readStrategyPairVersion(ctx, 'tov')).resolves.toBe(firstTov)
  await expect(readStrategyFoundation(repairContext, 'brief')).resolves.toBe(inputs.brief)
  expect(current).not.toHaveBeenCalled()
})

it('keeps existing full-pipeline calls on their original store loaders', async () => {
  const ctx = { ...context(), strategyInputs: undefined, strategyOutputs: undefined }
  await readStrategyFoundation(ctx, 'brief')
  await readStrategyPairVersion(ctx, 'strategy')
  expect(current).toHaveBeenNthCalledWith(1, ctx.em, ctx.scope, 'case', 'WZR-BRIEF')
  expect(current).toHaveBeenNthCalledWith(2, ctx.em, ctx.scope, 'case', 'WZR-STRATEGIA')
})

it('refuses an incomplete phase context instead of silently falling back to latest', async () => {
  const ctx = { ...context(), strategyOutputs: undefined }
  await expect(readStrategyFoundation(ctx, 'brief')).rejects.toThrow('requires its own output pair')
  await expect(readStrategyPairVersion(ctx, 'strategy')).rejects.toThrow('requires its own output pair')
  expect(current).not.toHaveBeenCalled()
})
