/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createStrategyReviewHandoff } from '../reviewHandoff'
import { STRATEGY_EXECUTION_RESULT_KEY } from '../contracts'

const findOne = jest.fn()
const invite = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: (...args: unknown[]) => findOne(...args) }))
const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const scope = { tenantId: id(1), organizationId: id(2) }
const caseId = id(3)
const result = { status: 'completed', orderRef: caseId, taskRunIds: [id(4)], documentVersionIds: [id(5), id(6)],
  agentRunIds: [], spentPln: 0.2, strategyVersionId: id(5), tovVersionId: id(6), qaTaskRunId: id(7), qaVerdict: 'ready_for_approval' }
const context = (change: Record<string, unknown> = {}) => ({ userId: id(8), workflowInstance: {
  id: id(9), workflowId: 'agency_operations.client-submission.native.v1', ...scope,
  context: { [STRATEGY_EXECUTION_RESULT_KEY]: { result: { ...result, ...change } } },
} })
const container = { resolve: (key: string) => key === 'em' ? {} : { invite } } as unknown as AppContainer

beforeEach(() => { jest.clearAllMocks(); findOne.mockResolvedValue({ caseId }); invite.mockResolvedValue({ taskId: id(10), replayed: false }) })

it('invites exactly the saved passing pair for the originating submission case', async () => {
  await expect(createStrategyReviewHandoff(container)({}, context())).resolves.toMatchObject({ invitation: { taskId: id(10) } })
  expect(findOne).toHaveBeenCalledWith(expect.anything(), expect.anything(), { ...scope, workflowInstanceId: id(9), caseId, deletedAt: null }, undefined, scope)
  expect(invite).toHaveBeenCalledWith({ ...scope, userId: id(8), caseId, strategyVersionId: id(5), tovVersionId: id(6) })
})

it.each([{ status: 'paused_budget' }, { qaVerdict: 'needs_agent_fix' }, { tovVersionId: null }, { escalationVersionId: id(11) }])('does not invite incomplete or failed QA: %p', async (change) => {
  await expect(createStrategyReviewHandoff(container)({}, context(change))).resolves.toMatchObject({ invitation: null })
  expect(invite).not.toHaveBeenCalled()
})

it('rejects a saved result outside the original case submission', async () => {
  findOne.mockResolvedValue(null)
  await expect(createStrategyReviewHandoff(container)({}, context())).rejects.toThrow('outside the originating case submission')
  expect(invite).not.toHaveBeenCalled()
})
