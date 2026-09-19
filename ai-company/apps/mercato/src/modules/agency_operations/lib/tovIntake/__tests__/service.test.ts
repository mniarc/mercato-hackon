import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase } from '../../../data/entities'
import { AGENCY_ANALYSIS_WORKFLOW_ID } from '../../analysisProcess/workflow'
import { AGENCY_TOV_WORKFLOW_ID } from '../../tovProcess'
import { createStaffTovIntakeService } from '../service'
import { STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID, STAFF_TOV_INTAKE_CONTEXT_KEY } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const userId = uuid(3), caseId = uuid(4), customerEntityId = uuid(5), analysisId = uuid(6), specialistId = uuid(7), attachmentId = uuid(8)
const post = { id: 'post-1', source: 'linkedin', profileUrl: 'https://example.test/profile', authorName: 'Demo',
  url: 'https://example.test/post', postedAt: '2026-09-19', text: 'Public source text.', likes: 1, comments: 0, shares: 0, media: 'none' }

function fixture() {
  let specialist: WorkflowInstance | null = null
  const agencyCase = Object.assign(new AgencyCase(), { id: caseId, ...scope, customerEntityId,
    agentWorkerId: 'agency_operations.agent-worker.analysis.v1', workflowInstanceId: analysisId })
  const analysis = Object.assign(new WorkflowInstance(), { id: analysisId, ...scope, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
    metadata: { entityType: 'agency_operations:agency_case', entityId: caseId },
    context: { caseId, customerEntityId, purchase: {
      orderId: uuid(20), paymentId: uuid(21), demoOnly: true, materialHash: 'a'.repeat(64),
      receiptAttachmentId: uuid(23), receiptHash: 'b'.repeat(64),
    } } })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    if (entity === AgencyCase) return agencyCase as never
    if (entity === WorkflowInstance && (where as { id?: string }).id === analysisId) return analysis as never
    if (entity === WorkflowInstance && specialist && ((where as { id?: string }).id === specialist.id
      || (where as { correlationKey?: string }).correlationKey === specialist.correlationKey)) return specialist as never
    return null
  })
  const startWorkflow = jest.fn(async (_em, options: Record<string, any>) => {
    specialist = Object.assign(new WorkflowInstance(), {
      id: specialistId, ...scope, workflowId: AGENCY_TOV_WORKFLOW_ID, status: 'WAITING_FOR_ACTIVITIES',
      currentStepId: 'tov_research', correlationKey: options.correlationKey, metadata: options.metadata, context: options.initialContext,
    })
    return { id: specialistId }
  })
  const executeWorkflow = jest.fn(async () => ({ status: 'WAITING_FOR_ACTIVITIES', currentStep: 'tov_research' }))
  const createScoped = jest.fn(async (options: Record<string, any>) => options.persistLink({}, attachmentId))
  const services: Record<string, unknown> = {
    em: {}, rbacService: { userHasAllFeatures: jest.fn(async () => true) },
    workflowExecutor: { startWorkflow, executeWorkflow }, attachmentService: { createScoped },
    workflowDefinitionAuthoring: { findOwnedDefinition: jest.fn(async () => ({ enabled: true,
      metadata: { generatedBy: { module: 'agency_operations' } }, grantedFeatures: ['agency_tov.manage'] })) },
    agencyTovResearchService: {},
  }
  const container = { resolve: jest.fn((name: string) => services[name]), hasRegistration: jest.fn((name: string) => name in services) }
  return { container, startWorkflow, executeWorkflow, createScoped, analysis, specialist: () => specialist }
}

describe('staff ToV intake', () => {
  const previous = process.env.AGENCY_TOV_EXECUTION_ENABLED
  beforeEach(() => { jest.clearAllMocks(); process.env.AGENCY_TOV_EXECUTION_ENABLED = 'true' })
  afterAll(() => { if (previous === undefined) delete process.env.AGENCY_TOV_EXECUTION_ENABLED; else process.env.AGENCY_TOV_EXECUTION_ENABLED = previous })

  it('starts the existing workflow from the authoritative paid case without replacing or impersonating its customer', async () => {
    const test = fixture()
    const result = await createStaffTovIntakeService(test.container as never).start({ ...scope, userId, caseId,
      eventId: 'staff-event-1', brand: 'Demo', outputLanguage: 'pl',
      file: { buffer: Buffer.from(JSON.stringify([post])), fileName: 'corpus.json', mimeType: 'application/json' } })
    expect(result).toMatchObject({ caseId, customerEntityId, workflowInstanceId: specialistId, state: 'running', replayed: false })
    expect(test.startWorkflow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      workflowId: AGENCY_TOV_WORKFLOW_ID,
      metadata: expect.objectContaining({ initiatedBy: userId, entityType: STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID }),
      initialContext: expect.objectContaining({ caseId, customerEntityId, [STAFF_TOV_INTAKE_CONTEXT_KEY]: expect.objectContaining({ initiatedByUserId: userId, corpusAttachmentId: attachmentId }) }),
    }))
    expect(test.specialist()).not.toBeNull()
  })

  it.each(['missing-origin', 'legacy-only', 'wrong-case'] as const)('refuses invalid direct purchase linkage: %s', async (invalid) => {
    const test = fixture()
    if (invalid === 'wrong-case') test.analysis.metadata = { entityType: 'agency_operations:agency_case', entityId: uuid(99) }
    else {
      delete test.analysis.context.purchase
      if (invalid === 'legacy-only') test.analysis.context.paidPurchaseOrigin = {
        orderId: uuid(20), paymentId: uuid(21), purchaseWorkflowInstanceId: uuid(22), materialHash: 'a'.repeat(64),
      }
    }
    await expect(createStaffTovIntakeService(test.container as never).start({ ...scope, userId, caseId,
      eventId: 'staff-event-1', brand: 'Demo', outputLanguage: 'pl',
      file: { buffer: Buffer.from(JSON.stringify([post])), fileName: 'corpus.json', mimeType: 'application/json' },
    })).rejects.toMatchObject({ status: 409 })
    expect(test.startWorkflow).not.toHaveBeenCalled()
    expect(test.executeWorkflow).not.toHaveBeenCalled()
  })

  it('replays the exact event without another attachment, workflow or dispatch', async () => {
    const test = fixture()
    const service = createStaffTovIntakeService(test.container as never)
    const input = { ...scope, userId, caseId, eventId: 'same-event', brand: 'Demo', outputLanguage: 'pl' as const,
      file: { buffer: Buffer.from(JSON.stringify([post])), fileName: 'corpus.json', mimeType: 'application/json' } }
    await service.start(input)
    const replay = await service.start(input)
    expect(replay.replayed).toBe(true)
    expect(test.createScoped).toHaveBeenCalledTimes(1)
    expect(test.startWorkflow).toHaveBeenCalledTimes(1)
    expect(test.executeWorkflow).toHaveBeenCalledTimes(1)
  })
})
