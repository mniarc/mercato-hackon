/** @jest-environment node */
import { createHash } from 'node:crypto'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgencyCase } from '../../../data/entities'
import { demoOffer } from '../../orderBootstrap/demoOffer'
import { DEMO_PURCHASE_WORKER_ID, DEMO_PURCHASE_WORKFLOW_ID } from '../../orderBootstrap/workflow'
import { readDemoPurchaseConfiguration } from '../../orderBootstrap/configure'
import { createNativeDemoSales } from '../../orderBootstrap/nativeSales'
import { createDemoPaymentGateway, isVerifiedDemoCapture } from '../../orderBootstrap/payment'
import { AGENCY_ANALYSIS_WORKFLOW_ID, createAgencyAnalysisWorkflowDefinition } from '../../analysisProcess/workflow'
import { createAnalysisWorkflowActivity } from '../../analysisProcess/activity'
import { createPaidCaseAnalysisBootstrap, createPaidCaseAnalysisReader } from '../bootstrap'
import { mapPaidPurchaseMaterial } from '../material'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../orderBootstrap/configure', () => ({ readDemoPurchaseConfiguration: jest.fn() }))
jest.mock('../../orderBootstrap/nativeSales', () => ({ ...jest.requireActual('../../orderBootstrap/nativeSales'), createNativeDemoSales: jest.fn() }))
jest.mock('../../orderBootstrap/payment', () => ({ createDemoPaymentGateway: jest.fn(), isVerifiedDemoCapture: jest.fn() }))
jest.mock('../../analysisProcess/materialSources', () => ({ loadCaseMaterialSources: jest.fn(async () => []) }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const identity = { tenantId: uuid(1), organizationId: uuid(2), customerEntityId: uuid(3), customerUserId: uuid(4) }
const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
const caseId = uuid(5), orderId = uuid(6), paymentId = uuid(7), purchaseWorkflowId = uuid(8), analysisId = uuid(9)
const originalPurchase = { requestId: uuid(10), offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion, acceptedTerms: true as const,
  buyer: { brandDisplayName: 'Actual buyer', brandWebsiteUrl: 'https://buyer.example', market: 'PL', language: 'pl', contactName: 'Buyer',
    contactEmail: 'buyer@example.test', billingBuyerType: 'individual' as const, billingLegalName: 'Buyer', billingCountry: 'PL', billingAddress: 'Original address', billingTaxId: '',
    officialSocialUrl: '', purchaseGoal: 'Original goal' } }
const termsAcceptedAt = '2026-09-19T12:30:00.000Z'
const buffer = Buffer.from(JSON.stringify({ demoOnly: true, identity, caseId, orderId, paymentId, originalPurchase, demoOffer, termsAcceptedAt }))
const origin = { orderId, paymentId, purchaseWorkflowInstanceId: purchaseWorkflowId, materialHash: createHash('sha256').update(buffer).digest('hex') }
const policy = { through: '4.2' as const, maxCostPln: 1, productSelection: { sku: demoOffer.sku, offer_version: demoOffer.offerVersion,
  price_net: demoOffer.amount, currency: demoOffer.currency, result_limits: { topics: 7 } } }
let agencyCase: AgencyCase, purchaseWorkflow: WorkflowInstance, analysis: WorkflowInstance | null
let definition: Record<string, unknown> | null
let events: string[]
const loadOrder = jest.fn(), loadPayment = jest.fn(), readScoped = jest.fn(), startWorkflow = jest.fn(), executeWorkflow = jest.fn()
const runResearch = jest.fn(), researchStatus = jest.fn()
const em: { fork: () => unknown; flush: jest.Mock; transactional: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> } = { fork: () => em, flush: jest.fn(), transactional: async (fn) => {
  events.push('begin'); const result = await fn(em); events.push('commit'); return result
} }
const container = { hasRegistration: () => true, resolve: (name: string) => ({
  em, attachmentService: { readScoped }, workflowExecutor: { startWorkflow, executeWorkflow },
  agencyResearchService: { run: runResearch, status: researchStatus },
  workflowDefinitionAuthoring: { findOwnedDefinition: async () => definition },
})[name as 'em'] } as unknown as AppContainer
const previousEnabled = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED

beforeEach(() => {
  jest.clearAllMocks(); events = []; analysis = null
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  const binding = { requestId: originalPurchase.requestId, requestHash: 'saved', customerUserId: identity.customerUserId, reservedCaseId: caseId,
    originalPurchase, termsAcceptedAt, offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion,
    amount: demoOffer.amount, currencyCode: demoOffer.currency, provider: demoOffer.provider, caseId, workflowInstanceId: purchaseWorkflowId }
  loadOrder.mockResolvedValue({ ...scope, id: orderId, customerEntityId: identity.customerEntityId, metadata: { agencyPurchase: binding } })
  loadPayment.mockResolvedValue({ id: paymentId, capturedAmount: demoOffer.amount })
  jest.mocked(readDemoPurchaseConfiguration).mockResolvedValue({ ...scope, executionUserId: uuid(20) } as never)
  jest.mocked(createNativeDemoSales).mockReturnValue({ loadOrder, loadPayment } as never)
  jest.mocked(createDemoPaymentGateway).mockReturnValue({ read: async () => ({ id: uuid(21) }) } as never)
  jest.mocked(isVerifiedDemoCapture).mockReturnValue(true)
  agencyCase = Object.assign(new AgencyCase(), { ...scope, id: caseId, customerEntityId: identity.customerEntityId, submittedByCustomerUserId: identity.customerUserId,
    materialAttachmentId: uuid(22), materialFileName: 'original-purchase.json', agentWorkerId: DEMO_PURCHASE_WORKER_ID, workflowInstanceId: purchaseWorkflowId, deletedAt: null })
  purchaseWorkflow = Object.assign(new WorkflowInstance(), { ...scope, id: purchaseWorkflowId, workflowId: DEMO_PURCHASE_WORKFLOW_ID, deletedAt: null,
    context: { caseId, orderId, paymentId, materialAttachmentId: agencyCase.materialAttachmentId, materialHash: origin.materialHash }, status: 'PAUSED' })
  definition = { id: uuid(23), workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 1, enabled: true,
    metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } }, grantedFeatures: ['agency_research.manage', 'agent_orchestrator.agents.run'],
    definition: createAgencyAnalysisWorkflowDefinition(policy) }
  readScoped.mockResolvedValue({ buffer })
  researchStatus.mockResolvedValue({ taskRuns: [] })
  runResearch.mockResolvedValue({ taskRunIds: ['task-1'], documentVersionIds: ['brief-1'], agentRunIds: ['run-1'], spentPln: 0,
    completedThrough: '4.2', qaVerdict: 'ready', briefQaVerdict: 'ready_for_approval' })
  startWorkflow.mockImplementation(async (_em, input) => { events.push('start'); analysis = Object.assign(new WorkflowInstance(), {
    ...scope, id: analysisId, workflowId: input.workflowId, deletedAt: null, context: input.initialContext, status: 'RUNNING' }); return analysis })
  executeWorkflow.mockImplementation(async () => { events.push('execute'); analysis!.status = 'WAITING_FOR_ACTIVITIES'; return { status: analysis!.status } })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const rows = entity === AgencyCase ? [agencyCase] : [purchaseWorkflow, analysis].filter(Boolean)
    return (rows.find((row) => Object.entries(where as Record<string, unknown>).every(([key, value]) => Reflect.get(row!, key) === value)) ?? null) as never
  })
})
afterAll(() => { if (previousEnabled === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED; else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = previousEnabled })

test('same paid case queues the existing native process only after commit; replay preserves the original attachment and does not start twice', async () => {
  const bootstrap = createPaidCaseAnalysisBootstrap(container)
  expect(await bootstrap(identity, orderId)).toMatchObject({ state: 'started', workflowInstanceId: analysisId, nativeStatus: 'WAITING_FOR_ACTIVITIES', replayed: false })
  expect(events).toEqual(['begin', 'start', 'commit', 'execute'])
  expect(startWorkflow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
    initialContext: expect.objectContaining({ caseId, paidPurchaseOrigin: origin }) }))
  expect(agencyCase).toMatchObject({ id: caseId, materialAttachmentId: uuid(22), materialFileName: 'original-purchase.json', workflowInstanceId: analysisId })
  expect(await bootstrap(identity, orderId)).toMatchObject({ state: 'started', workflowInstanceId: analysisId, replayed: true })
  expect(startWorkflow).toHaveBeenCalledTimes(1); expect(executeWorkflow).toHaveBeenCalledTimes(1)
  expect(purchaseWorkflow.status).toBe('PAUSED')
})

test('missing policy or execution permission is a hold, not a replacement case or default budget', async () => {
  definition = null
  expect(await createPaidCaseAnalysisBootstrap(container)(identity, orderId)).toEqual({ state: 'waiting_configuration', reason: 'missing_process_configuration' })
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'false'
  expect(await createPaidCaseAnalysisBootstrap(container)(identity, orderId)).toEqual({ state: 'waiting_configuration', reason: 'execution_disabled' })
  expect(startWorkflow).not.toHaveBeenCalled(); expect(executeWorkflow).not.toHaveBeenCalled()
})

test('the existing native analysis activity consumes paid buyer material and calls the teammate service under its exact policy', async () => {
  await createPaidCaseAnalysisBootstrap(container)(identity, orderId)
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, { userId: uuid(20), workflowInstance: analysis })).resolves.toMatchObject({ caseId, state: 'completed' })
  expect(runResearch).toHaveBeenCalledWith({ context: expect.objectContaining({ ...scope, userId: uuid(20), workflowInstanceId: analysisId }),
    request: expect.objectContaining({ orderRef: caseId, through: '4.2', maxCostPln: 1, order: expect.objectContaining({
      product_selection: policy.productSelection, brand: { display_name: 'Actual buyer', website_url: 'https://buyer.example' },
    }) }) })
})

test('read-only purchase reload reports configured readiness without creating or dispatching a workflow', async () => {
  expect(await createPaidCaseAnalysisReader(container)(identity, orderId)).toEqual({ state: 'ready', workflowInstanceId: purchaseWorkflowId })
  expect(startWorkflow).not.toHaveBeenCalled(); expect(executeWorkflow).not.toHaveBeenCalled(); expect(em.flush).not.toHaveBeenCalled()
  expect(agencyCase.workflowInstanceId).toBe(purchaseWorkflowId)
})

test('literal buyer fields map into teammate input only with the exact paid case and matching explicit product policy', () => {
  const mapped = mapPaidPurchaseMaterial(buffer, origin, { ...identity, caseId }, policy)
  expect(mapped.order).toMatchObject({ product_selection: policy.productSelection, brand: { display_name: 'Actual buyer', website_url: 'https://buyer.example' },
    buyer_contact: { contact_id: identity.customerUserId }, purchase_goal: 'Original goal', terms_confirmation: { accepted_at: termsAcceptedAt } })
  expect(mapped).not.toHaveProperty('maxCostPln'); expect(mapped).not.toHaveProperty('pages')
  expect(() => mapPaidPurchaseMaterial(buffer, origin, { ...identity, caseId: uuid(99) }, policy)).toThrow()
  expect(() => mapPaidPurchaseMaterial(buffer, origin, { ...identity, caseId }, { ...policy, productSelection: { ...policy.productSelection, sku: 'other-product' } })).toThrow()
})

test('a foreign buyer or unverified native payment cannot activate research', async () => {
  await expect(createPaidCaseAnalysisBootstrap(container)({ ...identity, customerUserId: uuid(99) }, orderId)).rejects.toMatchObject({ status: 409 })
  jest.mocked(isVerifiedDemoCapture).mockReturnValue(false)
  await expect(createPaidCaseAnalysisBootstrap(container)(identity, orderId)).rejects.toMatchObject({ status: 409 })
  expect(startWorkflow).not.toHaveBeenCalled(); expect(executeWorkflow).not.toHaveBeenCalled()
})
