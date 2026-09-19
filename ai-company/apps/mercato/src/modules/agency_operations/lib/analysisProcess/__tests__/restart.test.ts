/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AgencyCase } from '../../../data/entities'
import { restartAnalysisCase } from '../restart'
import { AGENCY_ANALYSIS_WORKER_ID, AGENCY_ANALYSIS_WORKFLOW_ID } from '../workflow'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const input = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3), caseId: uuid(4) }
const purchase = { orderId: uuid(8), paymentId: uuid(9), receiptAttachmentId: uuid(10) }
let previous: WorkflowInstance, agencyCase: AgencyCase, active: boolean, transactionOpen: boolean
const startWorkflow = jest.fn(), executeWorkflow = jest.fn()
const em = { flush: jest.fn(), transactional: async (fn: (tx: unknown) => Promise<unknown>) => {
  transactionOpen = true
  try { return await fn(em) } finally { transactionOpen = false }
} }
const services = { em, workflowExecutor: { startWorkflow, executeWorkflow }, rbacService: { userHasAllFeatures: async () => true } }
const container = { resolve: (name: keyof typeof services) => services[name] } as unknown as AppContainer
const enabled = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED

beforeEach(() => {
  jest.clearAllMocks(); active = false; transactionOpen = false
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  agencyCase = Object.assign(new AgencyCase(), { id: input.caseId, agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, workflowInstanceId: uuid(5) })
  previous = Object.assign(new WorkflowInstance(), { id: uuid(5), workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
    definitionId: uuid(6), version: 7, status: 'FAILED', context: { purchase, paidPurchaseOrigin: { materialHash: 'original' } } })
  jest.mocked(findWithDecryption).mockResolvedValue([{ workflowInstanceId: uuid(20) }] as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity) => {
    if (entity === AgencyCase) return agencyCase as never
    if (entity === WorkflowInstance) return previous as never
    if (entity === AgentRun) return (active ? { id: uuid(21) } : null) as never
    if (entity === WorkflowDefinition) return { version: 7, enabled: true, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } } } as never
    return null
  })
  startWorkflow.mockResolvedValue({ id: uuid(11) })
  executeWorkflow.mockImplementation(async () => {
    expect(transactionOpen).toBe(false)
    return { status: 'WAITING_FOR_ACTIVITIES', currentStep: 'research' }
  })
})
afterAll(() => { if (enabled === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED; else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = enabled })

test('explicit recovery keeps the original process version and both purchase layouts, dispatching after commit', async () => {
  await expect(restartAnalysisCase(container, input)).resolves.toMatchObject({ previousWorkflowInstanceId: uuid(5), workflowInstanceId: uuid(11) })
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({ version: 7,
    initialContext: expect.objectContaining({ purchase, paidPurchaseOrigin: { materialHash: 'original' },
      restart: expect.objectContaining({ previousWorkflowInstanceId: uuid(5), by: input.userId }) }) }))
  expect(agencyCase.workflowInstanceId).toBe(uuid(11))
})

test('a terminal workflow is not proof that its provider or a parallel client-response worker is dead', async () => {
  active = true
  await expect(restartAnalysisCase(container, input)).rejects.toMatchObject({ status: 409 })
  expect(findOneWithDecryption).toHaveBeenCalledWith(em, AgentRun, expect.objectContaining({
    workflowInstanceId: { $in: [uuid(5), uuid(20)] }, status: 'running',
  }), undefined, expect.anything())
  expect(startWorkflow).not.toHaveBeenCalled(); expect(executeWorkflow).not.toHaveBeenCalled()
  active = false; previous.status = 'RUNNING'
  await expect(restartAnalysisCase(container, input)).rejects.toMatchObject({ status: 409 })
  expect(startWorkflow).not.toHaveBeenCalled()
})
