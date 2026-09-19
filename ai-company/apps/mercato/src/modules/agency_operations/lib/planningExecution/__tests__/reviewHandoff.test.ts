/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createPlanReviewHandoff } from '../reviewHandoff'
import { PLANNING_EXECUTION_RESULT_KEY, planningReviewHandoffResultSchema } from '../contracts'

const findOne = jest.fn()
const invite = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: (...args: unknown[]) => findOne(...args) }))
const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const scope = { tenantId: id(1), organizationId: id(2) }
const caseId = id(3)
const completed = { status: 'completed', orderRef: caseId, strategyVersionId: id(4), tovVersionId: id(5),
  taskRunIds: [id(6)], documentVersionIds: [id(7)], agentRunIds: [], spentPln: 0.2,
  planVersionId: id(7), qaTaskRunId: id(8), qaVerdict: 'ready_for_approval', readyForApproval: true }
const context = (change: Record<string, unknown> = {}) => ({ userId: id(9), workflowInstance: {
  id: id(10), workflowId: 'agency_operations.client-submission.native.v1', ...scope,
  context: { [PLANNING_EXECUTION_RESULT_KEY]: { result: { ...completed, ...change } } },
} })
const container = { resolve: (key: string) => key === 'em' ? {} : { invite } } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  findOne.mockResolvedValue({ caseId })
  invite.mockResolvedValue({ workflowInstanceId: id(11), taskId: id(12), replayed: false })
})

it('returns invited only after the real exact-version plan invitation succeeds', async () => {
  const handoff = await createPlanReviewHandoff(container)({}, context())
  expect(handoff).toMatchObject({ status: 'invited', orderRef: caseId, invitation: { taskId: id(12) } })
  expect(planningReviewHandoffResultSchema.safeParse(handoff).success).toBe(true)
  expect(invite).toHaveBeenCalledWith({ ...scope, userId: id(9), caseId, planVersionId: id(7) })
})

it.each([
  { change: { status: 'not_configured', reason: 'execution_disabled' }, nextAction: 'review_configuration' },
  { change: { status: 'not_ready', reason: 'pair_acceptance_incomplete', templateId: 'WZR-STRATEGIA' }, nextAction: 'review_dependencies' },
  { change: { status: 'execution_incomplete', reason: 'in_progress_or_interrupted', activationTaskRunId: id(13) }, nextAction: 'reconcile_execution' },
])('preserves a blocked planning reason and inspection action: $nextAction', async ({ change, nextAction }) => {
  const handoff = await createPlanReviewHandoff(container)({}, context(change))
  expect(handoff).toMatchObject({ status: 'blocked', orderRef: caseId, invitation: null, reason: change.reason, nextAction,
    ...('activationTaskRunId' in change ? { activationTaskRunId: change.activationTaskRunId } : {}),
    ...('templateId' in change ? { templateId: change.templateId } : {}),
  })
  expect(planningReviewHandoffResultSchema.safeParse(handoff).success).toBe(true)
  expect(invite).not.toHaveBeenCalled()
})

it('does not invite a plan whose QA still requires repair', async () => {
  await expect(createPlanReviewHandoff(container)({}, context({ readyForApproval: false, qaVerdict: 'needs_agent_fix' })))
    .resolves.toMatchObject({ status: 'blocked', reason: 'plan_not_ready', nextAction: 'review_qa' })
  expect(invite).not.toHaveBeenCalled()
})

it('does not disguise invitation infrastructure faults as a normal hold', async () => {
  invite.mockRejectedValue(new Error('Invitation store unavailable'))
  await expect(createPlanReviewHandoff(container)({}, context())).rejects.toThrow('Invitation store unavailable')
})
