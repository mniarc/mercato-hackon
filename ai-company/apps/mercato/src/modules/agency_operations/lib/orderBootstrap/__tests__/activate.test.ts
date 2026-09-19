/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CreateScopedAttachmentInput } from '@open-mercato/core/modules/attachments'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase } from '../../../data/entities'
import { AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from '../../contracts'
import { createActivatePaidPurchase } from '../activate'
import { configureDemoPurchaseWorkflow, DEMO_PURCHASE_WORKFLOW_ID, DEMO_PURCHASE_WORKER_ID, demoPurchaseWorkflowDefinition } from '../workflow'
import { demoOffer } from '../demoOffer'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const identity = { tenantId: uuid(1), organizationId: uuid(2), customerEntityId: uuid(3), customerUserId: uuid(4) }
const input = { identity, caseId: uuid(5), orderId: uuid(6), paymentId: uuid(7), termsAcceptedAt: '2026-09-19T00:00:00.000Z',
  originalPurchase: { requestId: uuid(8), offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion, acceptedTerms: true as const,
    buyer: { brandDisplayName: 'Agency client', brandWebsiteUrl: 'https://example.test', market: 'PL', language: 'pl',
      contactName: 'Client', contactEmail: 'client@example.test', billingBuyerType: 'company' as const, billingLegalName: 'Client company',
      billingCountry: 'PL', billingAddress: 'Example address', billingTaxId: 'DEMO', officialSocialUrl: '', purchaseGoal: 'Demo' } } }
const definition = { id: uuid(10), enabled: true, workflowId: DEMO_PURCHASE_WORKFLOW_ID, version: 1, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'demo_purchase' } } }
let agencyCase: AgencyCase | null, workflow: WorkflowInstance | null
const fork = jest.fn()
const em = { fork, create: (_entity: unknown, values: unknown) => Object.assign(new AgencyCase(), values),
  persist: (row: AgencyCase) => { agencyCase = row }, flush: jest.fn() }
const createScoped = jest.fn(), startWorkflow = jest.fn(), executeWorkflow = jest.fn(), findOwnedDefinition = jest.fn(), upsertOwnedDefinition = jest.fn()
const services: Record<string, unknown> = { em, attachmentService: { createScoped }, workflowExecutor: { startWorkflow, executeWorkflow },
  workflowDefinitionAuthoring: { findOwnedDefinition, upsertOwnedDefinition }, rbacService: { userHasAllFeatures: async () => true } }
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  fork.mockReturnValue(em)
  agencyCase = null; workflow = null
  findOwnedDefinition.mockResolvedValue(definition)
  upsertOwnedDefinition.mockResolvedValue({ ok: true, definition })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    const row = entity === AgencyCase ? agencyCase : workflow
    return row && Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value) ? row as never : null
  })
  createScoped.mockImplementation(async (args: CreateScopedAttachmentInput) => { await args.persistLink!(em as never, uuid(11)); return { id: uuid(11) } })
  startWorkflow.mockImplementation(async (_em, options) => {
    workflow = Object.assign(new WorkflowInstance(), { ...options, id: uuid(12), context: options.initialContext, status: 'RUNNING', currentStepId: 'start', deletedAt: null })
    return workflow
  })
  executeWorkflow.mockImplementation(async () => {
    workflow!.status = 'RUNNING'; workflow!.currentStepId = 'awaiting_execution'
    return { status: 'RUNNING', currentStep: 'awaiting_execution' }
  })
})

test('stores genuine private purchase material and activates one waiting case without fulfillment or agents', async () => {
  const activate = createActivatePaidPurchase(container)
  const receipt = await activate(input)
  expect(fork).toHaveBeenCalledWith({ keepTransactionContext: true })
  expect(receipt).toEqual({ caseId: input.caseId, workflowInstanceId: uuid(12) })
  expect(agencyCase).toMatchObject({ id: input.caseId, customerEntityId: identity.customerEntityId, submittedByCustomerUserId: identity.customerUserId,
    agentWorkerId: DEMO_PURCHASE_WORKER_ID, materialAttachmentId: uuid(11) })
  const material = createScoped.mock.calls[0][0] as CreateScopedAttachmentInput
  expect(material.partitionCode).toBe(AGENCY_CASE_ATTACHMENT_PARTITION_CODE)
  expect(JSON.parse(material.buffer.toString('utf8'))).toMatchObject({ originalPurchase: input.originalPurchase, demoOffer, orderId: input.orderId, paymentId: input.paymentId, termsAcceptedAt: input.termsAcceptedAt })
  expect(await activate(input)).toEqual(receipt)
  expect(createScoped).toHaveBeenCalledTimes(1)
  expect(startWorkflow).toHaveBeenCalledTimes(1)
  expect(executeWorkflow).toHaveBeenCalledTimes(1)
  expect(demoPurchaseWorkflowDefinition.transitions).toEqual([{ transitionId: 'await_execution', fromStepId: 'start', toStepId: 'awaiting_execution', trigger: 'auto' }])
  expect(demoPurchaseWorkflowDefinition.steps[1]).toMatchObject({ stepId: 'awaiting_execution', stepType: 'WAIT_FOR_SIGNAL' })
})

test('recovers case and workflow crash windows but rejects a changed purchase or workflow binding', async () => {
  const activate = createActivatePaidPurchase(container)
  startWorkflow.mockRejectedValueOnce(new Error('before workflow creation'))
  await expect(activate(input)).rejects.toThrow('before workflow creation')
  expect(agencyCase).toBeTruthy()
  const receipt = await activate(input)
  agencyCase!.workflowInstanceId = null
  expect(await activate(input)).toEqual(receipt)
  expect(createScoped).toHaveBeenCalledTimes(1)
  expect(startWorkflow).toHaveBeenCalledTimes(2)
  await expect(activate({ ...input, paymentId: uuid(90) })).rejects.toMatchObject({ status: 409 })
  workflow!.context.customerEntityId = uuid(91)
  await expect(activate(input)).rejects.toMatchObject({ status: 409 })
})

test('native configuration creates no execution grant and never overwrites an existing owned definition', async () => {
  const configure = { tenantId: identity.tenantId, organizationId: identity.organizationId, userId: uuid(20) }
  findOwnedDefinition.mockResolvedValueOnce(null)
  await configureDemoPurchaseWorkflow(container, configure)
  expect(upsertOwnedDefinition).toHaveBeenCalledWith(em, expect.objectContaining({ grantedFeatures: [], definition: demoPurchaseWorkflowDefinition, ownerId: 'demo_purchase' }))
  await configureDemoPurchaseWorkflow(container, configure)
  expect(upsertOwnedDefinition).toHaveBeenCalledTimes(1)
})
