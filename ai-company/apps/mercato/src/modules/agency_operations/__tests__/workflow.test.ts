import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AgencyCase } from '../data/entities'
import {
  createAgencyCaseWorkflowService,
  deterministicAgentWorker,
} from '../lib/agencyCaseWorkflowService'
import {
  AGENCY_AGENT_FUNCTION_NAME,
  AGENCY_AGENT_RESULT_CONTEXT_KEY,
  AGENCY_AGENT_WORKER_ID,
  AGENCY_CASE_WORKFLOW_ID,
  agencyCaseWorkflow,
} from '../workflows'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222'
const CUSTOMER_ENTITY_ID = '33333333-3333-4333-8333-333333333333'
const CUSTOMER_USER_ID = '44444444-4444-4444-8444-444444444444'
const CASE_ID = '55555555-5555-4555-8555-555555555555'
const WORKFLOW_INSTANCE_ID = '66666666-6666-4666-8666-666666666666'
const MATERIAL_ATTACHMENT_ID = '77777777-7777-4777-8777-777777777777'

function completedExecution() {
  const input = {
    caseId: CASE_ID,
    tenantId: TENANT_ID,
    organizationId: ORGANIZATION_ID,
    customerEntityId: CUSTOMER_ENTITY_ID,
    submittedByCustomerUserId: CUSTOMER_USER_ID,
    title: 'Autumn campaign brief',
    agentWorkerId: AGENCY_AGENT_WORKER_ID,
    materialFileName: 'brief.pdf',
    materialMimeType: 'application/pdf',
    materialFileSize: 2048,
  } as const

  return {
    status: 'COMPLETED',
    currentStep: 'end',
    context: {
      [AGENCY_AGENT_RESULT_CONTEXT_KEY]: {
        executed: true,
        functionName: AGENCY_AGENT_FUNCTION_NAME,
        result: { kind: 'no_op', unchanged: true, input },
      },
    },
  }
}

describe('agency case workflow', () => {
  it('defines the real START -> AUTOMATED -> END workflow with EXECUTE_FUNCTION', () => {
    expect(agencyCaseWorkflow.workflowId).toBe(AGENCY_CASE_WORKFLOW_ID)
    expect(agencyCaseWorkflow.definition.steps.map((step) => step.stepType)).toEqual([
      'START',
      'AUTOMATED',
      'END',
    ])
    expect(agencyCaseWorkflow.definition.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromStepId: 'start', toStepId: 'agent_worker' }),
      expect.objectContaining({
        fromStepId: 'agent_worker',
        toStepId: 'end',
        activities: [expect.objectContaining({
          activityType: 'EXECUTE_FUNCTION',
          config: expect.objectContaining({ functionName: AGENCY_AGENT_FUNCTION_NAME }),
        })],
      }),
    ]))
  })

  it('runs the deterministic worker only inside its workflow scope without changing input or calling fetch', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const input = completedExecution().context.agentWorkerResult.result.input

    expect(deterministicAgentWorker(input, {
      workflowInstance: {
        tenantId: TENANT_ID,
        organizationId: ORGANIZATION_ID,
      },
    })).toEqual({ kind: 'no_op', unchanged: true, input })
    expect(() => deterministicAgentWorker(input, {
      workflowInstance: {
        tenantId: TENANT_ID,
        organizationId: '88888888-8888-4888-8888-888888888888',
      },
    })).toThrow('Agent worker input is outside the workflow scope')
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })

  it('loads a scoped material-backed case, starts and executes the platform workflow, then returns validated output', async () => {
    const agencyCase = {
      id: CASE_ID,
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      customerEntityId: CUSTOMER_ENTITY_ID,
      submittedByCustomerUserId: CUSTOMER_USER_ID,
      title: 'Autumn campaign brief',
      agentWorkerId: AGENCY_AGENT_WORKER_ID,
      materialAttachmentId: MATERIAL_ATTACHMENT_ID,
      materialFileName: 'brief.pdf',
      materialMimeType: 'application/pdf',
      materialFileSize: 2048,
      workflowInstanceId: null as string | null,
      updatedAt: new Date('2026-09-18T10:00:00.000Z'),
      deletedAt: null,
    }
    const em = {
      findOne: jest.fn(async () => agencyCase),
      flush: jest.fn(async () => undefined),
    } as unknown as EntityManager
    const workflowExecutor = {
      startWorkflow: jest.fn(async () => ({ id: WORKFLOW_INSTANCE_ID })),
      executeWorkflow: jest.fn(async () => completedExecution()),
    }
    const container = {
      resolve: jest.fn((key: string) => {
        if (key === 'em') return em
        if (key === 'workflowExecutor') return workflowExecutor
        throw new Error(`Unexpected DI key: ${key}`)
      }),
    } as unknown as AppContainer

    const service = createAgencyCaseWorkflowService(container)
    const result = await service.processCase({
      caseId: CASE_ID,
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      customerEntityId: CUSTOMER_ENTITY_ID,
    })

    expect(em.findOne).toHaveBeenCalledWith(AgencyCase, {
      id: CASE_ID,
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      customerEntityId: CUSTOMER_ENTITY_ID,
      deletedAt: null,
    }, undefined)
    expect(workflowExecutor.startWorkflow).toHaveBeenCalledWith(em, {
      workflowId: AGENCY_CASE_WORKFLOW_ID,
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      correlationKey: `agency-case:${CASE_ID}`,
      metadata: {
        entityType: 'agency_operations:agency_case',
        entityId: CASE_ID,
        labels: { agentWorkerId: AGENCY_AGENT_WORKER_ID },
      },
      initialContext: {
        caseId: CASE_ID,
        tenantId: TENANT_ID,
        organizationId: ORGANIZATION_ID,
        customerEntityId: CUSTOMER_ENTITY_ID,
        submittedByCustomerUserId: CUSTOMER_USER_ID,
        title: 'Autumn campaign brief',
        agentWorkerId: AGENCY_AGENT_WORKER_ID,
        materialFileName: 'brief.pdf',
        materialMimeType: 'application/pdf',
        materialFileSize: 2048,
      },
    })
    expect(agencyCase.workflowInstanceId).toBe(WORKFLOW_INSTANCE_ID)
    expect(em.flush).toHaveBeenCalledTimes(1)
    expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(
      em,
      container,
      WORKFLOW_INSTANCE_ID,
    )
    expect(result).toEqual({
      caseId: CASE_ID,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      status: 'COMPLETED',
      currentStep: 'end',
      agentOutput: completedExecution().context.agentWorkerResult.result,
    })
  })
})
