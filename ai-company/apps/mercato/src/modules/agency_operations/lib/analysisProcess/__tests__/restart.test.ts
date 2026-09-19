import { restartAnalysisCase } from '../restart'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../configure', () => ({ assertAnalysisProcessConfigured: jest.fn(async () => ({ version: 3 })) }))

const { findOneWithDecryption } = jest.requireMock('@open-mercato/shared/lib/encryption/find') as { findOneWithDecryption: jest.Mock }

const ids = { tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002', userId: '00000000-0000-4000-8000-000000000003', caseId: '00000000-0000-4000-8000-000000000004' }
const agencyCase = { id: ids.caseId, agentWorkerId: 'agency_operations.agent-worker.analysis.v1', workflowInstanceId: 'wf-1', customerEntityId: 'c', submittedByCustomerUserId: 'u', title: 'FLOW', materialFileName: null, materialMimeType: null, materialFileSize: null, updatedAt: new Date(0) }

function harness(instance: { status: string; currentStepId: string | null }) {
  const previous = { id: 'wf-1', status: instance.status, currentStepId: instance.currentStepId, correlationKey: 'agency-case:x' }
  const tasks = [{ id: 't-1', status: 'PENDING', updatedAt: new Date(0) }]
  const em = { find: jest.fn(async () => tasks), flush: jest.fn(async () => undefined), refresh: jest.fn(async (entity: { status: string }) => { entity.status = 'CANCELLED' }) }
  const executor = {
    updateWorkflowContext: jest.fn(async () => undefined),
    completeWorkflow: jest.fn(async () => undefined),
    startWorkflow: jest.fn(async () => ({ id: 'wf-2' })),
    executeWorkflow: jest.fn(async () => ({ status: 'WAITING_FOR_ACTIVITIES', currentStep: 'research' })),
  }
  const container = { resolve: (key: string) => ({ em, workflowExecutor: executor, rbacService: { userHasAllFeatures: async () => true } })[key] }
  findOneWithDecryption.mockReset()
  findOneWithDecryption.mockResolvedValueOnce({ ...agencyCase }).mockResolvedValueOnce(previous)
  return { em, executor, tasks, container }
}

describe('restartAnalysisCase on a paused instance', () => {
  it('paused on an exception task: writes the resume override into the live instance, nothing is cancelled', async () => {
    const { executor, container } = harness({ status: 'PAUSED', currentStepId: 'research_exception' })
    const result = await restartAnalysisCase(container as never, { ...ids, resumeFrom: '4.2' })
    expect(result).toMatchObject({ workflowInstanceId: 'wf-1', status: 'PAUSED', currentStep: 'research_exception' })
    expect(executor.updateWorkflowContext).toHaveBeenCalledWith(expect.anything(), 'wf-1', expect.objectContaining({ restart: expect.objectContaining({ resumeFrom: '4.2' }) }))
    expect(executor.completeWorkflow).not.toHaveBeenCalled()
    expect(executor.startWorkflow).not.toHaveBeenCalled()
  })

  it('paused on a client review: cancels the review task and the instance, starts a fresh one from the step', async () => {
    const { executor, tasks, container } = harness({ status: 'PAUSED', currentStepId: 'waiting' })
    const result = await restartAnalysisCase(container as never, { ...ids, resumeFrom: '4.2' })
    expect(executor.completeWorkflow).toHaveBeenCalledWith(expect.anything(), container, 'wf-1', 'CANCELLED')
    expect(tasks[0].status).toBe('CANCELLED')
    expect(executor.startWorkflow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ correlationKey: `agency-case:${ids.caseId}:restart-1`, initialContext: expect.objectContaining({ restart: expect.objectContaining({ previousWorkflowInstanceId: 'wf-1', resumeFrom: '4.2' }) }) }))
    expect(result).toMatchObject({ previousWorkflowInstanceId: 'wf-1', workflowInstanceId: 'wf-2', currentStep: 'research' })
  })

  it('paused on a client review without a step: refused, nothing runs twice', async () => {
    const { executor, container } = harness({ status: 'PAUSED', currentStepId: 'waiting' })
    await expect(restartAnalysisCase(container as never, ids)).rejects.toMatchObject({ status: 409 })
    expect(executor.completeWorkflow).not.toHaveBeenCalled()
  })
})
