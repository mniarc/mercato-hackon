import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { configureAgencyTovProcess, agencyTovWorkflowDefinition, AGENCY_TOV_GRANTED_FEATURES } from '../lib/configureTovProcess'
import { assertTovProcessConfigured, createTovWorkflowActivity, parseTovMaterial, AGENCY_TOV_RESULT_CONTEXT_KEY } from '../lib/tovProcess'
import { AGENCY_TOV_WORKER_ID, AGENCY_TOV_WORKFLOW_ID } from '../lib/tovProcess'
import { createAgencyCaseWorkflowService } from '../lib/agencyCaseWorkflowService'

const ids = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
  workflowId: '44444444-4444-4444-8444-444444444444',
  caseId: '55555555-5555-4555-8555-555555555555',
  stepId: '66666666-6666-4666-8666-666666666666',
  attachmentId: '77777777-7777-4777-8777-777777777777',
}
const processRequest = { kind: 'tone_of_voice', brand: 'Demo agency', outputLanguage: 'en' } as const
const post = {
  id: 'post-1', source: 'linkedin', profileUrl: 'https://example.com/profile', authorName: 'Demo',
  url: 'https://example.com/post', postedAt: '2026-09-18', text: 'A sample of our voice.',
  likes: 0, comments: 0, shares: 0, media: 'none',
}

function fixture() {
  const result = { researchRunId: ids.caseId, documentVersionIds: [ids.attachmentId], agentRunIds: [ids.stepId] }
  const run = jest.fn(async () => result)
  const readScoped = jest.fn(async () => ({ buffer: Buffer.from(JSON.stringify([post])) }))
  const findOne = jest.fn(async (entity: unknown) => entity === StepInstance
    ? { id: ids.stepId, stepId: 'tov_research' } : { id: ids.caseId, materialAttachmentId: ids.attachmentId })
  const services: Record<string, unknown> = { em: { findOne }, attachmentService: { readScoped }, agencyTovResearchService: { run } }
  const container = { resolve: jest.fn((key: string) => services[key]), hasRegistration: jest.fn((key: string) => key in services) } as unknown as AppContainer
  const context = {
    userId: ids.userId, stepInstanceId: ids.stepId,
    workflowInstance: { id: ids.workflowId, tenantId: ids.tenantId, organizationId: ids.organizationId,
      currentStepId: 'tov_research', status: 'WAITING_FOR_ACTIVITIES', context: {} },
  }
  return { result, run, readScoped, findOne, services, container, context }
}

describe('agency ToV native process boundary', () => {
  const previousEnabled = process.env.AGENCY_TOV_EXECUTION_ENABLED
  beforeEach(() => { process.env.AGENCY_TOV_EXECUTION_ENABLED = 'true' })
  afterAll(() => {
    if (previousEnabled === undefined) delete process.env.AGENCY_TOV_EXECUTION_ENABLED
    else process.env.AGENCY_TOV_EXECUTION_ENABLED = previousEnabled
  })

  it('rejects the disabled capability and arbitrary/non-normalized material', async () => {
    const { container } = fixture()
    process.env.AGENCY_TOV_EXECUTION_ENABLED = 'false'
    await expect(assertTovProcessConfigured(container, ids)).rejects.toThrow()
    expect(container.resolve).not.toHaveBeenCalled()
    await expect(parseTovMaterial(Buffer.from('pdf bytes'))).rejects.toThrow()
    await expect(parseTovMaterial(Buffer.from('[{"text":"not a normalized post"}]'))).rejects.toThrow()
    await expect(parseTovMaterial(Buffer.from(JSON.stringify([post])))).resolves.toEqual([post])
  })

  it('uses the workflow principal, scoped stored attachment and exact invocation/result references', async () => {
    const test = fixture()
    await expect(createTovWorkflowActivity(test.container)({ caseId: ids.caseId, process: processRequest }, test.context)).resolves.toEqual(test.result)
    expect(test.findOne).toHaveBeenCalledWith(expect.anything(), {
      id: ids.caseId, tenantId: ids.tenantId, organizationId: ids.organizationId,
      workflowInstanceId: ids.workflowId, deletedAt: null,
    }, undefined)
    expect(test.readScoped).toHaveBeenCalledWith(expect.objectContaining({
      auth: { sub: ids.userId, tenantId: ids.tenantId, orgId: ids.organizationId },
      attachmentId: ids.attachmentId, requirePrivatePartition: true,
    }))
    expect(test.run).toHaveBeenCalledWith({
      context: { tenantId: ids.tenantId, organizationId: ids.organizationId, userId: ids.userId, workflowInstanceId: ids.workflowId, stepId: 'tov_research', invocationId: ids.stepId },
      brand: processRequest.brand, outputLanguage: 'en', posts: [post],
    })
  })

  it('does not call paid research without a scoped case/principal or for a terminal workflow; replays stored results', async () => {
    const test = fixture()
    const activity = createTovWorkflowActivity(test.container)
    const input = { caseId: ids.caseId, process: processRequest }
    await expect(activity(input, { ...test.context, userId: undefined })).rejects.toThrow()
    await expect(activity(input, { ...test.context, workflowInstance: { ...test.context.workflowInstance, status: 'FAILED' } })).rejects.toThrow()
    await expect(activity(input, { ...test.context, workflowInstance: { ...test.context.workflowInstance, status: 'COMPLETED', context: { [AGENCY_TOV_RESULT_CONTEXT_KEY]: { result: test.result } } } })).resolves.toEqual(test.result)
    test.findOne.mockResolvedValueOnce(null as never)
    await expect(activity(input, test.context)).rejects.toThrow('outside the workflow scope')
    expect(test.run).not.toHaveBeenCalled()
  })

  it('configures an async native workflow only after the explicit staff grant authorization', async () => {
    const test = fixture()
    const userHasAllFeatures = jest.fn(async () => false)
    const upsertOwnedDefinition = jest.fn(async () => ({ ok: true, created: true, definition: { id: ids.workflowId, workflowId: 'agency_operations.tov-research.v1' } }))
    test.services.rbacService = { userHasAllFeatures }
    test.services.workflowDefinitionAuthoring = { upsertOwnedDefinition }
    await expect(configureAgencyTovProcess(test.container, ids)).rejects.toThrow()
    expect(upsertOwnedDefinition).not.toHaveBeenCalled()
    userHasAllFeatures.mockResolvedValue(true)
    await configureAgencyTovProcess(test.container, ids)
    expect(upsertOwnedDefinition).toHaveBeenCalledWith(test.services.em, expect.objectContaining({
      ownerModule: 'agency_operations', actorUserId: ids.userId, grantedFeatures: AGENCY_TOV_GRANTED_FEATURES,
      definition: agencyTovWorkflowDefinition,
    }))
    expect(agencyTovWorkflowDefinition.transitions[1].activities?.[0]).toMatchObject({ async: true, retryPolicy: { maxAttempts: 1 } })
  })

  it('returns the parked native workflow without running research inside the intake request', async () => {
    const test = fixture()
    const agencyCase = {
      id: ids.caseId, tenantId: ids.tenantId, organizationId: ids.organizationId,
      customerEntityId: ids.attachmentId, submittedByCustomerUserId: ids.caseId,
      title: 'Research request', agentWorkerId: AGENCY_TOV_WORKER_ID,
      materialFileName: 'corpus.json', materialMimeType: 'application/json', materialFileSize: 100,
      workflowInstanceId: null,
    }
    test.services.em = { findOne: jest.fn(async () => agencyCase), flush: jest.fn(async () => undefined) }
    test.services.workflowDefinitionAuthoring = { findOwnedDefinition: jest.fn(async () => ({ enabled: true, metadata: { generatedBy: { module: 'agency_operations' } }, grantedFeatures: AGENCY_TOV_GRANTED_FEATURES })) }
    const startWorkflow = jest.fn(async () => ({ id: ids.workflowId }))
    test.services.workflowExecutor = { startWorkflow, executeWorkflow: jest.fn(async () => ({ status: 'WAITING_FOR_ACTIVITIES', currentStep: 'tov_research' })) }
    await expect(createAgencyCaseWorkflowService(test.container).processCase({
      caseId: ids.caseId, tenantId: ids.tenantId, organizationId: ids.organizationId,
      customerEntityId: ids.attachmentId, process: processRequest,
    })).resolves.toEqual({ caseId: ids.caseId, workflowInstanceId: ids.workflowId, status: 'WAITING_FOR_ACTIVITIES', currentStep: 'tov_research' })
    expect(startWorkflow).toHaveBeenCalledWith(test.services.em, expect.objectContaining({ workflowId: AGENCY_TOV_WORKFLOW_ID, initialContext: expect.objectContaining({ process: processRequest }) }))
    expect(agencyCase.workflowInstanceId).toBe(ids.workflowId)
    expect(test.run).not.toHaveBeenCalled()
  })
})
