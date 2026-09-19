/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AgencyCase } from '../../../data/entities'
import { createClientMaterialIntakeService } from '../../clientMaterialIntakeService'
import { createAgencyCaseWorkflowService } from '../../agencyCaseWorkflowService'
import { clientMaterialIntakeInputSchema } from '../../contracts'
import { AGENCY_ANALYSIS_WORKER_ID, AGENCY_ANALYSIS_WORKFLOW_ID } from '../workflow'

const findOne = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: (...args: unknown[]) => findOne(...args) }))

const identity = {
  tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002',
  customerEntityId: '00000000-0000-4000-8000-000000000003', customerUserId: '00000000-0000-4000-8000-000000000004',
}
const caseId = '00000000-0000-4000-8000-000000000005'
const workflowId = '00000000-0000-4000-8000-000000000006'
const material = { order: {
  product_selection: { sku: 'test', offer_version: 'test-v1', price_net: 123, currency: 'PLN', result_limits: { topics: 7 } },
  brand: { display_name: 'Example', website_url: 'https://example.test' }, market_language: { market: 'PL', language: 'pl' },
} }
const input = { identity, title: 'Research', process: { kind: 'analysis' as const }, file: { buffer: Buffer.from(JSON.stringify(material)), fileName: 'order.json', mimeType: 'application/json' } }
const definition = { enabled: true, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 4, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } }, grantedFeatures: ['agency_research.manage', 'agent_orchestrator.agents.run'] }
const oldFlag = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED

beforeEach(() => { jest.clearAllMocks(); process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true' })
afterAll(() => {
  if (oldFlag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = oldFlag
})

function fixture() {
  let persisted: AgencyCase | undefined
  const em = { create: (_type: unknown, values: unknown) => Object.assign(new AgencyCase(), values), persist: (row: AgencyCase) => { persisted = row }, flush: jest.fn() }
  const createScoped = jest.fn(async (args: { persistLink: (tx: unknown, id: string) => void | Promise<void> }) => { await args.persistLink(em, 'attachment-id'); return { id: 'attachment-id' } })
  const processCase = jest.fn(async (args: { caseId: string }) => ({ caseId: args.caseId, workflowInstanceId: workflowId, status: 'WAITING_FOR_ACTIVITIES', currentStep: 'research' }))
  const findOwnedDefinition = jest.fn(async () => definition)
  const services: Record<string, unknown> = {
    em, attachmentService: { createScoped }, agencyCaseWorkflowService: { processCase },
    customerUserService: { findById: async () => ({ id: identity.customerUserId, customerEntityId: identity.customerEntityId, isActive: true }) },
    workflowDefinitionAuthoring: { findOwnedDefinition }, agencyResearchService: {}, agentWorkflowBridge: {},
  }
  const container = { resolve: (key: string) => services[key], hasRegistration: (key: string) => key in services } as unknown as AppContainer
  return { container, services, createScoped, processCase, findOwnedDefinition, persisted: () => persisted }
}

it('persists real private material then starts the configured analysis lane', async () => {
  const test = fixture()
  await expect(createClientMaterialIntakeService(test.container).submitMaterial(input)).resolves.toMatchObject({ status: 'WAITING_FOR_ACTIVITIES', workflowInstanceId: workflowId })
  expect(test.persisted()).toMatchObject({ agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, materialAttachmentId: 'attachment-id', customerEntityId: identity.customerEntityId })
  expect(test.processCase).toHaveBeenCalledWith(expect.objectContaining({ process: { kind: 'analysis' } }))
  expect(test.findOwnedDefinition).toHaveBeenCalledWith(test.services.em, { tenantId: identity.tenantId, organizationId: identity.organizationId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID })
})

it('rejects disabled analysis and caller spend/stage before storage', async () => {
  const test = fixture()
  delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  await expect(createClientMaterialIntakeService(test.container).submitMaterial(input)).rejects.toThrow()
  expect(test.createScoped).not.toHaveBeenCalled()
  expect(() => clientMaterialIntakeInputSchema.parse({ ...input, process: { kind: 'analysis', maxCostPln: 999, through: '4.2' } })).toThrow()
})

it('pins the authorized native definition version and never puts portal policy in workflow context', async () => {
  const test = fixture()
  const agencyCase = Object.assign(new AgencyCase(), {
    id: caseId, ...identity, submittedByCustomerUserId: identity.customerUserId,
    title: input.title, agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, materialFileName: input.file.fileName,
    materialMimeType: input.file.mimeType, materialFileSize: input.file.buffer.length, workflowInstanceId: null,
  })
  findOne.mockResolvedValue(agencyCase)
  const startWorkflow = jest.fn(async (_em: unknown, _args: { initialContext: Record<string, unknown>; metadata: Record<string, unknown> }) => ({ id: workflowId }))
  const executeWorkflow = jest.fn(async () => ({ status: 'WAITING_FOR_ACTIVITIES', currentStep: 'research' }))
  test.services.workflowExecutor = { startWorkflow, executeWorkflow }
  await expect(createAgencyCaseWorkflowService(test.container).processCase({ caseId, ...identity, process: { kind: 'analysis' } })).resolves.toMatchObject({ status: 'WAITING_FOR_ACTIVITIES' })
  expect(startWorkflow).toHaveBeenCalledWith(test.services.em, expect.objectContaining({ workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 4 }))
  const args = startWorkflow.mock.calls[0][1]
  expect(args.initialContext).not.toHaveProperty('policy')
  expect(args.initialContext).not.toHaveProperty('process')
  expect(args.metadata).not.toHaveProperty('initiatedBy')
  expect(agencyCase.workflowInstanceId).toBe(workflowId)
  expect(executeWorkflow).toHaveBeenCalledWith(test.services.em, test.container, workflowId)
})
