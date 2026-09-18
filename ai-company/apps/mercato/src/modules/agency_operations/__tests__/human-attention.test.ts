import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { LockMode } from '@mikro-orm/core'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { workflowDefinitionDataSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { AgencyCase } from '../data/entities'
import { createAgencyHumanAttentionService } from '../lib/humanAttentionService'
import { createAgencyHumanAttentionWorkflow, AGENCY_HUMAN_ATTENTION_WORKFLOW_ID } from '../lib/humanAttentionWorkflow'
import { AGENCY_AGENT_FUNCTION_NAME, AGENCY_AGENT_WORKER_ID } from '../workflows'

const ids = {
  tenantId: '11111111-1111-4111-8111-111111111111', organizationId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333', caseId: '44444444-4444-4444-8444-444444444444',
  workflowId: '55555555-5555-4555-8555-555555555555', sourceWorkflowId: '66666666-6666-4666-8666-666666666666',
  customerId: '77777777-7777-4777-8777-777777777777',
}
const request = { tenantId: ids.tenantId, organizationId: ids.organizationId, userId: ids.userId, caseId: ids.caseId, reason: 'Client requested employee attention', evidence: 'See the attached brief' }

function fixture() {
  const agencyCase = { id: ids.caseId, title: 'Client request', customerEntityId: ids.customerId, submittedByCustomerUserId: ids.userId, workflowInstanceId: ids.sourceWorkflowId, materialFileName: 'brief.pdf', materialMimeType: 'application/pdf', materialFileSize: 200 }
  const findOne = jest.fn().mockResolvedValueOnce(agencyCase).mockResolvedValueOnce(null)
  const tx = { findOne }
  const em = { transactional: jest.fn(async (callback) => callback(tx)) }
  const userHasAllFeatures = jest.fn(async () => true)
  const startWorkflow = jest.fn(async () => ({ id: ids.workflowId }))
  const executeWorkflow = jest.fn(async () => ({ status: 'RUNNING', currentStep: 'human_attention' }))
  const services: Record<string, unknown> = { em, rbacService: { userHasAllFeatures }, workflowExecutor: { startWorkflow, executeWorkflow } }
  const container = { resolve: jest.fn((key: string) => services[key]) } as unknown as AppContainer
  return { agencyCase, findOne, tx, em, userHasAllFeatures, startWorkflow, executeWorkflow, container }
}

describe('native agency human attention', () => {
  it('defines a native role-queue task with customer binding and real decision transitions', () => {
    const workflow = createAgencyHumanAttentionWorkflow({ functionName: AGENCY_AGENT_FUNCTION_NAME, workerId: AGENCY_AGENT_WORKER_ID })
    expect(workflowDefinitionDataSchema.safeParse(workflow.definition).success).toBe(true)
    const attention = workflow.definition.steps.find((step) => step.stepId === 'human_attention')
    expect(attention).toMatchObject({ stepType: 'USER_TASK', userTaskConfig: {
      assignedToRoles: ['employee'], priority: 'high',
      entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: '{{context.customerEntityId}}' }],
      decisions: [expect.objectContaining({ id: 'complete', transitionId: 'human_complete' }), expect.objectContaining({ id: 'return_to_agent', transitionId: 'human_return_to_agent' })],
    } })
    expect(workflow.definition.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ transitionId: 'human_complete', toStepId: 'end', trigger: 'manual' }),
      expect.objectContaining({ transitionId: 'human_return_to_agent', toStepId: 'agent_handoff', trigger: 'manual' }),
      expect.objectContaining({ transitionId: 'agent_handoff_end', activities: [expect.objectContaining({ activityType: 'EXECUTE_FUNCTION' })] }),
    ]))
  })

  it('starts attention under staff authorization with scoped context without replacing the original case run', async () => {
    const test = fixture()
    await expect(createAgencyHumanAttentionService(test.container).escalate(request)).resolves.toEqual({ caseId: ids.caseId, workflowInstanceId: ids.workflowId, deduplicated: false })
    expect(test.findOne).toHaveBeenNthCalledWith(1, AgencyCase, { id: ids.caseId, tenantId: ids.tenantId, organizationId: ids.organizationId, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE })
    expect(test.startWorkflow).toHaveBeenCalledWith(test.tx, expect.objectContaining({ workflowId: AGENCY_HUMAN_ATTENTION_WORKFLOW_ID, initialContext: expect.objectContaining({ sourceWorkflowInstanceId: ids.sourceWorkflowId, customerEntityId: ids.customerId, reason: request.reason, evidence: request.evidence }) }))
    expect(test.executeWorkflow).toHaveBeenCalledWith(test.em, test.container, ids.workflowId, { userId: ids.userId })
    expect(test.agencyCase.workflowInstanceId).toBe(ids.sourceWorkflowId)
  })

  it('reuses one open native attention workflow under the case lock', async () => {
    const test = fixture()
    test.findOne.mockReset().mockResolvedValueOnce(test.agencyCase).mockResolvedValueOnce({ id: ids.workflowId })
    await expect(createAgencyHumanAttentionService(test.container).escalate(request)).resolves.toMatchObject({ deduplicated: true, workflowInstanceId: ids.workflowId })
    expect(test.startWorkflow).not.toHaveBeenCalled()
    expect(test.findOne).toHaveBeenNthCalledWith(2, WorkflowInstance, expect.objectContaining({ correlationKey: `agency-attention:${ids.caseId}`, tenantId: ids.tenantId, organizationId: ids.organizationId }), undefined)
  })

  it('fails closed on staff permission or case scope before starting a workflow', async () => {
    const test = fixture()
    test.userHasAllFeatures.mockResolvedValueOnce(false)
    await expect(createAgencyHumanAttentionService(test.container).escalate(request)).rejects.toThrow()
    expect(test.em.transactional).not.toHaveBeenCalled()
    test.findOne.mockReset().mockResolvedValue(null)
    await expect(createAgencyHumanAttentionService(test.container).escalate(request)).rejects.toThrow()
    expect(test.startWorkflow).not.toHaveBeenCalled()
    expect(test.executeWorkflow).not.toHaveBeenCalled()
  })
})
