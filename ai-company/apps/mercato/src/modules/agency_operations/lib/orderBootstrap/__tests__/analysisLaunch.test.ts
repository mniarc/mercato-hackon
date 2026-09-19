/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CreateScopedAttachmentInput } from '@open-mercato/core/modules/attachments'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase } from '../../../data/entities'
import { createActivatePaidPurchase } from '../activate'
import { buildAnalysisMaterial, readAnalysisLaunch } from '../analysisLaunch'
import { demoOffer } from '../demoOffer'
import { AGENCY_ANALYSIS_FUNCTION_NAME, AGENCY_ANALYSIS_WORKER_ID, AGENCY_ANALYSIS_WORKFLOW_ID } from '../../analysisProcess/workflow'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const identity = { tenantId: uuid(1), organizationId: uuid(2), customerEntityId: uuid(3), customerUserId: uuid(4) }
const policy = {
  through: '4.2' as const, maxCostPln: 10, strategyExecution: { maxCostPln: 6 },
  productSelection: { sku: 'START-KOMUNIKACJI-PL-01', offer_version: 'v1', price_net: 2500, currency: 'PLN', result_limits: { topics: 12 } },
}
const purchase = { requestId: uuid(8), offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion, acceptedTerms: true as const,
  buyer: { brandDisplayName: 'Open Mercato', brandWebsiteUrl: 'https://openmercato.com/', market: 'Polska', language: 'en',
    contactName: 'Client', contactEmail: 'client@example.test', billingBuyerType: 'company' as const, billingLegalName: 'Open Mercato sp. z o.o.',
    billingCountry: 'PL', billingAddress: 'Demo 1', billingTaxId: '0000000000', officialSocialUrl: 'https://www.linkedin.com/company/open-mercato/', purchaseGoal: 'Show the 80% claim' } }
const input = { identity, caseId: uuid(5), orderId: uuid(6), paymentId: uuid(7), termsAcceptedAt: '2026-09-19T12:00:00.000Z', originalPurchase: purchase }
const analysisDefinition = {
  id: uuid(20), enabled: true, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 1,
  metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } },
  definition: { steps: [], transitions: [{ transitionId: 'run', fromStepId: 'start', toStepId: 'research', trigger: 'auto', activities: [
    { activityId: 'research', activityName: 'agencyAnalysisResult', activityType: 'EXECUTE_FUNCTION', async: true, config: { functionName: AGENCY_ANALYSIS_FUNCTION_NAME, args: { caseId: '{{context.caseId}}', policy } } },
  ] }] },
}
let agencyCase: AgencyCase | null, workflow: WorkflowInstance | null
const fork = jest.fn()
const em = { fork, create: (_entity: unknown, values: unknown) => Object.assign(new AgencyCase(), values), persist: (row: AgencyCase) => { agencyCase = row }, flush: jest.fn() }
const createScoped = jest.fn(), startWorkflow = jest.fn(), executeWorkflow = jest.fn(), findOwnedDefinition = jest.fn()
const services: Record<string, unknown> = { em, attachmentService: { createScoped }, workflowExecutor: { startWorkflow, executeWorkflow }, workflowDefinitionAuthoring: { findOwnedDefinition } }
const container = { resolve: (name: string) => services[name], hasRegistration: (name: string) => name in services } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  fork.mockReturnValue(em)
  agencyCase = null; workflow = null
  findOwnedDefinition.mockImplementation(async (_em, query: { workflowId: string }) => (query.workflowId === AGENCY_ANALYSIS_WORKFLOW_ID ? analysisDefinition : null))
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    const row = entity === AgencyCase ? agencyCase : workflow
    return row && Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value) ? row as never : null
  })
  createScoped.mockImplementation(async (args: CreateScopedAttachmentInput) => { await args.persistLink!(em as never, uuid(11)); return { id: uuid(11) } })
  startWorkflow.mockImplementation(async (_em, options) => {
    workflow = Object.assign(new WorkflowInstance(), { ...options, id: uuid(12), context: options.initialContext, status: 'RUNNING', currentStepId: 'start', deletedAt: null })
    return workflow
  })
  executeWorkflow.mockResolvedValue({ status: 'WAITING_FOR_ACTIVITIES', currentStep: 'research' })
})
afterAll(() => { delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED })

test('the purchase form becomes the research order; the policy owns the product selection', () => {
  const material = buildAnalysisMaterial(purchase, policy, { orderId: uuid(6), termsAcceptedAt: input.termsAcceptedAt })
  expect(material.order.product_selection).toEqual(policy.productSelection)
  expect(material.order.brand).toEqual({ display_name: 'Open Mercato', website_url: 'https://openmercato.com/' })
  expect(material.order.market_language).toEqual({ market: 'Polska', language: 'en' })
  expect(material.order.official_social).toMatchObject({ url: 'https://www.linkedin.com/company/open-mercato/', platform: 'LinkedIn', provenance: 'client_provided' })
  expect(material.order.purchase_goal).toBe('Show the 80% claim')
  expect(material.order.terms_confirmation).toMatchObject({ terms_version: demoOffer.termsVersion, state: 'provided', event_ref: uuid(6) })
  expect(material.socialPosts).toBeUndefined()
})

test('readAnalysisLaunch needs the flag and a published policy', async () => {
  expect(await readAnalysisLaunch(container, identity)).toMatchObject({ workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 1, policy })
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'false'
  expect(await readAnalysisLaunch(container, identity)).toBeNull()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  findOwnedDefinition.mockResolvedValue(null)
  expect(await readAnalysisLaunch(container, identity)).toBeNull()
})

test('a verified purchase creates the analysis case, starts analysis.v1 and hands back the post-commit launch', async () => {
  const activation = await createActivatePaidPurchase(container)(input)
  expect(activation).toMatchObject({ caseId: input.caseId, workflowInstanceId: uuid(12) })
  expect(agencyCase).toMatchObject({ id: input.caseId, agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, materialAttachmentId: uuid(11), workflowInstanceId: uuid(12) })
  const material = JSON.parse((createScoped.mock.calls[0][0] as CreateScopedAttachmentInput).buffer.toString('utf8'))
  expect(material.order.product_selection).toEqual(policy.productSelection)
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({
    workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 1, correlationKey: `agency-case:${input.caseId}`,
    initialContext: expect.objectContaining({ caseId: input.caseId, agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, purchase: expect.objectContaining({ orderId: input.orderId, paymentId: input.paymentId, demoOnly: true }) }),
    metadata: expect.objectContaining({ entityType: 'agency_operations:agency_case', entityId: input.caseId }),
  }))
  expect(executeWorkflow).not.toHaveBeenCalled()
  await activation.launch!()
  expect(executeWorkflow).toHaveBeenCalledWith(em, container, uuid(12))
})

test('a retry after the workflow already ran does not launch twice', async () => {
  agencyCase = null
  await createActivatePaidPurchase(container)(input)
  workflow!.currentStepId = 'research'
  const again = await createActivatePaidPurchase(container)(input)
  expect(again.workflowInstanceId).toBe(uuid(12))
  expect(again.launch).toBeUndefined()
  expect(startWorkflow).toHaveBeenCalledTimes(1)
})
