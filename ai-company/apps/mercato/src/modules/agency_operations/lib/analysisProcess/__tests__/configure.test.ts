/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'

const authorize = jest.fn()
const configureBriefReview = jest.fn()
const configureStrategyPairReview = jest.fn()
jest.mock('@open-mercato/core/modules/workflows/lib/definition-grant', () => ({ authorizeWorkflowGrantChange: (...args: unknown[]) => authorize(...args) }))
jest.mock('../../briefStrategyProcess/configure', () => ({ configureBriefReviewWorkflow: (...args: unknown[]) => configureBriefReview(...args) }))
jest.mock('../../strategyPairReview/configure', () => ({ configureStrategyPairReviewWorkflow: (...args: unknown[]) => configureStrategyPairReview(...args) }))
import { configureAgencyAnalysisProcess, AGENCY_ANALYSIS_GRANTED_FEATURES } from '../configure'
import { AGENCY_ANALYSIS_WORKFLOW_ID } from '../workflow'

const input = {
  tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002', userId: '00000000-0000-4000-8000-000000000003',
  policy: { through: '3.8', maxCostPln: 2, productSelection: { sku: 'test-product', offer_version: 'test-v1', price_net: 123, currency: 'PLN', result_limits: { topics: 7 } } },
}
const findOwnedDefinition = jest.fn()
const upsertOwnedDefinition = jest.fn()
const hasRegistration = jest.fn()
const container = { hasRegistration, resolve: (key: string) => {
  if (key === 'workflowDefinitionAuthoring') return { findOwnedDefinition, upsertOwnedDefinition }
  return {}
} } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  authorize.mockResolvedValue(null)
  configureBriefReview.mockResolvedValue({ workflowId: 'agency_operations.brief-review.v1', version: 1 })
  hasRegistration.mockReturnValue(true)
  findOwnedDefinition.mockResolvedValue(null)
  upsertOwnedDefinition.mockResolvedValue({ ok: true, definition: { id: 'definition-id', workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 1 } })
})

it('authorizes native grants and pins explicit agency policy in the definition', async () => {
  await expect(configureAgencyAnalysisProcess(container, input)).resolves.toEqual({ workflowDefinitionId: 'definition-id', workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 1 })
  expect(authorize).toHaveBeenCalledWith(expect.anything(), { userId: input.userId, scope: { tenantId: input.tenantId, organizationId: input.organizationId }, requested: AGENCY_ANALYSIS_GRANTED_FEATURES, current: [] })
  const definition = upsertOwnedDefinition.mock.calls[0][1]
  expect(definition).toMatchObject({ ownerModule: 'agency_operations', ownerId: 'analysis', actorUserId: input.userId, grantedFeatures: AGENCY_ANALYSIS_GRANTED_FEATURES })
  expect(definition.definition.transitions[1].activities[0].config.args.policy).toEqual(input.policy)
  expect(configureBriefReview).not.toHaveBeenCalled()
})

it('configures the reusable client review workflow before enabling the brief handoff', async () => {
  await configureAgencyAnalysisProcess(container, { ...input, policy: { ...input.policy, through: '4.2' } })
  expect(configureBriefReview).toHaveBeenCalledWith(container, expect.objectContaining({ tenantId: input.tenantId, organizationId: input.organizationId, userId: input.userId }))
  expect(configureBriefReview.mock.invocationCallOrder[0]).toBeLessThan(upsertOwnedDefinition.mock.invocationCallOrder[0])
})

it('keeps later teammate research phases behind their unintegrated client approval gates', async () => {
  await expect(configureAgencyAnalysisProcess(container, { ...input, policy: { ...input.policy, through: '5.4' } })).rejects.toThrow()
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})

it('pins a separately authorized strategy cap without changing the analysis cap', async () => {
  const policy = { ...input.policy, through: '4.2', strategyExecution: { maxCostPln: 3 } }
  await configureAgencyAnalysisProcess(container, { ...input, policy })
  expect(upsertOwnedDefinition.mock.calls[0][1].definition.transitions[1].activities[0].config.args.policy).toEqual(policy)
  expect(configureStrategyPairReview).toHaveBeenCalledWith(container, expect.objectContaining({ userId: input.userId }))
})

it.each([0, -1])('rejects a nonpositive strategy cap %s', async (maxCostPln) => {
  await expect(configureAgencyAnalysisProcess(container, { ...input, policy: { ...input.policy, through: '4.2', strategyExecution: { maxCostPln } } })).rejects.toThrow()
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})

it('requires the brief handoff before configuring strategy continuation', async () => {
  await expect(configureAgencyAnalysisProcess(container, { ...input, policy: { ...input.policy, strategyExecution: { maxCostPln: 3 } } })).rejects.toThrow()
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})

it('refuses unauthorized grant creation without writing', async () => {
  authorize.mockResolvedValue({ status: 403, body: { error: 'forbidden' } })
  await expect(configureAgencyAnalysisProcess(container, input)).rejects.toThrow()
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})

it('requires native publishing instead of overwriting a running policy', async () => {
  findOwnedDefinition.mockResolvedValue({ id: 'existing-definition' })
  await expect(configureAgencyAnalysisProcess(container, input)).rejects.toThrow('publish a new native workflow version')
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})

it('rejects implicit policy defaults or absent research services', async () => {
  await expect(configureAgencyAnalysisProcess(container, { ...input, policy: { ...input.policy, maxCostPln: undefined } })).rejects.toThrow()
  hasRegistration.mockReturnValue(false)
  await expect(configureAgencyAnalysisProcess(container, input)).rejects.toThrow()
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})
