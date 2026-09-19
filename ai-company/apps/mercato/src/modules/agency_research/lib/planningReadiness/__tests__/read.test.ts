import { readStrategyPairAcceptance } from '../../strategyPairAcceptance/read'
import { readPlanningReadiness } from '../read'

jest.mock('../../strategyPairAcceptance/read', () => ({ readStrategyPairAcceptance: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const input = { orderRef: uuid(3), strategyVersionId: uuid(4), tovVersionId: uuid(5),
  process: { workflowDefinitionId: uuid(6), workflowId: 'agency_operations.analysis.v1', version: 2 } }
beforeEach(() => jest.clearAllMocks())

test('requires native process identity, not only document approvals', async () => {
  const { process: _unused, ...unconfigured } = input
  await expect(readPlanningReadiness({} as never, scope, unconfigured)).resolves.toMatchObject({ status: 'not_ready', reason: 'missing_process_configuration' })
  expect(readStrategyPairAcceptance).not.toHaveBeenCalled()
})
test('partial decision cannot activate planning', async () => {
  jest.mocked(readStrategyPairAcceptance).mockResolvedValue({ status: 'partial', orderRef: input.orderRef, remainingDocuments: ['tov'] } as never)
  await expect(readPlanningReadiness({} as never, scope, input)).resolves.toMatchObject({ status: 'not_ready', reason: 'pair_acceptance_incomplete', remainingDocuments: ['tov'] })
})
test('ready handoff preserves exact refs and does not create a plan', async () => {
  const accepted = { status: 'accepted', orderRef: input.orderRef, remainingDocuments: [], pair: { strategy: { versionId: input.strategyVersionId }, tov: { versionId: input.tovVersionId } } } as never
  jest.mocked(readStrategyPairAcceptance).mockResolvedValue(accepted)
  await expect(readPlanningReadiness({} as never, scope, input)).resolves.toEqual({ status: 'ready', orderRef: input.orderRef, process: input.process, accepted })
})
