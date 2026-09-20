/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AgencyCase } from '../../../data/entities'
import { restartAnalysisCase } from '../restart'
import { AGENCY_ANALYSIS_WORKER_ID, AGENCY_ANALYSIS_WORKFLOW_ID, createAgencyAnalysisWorkflowDefinition } from '../workflow'
import { BRIEF_REVIEW_CONTEXT_KEY, BRIEF_REVIEW_STEP_ID, BRIEF_REVIEW_WORKFLOW_ID } from '../../briefStrategyProcess/contracts'
import { SOURCE_CORRECTION_KEY, SOURCE_RESPONSE_STEP } from '../../sourceClarification/contracts'
import { readCompletedSourceCorrection } from '../../sourceClarification/recovery'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../sourceClarification/recovery', () => ({ readCompletedSourceCorrection: jest.fn() }))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const input = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3), caseId: uuid(4) }
const purchase = { orderId: uuid(8), paymentId: uuid(9), receiptAttachmentId: uuid(10) }
const policy = { through: '3.8' as const, maxCostPln: 2,
  productSelection: { sku: 'configured', offer_version: 'v1', price_net: 100, currency: 'PLN', result_limits: { topics: 7 } } }
let previous: WorkflowInstance, agencyCase: AgencyCase, active: boolean, transactionOpen: boolean
let review: WorkflowInstance | null
let tasks: Array<{ id: string; status: string; updatedAt: Date }>
const startWorkflow = jest.fn(), executeWorkflow = jest.fn(), updateWorkflowContext = jest.fn(), completeWorkflow = jest.fn()
const getBriefReview = jest.fn()
const em = {
  flush: jest.fn(),
  find: jest.fn(async (entity: unknown, where: { id?: string; status?: string }) => entity === UserTask
    ? tasks.filter((task) => (!where.id || task.id === where.id) && (!where.status || task.status === where.status)) : []),
  transactional: async (fn: (tx: unknown) => Promise<unknown>) => {
    transactionOpen = true
    try { return await fn(em) } finally { transactionOpen = false }
  },
}
const services = { em, workflowExecutor: { startWorkflow, executeWorkflow, updateWorkflowContext, completeWorkflow },
  agencyResearchService: { getBriefReview },
  rbacService: { userHasAllFeatures: async () => true } }
const container = { resolve: (name: keyof typeof services) => services[name] } as unknown as AppContainer
const enabled = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED

beforeEach(() => {
  jest.clearAllMocks(); active = false; transactionOpen = false
  review = null
  getBriefReview.mockResolvedValue({ orderRef: input.caseId, documentId: uuid(42), versionId: uuid(43), isCurrent: true,
    documentStatus: 'draft', versionStatus: 'draft', clientViewMd: '# Brief', qa: { state: 'assessed', status: 'done', verdict: 'needs_client_data' } })
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  tasks = [{ id: uuid(30), status: 'PENDING', updatedAt: new Date(0) }]
  agencyCase = Object.assign(new AgencyCase(), { id: input.caseId, customerEntityId: uuid(31), submittedByCustomerUserId: uuid(32),
    agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, workflowInstanceId: uuid(5) })
  previous = Object.assign(new WorkflowInstance(), { id: uuid(5), workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
    definitionId: uuid(6), version: 7, status: 'FAILED', currentStepId: 'research', correlationKey: 'agency-case:x',
    context: { purchase, paidPurchaseOrigin: { materialHash: 'original' } } })
  jest.mocked(findWithDecryption).mockResolvedValue([{ workflowInstanceId: uuid(20) }] as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, filter) => {
    if (entity === AgencyCase) return agencyCase as never
    if (entity === WorkflowInstance) return ((filter as { workflowId: string }).workflowId === BRIEF_REVIEW_WORKFLOW_ID ? review : previous) as never
    if (entity === AgentRun) return (active ? { id: uuid(21) } : null) as never
    if (entity === WorkflowDefinition) return { version: 7, enabled: true, definition: createAgencyAnalysisWorkflowDefinition(policy),
      metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } } } as never
    return null
  })
  startWorkflow.mockResolvedValue({ id: uuid(11) })
  completeWorkflow.mockImplementation(async (_em, _container, id) => {
    if (id === previous.id) previous.status = 'CANCELLED'
    if (review && id === review.id) review.status = 'CANCELLED'
  })
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

test('source correction resumes collection through existing restart authority and preserves its receipt', async () => {
  previous.status = 'COMPLETED'; previous.currentStepId = SOURCE_RESPONSE_STEP
  const correction = { workflowInstanceId: previous.id, taskId: uuid(70), submissionId: uuid(71), websiteUrl: 'https://correct.test' }
  jest.mocked(readCompletedSourceCorrection).mockResolvedValue(correction)
  await restartAnalysisCase(container, { ...input, expectedWorkflowInstanceId: previous.id })
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({ initialContext: expect.objectContaining({
    [SOURCE_CORRECTION_KEY]: correction, purchase,
    restart: expect.objectContaining({ resumeFrom: '3.2' }),
  }) }))
})

test('a stale restart button, unverified answer or skipped collection cannot authorize source recovery', async () => {
  await expect(restartAnalysisCase(container, { ...input, expectedWorkflowInstanceId: uuid(99) })).rejects.toMatchObject({ status: 409 })
  previous.status = 'COMPLETED'; previous.currentStepId = SOURCE_RESPONSE_STEP
  jest.mocked(readCompletedSourceCorrection).mockResolvedValue(null)
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '3.2' })).rejects.toMatchObject({ status: 409 })
  jest.mocked(readCompletedSourceCorrection).mockResolvedValue({ workflowInstanceId: previous.id, taskId: uuid(70), submissionId: uuid(71), websiteUrl: 'https://correct.test' })
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '3.8' })).rejects.toMatchObject({ status: 409 })
  expect(startWorkflow).not.toHaveBeenCalled()
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

test('explicit --from stays within the original intake policy and a paused workflow needs an explicit step', async () => {
  await restartAnalysisCase(container, { ...input, resumeFrom: '3.5' })
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({ initialContext: expect.objectContaining({
    restart: expect.objectContaining({ resumeFrom: '3.5', attempt: 1, previousWorkflowInstanceId: uuid(5) }),
  }) }))
  startWorkflow.mockClear()
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '4.2' })).rejects.toMatchObject({ status: 409 })
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '7.3' })).rejects.toThrow()
  previous.status = 'PAUSED'; previous.currentStepId = 'waiting'
  await expect(restartAnalysisCase(container, input)).rejects.toMatchObject({ status: 409 })
  expect(startWorkflow).not.toHaveBeenCalled()
})
test('paused on an employee exception writes the bounded override into the live instance without cancelling it', async () => {
  previous.status = 'PAUSED'; previous.currentStepId = 'research_exception'
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '3.2' })).resolves.toMatchObject({
    workflowInstanceId: uuid(5), previousWorkflowInstanceId: null, status: 'PAUSED', currentStep: 'research_exception',
  })
  expect(updateWorkflowContext).toHaveBeenCalledWith(em, uuid(5), expect.objectContaining({ restart: expect.objectContaining({ resumeFrom: '3.2' }) }))
  expect(completeWorkflow).not.toHaveBeenCalled(); expect(startWorkflow).not.toHaveBeenCalled(); expect(executeWorkflow).not.toHaveBeenCalled()
})

test('paused on a client review cancels only its scoped pending task and rebuilds from the requested step', async () => {
  previous.status = 'PAUSED'; previous.currentStepId = 'waiting'
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '3.2' })).resolves.toMatchObject({
    previousWorkflowInstanceId: uuid(5), workflowInstanceId: uuid(11), currentStep: 'research',
  })
  expect(em.find).toHaveBeenCalledWith(UserTask, expect.objectContaining({ tenantId: input.tenantId,
    organizationId: input.organizationId, workflowInstanceId: uuid(5), status: 'PENDING' }), expect.anything())
  expect(completeWorkflow).toHaveBeenCalledWith(em, container, uuid(5), 'CANCELLED')
  expect(tasks[0].status).toBe('CANCELLED')
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({ version: 7,
    initialContext: expect.objectContaining({ restart: expect.objectContaining({ previousWorkflowInstanceId: uuid(5), resumeFrom: '3.2' }) }) }))
})

test('paused review recovery refuses to discard a workflow without an open pending task', async () => {
  previous.status = 'PAUSED'; previous.currentStepId = 'waiting'; tasks = []
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '3.2' })).rejects.toMatchObject({ status: 409 })
  expect(completeWorkflow).not.toHaveBeenCalled(); expect(startWorkflow).not.toHaveBeenCalled()
})

function savedBriefReview() {
  previous.status = 'PAUSED'; previous.currentStepId = 'waiting'
  previous.context.agencyBriefInvitation = { result: { invitation: { workflowInstanceId: uuid(40), taskId: uuid(30), replayed: false } } }
  review = Object.assign(new WorkflowInstance(), { id: uuid(40), workflowId: BRIEF_REVIEW_WORKFLOW_ID,
    status: 'PAUSED', currentStepId: BRIEF_REVIEW_STEP_ID,
    context: { [BRIEF_REVIEW_CONTEXT_KEY]: { caseId: input.caseId, customerEntityId: uuid(31), customerUserId: uuid(32),
      review: { documentId: uuid(42), versionId: uuid(43) } } } })
}

test('saved brief handoff supersedes its separate review, preserving the pinned analysis restart', async () => {
  savedBriefReview()
  await restartAnalysisCase(container, { ...input, resumeFrom: '3.2' })
  expect(findOneWithDecryption).toHaveBeenCalledWith(em, WorkflowInstance, expect.objectContaining({
    id: uuid(40), workflowId: BRIEF_REVIEW_WORKFLOW_ID, tenantId: input.tenantId, organizationId: input.organizationId,
    status: 'PAUSED', currentStepId: BRIEF_REVIEW_STEP_ID,
  }), undefined, expect.anything())
  expect(em.find).toHaveBeenCalledWith(UserTask, expect.objectContaining({ id: uuid(30), workflowInstanceId: uuid(40),
    tenantId: input.tenantId, organizationId: input.organizationId, status: 'PENDING', assigneeKind: 'customer', assignedTo: uuid(32),
  }), expect.anything())
  expect(completeWorkflow).toHaveBeenCalledWith(em, container, uuid(40), 'CANCELLED')
  expect(completeWorkflow).toHaveBeenCalledWith(em, container, uuid(5), 'CANCELLED')
  expect(tasks[0].status).toBe('CANCELLED')
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({ version: 7,
    initialContext: expect.objectContaining({ restart: expect.objectContaining({ previousWorkflowInstanceId: uuid(5), resumeFrom: '3.2' }) }) }))
})

test('an answered saved review is not superseded or mistaken for another pending task', async () => {
  savedBriefReview()
  tasks[0].status = 'COMPLETED'
  tasks.push({ id: uuid(41), status: 'PENDING', updatedAt: new Date(0) })
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '3.2' })).rejects.toMatchObject({ status: 409 })
  expect(completeWorkflow).not.toHaveBeenCalled(); expect(startWorkflow).not.toHaveBeenCalled()
})

test('a saved invitation belonging to another case cannot be cancelled', async () => {
  savedBriefReview()
  Object.assign(review!.context[BRIEF_REVIEW_CONTEXT_KEY] as object, { caseId: uuid(99) })
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '3.2' })).rejects.toMatchObject({ status: 409 })
  expect(completeWorkflow).not.toHaveBeenCalled(); expect(startWorkflow).not.toHaveBeenCalled()
})

test.each([{ isCurrent: false }, { versionStatus: 'approved' }])('a stale or accepted brief cannot be superseded: %j', async (state) => {
  savedBriefReview()
  getBriefReview.mockResolvedValue({ documentId: uuid(42), versionId: uuid(43), isCurrent: true,
    documentStatus: 'draft', versionStatus: 'draft', clientViewMd: '# Brief', qa: { state: 'assessed', status: 'done', verdict: 'needs_client_data' }, ...state })
  await expect(restartAnalysisCase(container, { ...input, resumeFrom: '3.2' })).rejects.toMatchObject({ status: 409 })
  expect(completeWorkflow).not.toHaveBeenCalled(); expect(startWorkflow).not.toHaveBeenCalled()
})
