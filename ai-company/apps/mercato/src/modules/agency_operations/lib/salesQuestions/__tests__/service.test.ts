/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CustomerUser } from '@open-mercato/core/modules/customer_accounts/data/entities'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isClientTriageEnabled } from '../../../agents/client-triage/configuration'
import { createSalesQuestionsService } from '../service'
import { readSalesCatalogue } from '../configure'
import { createSalesAnswerWorkflow } from '../workflow'
import { SALES_ANSWER_WORKFLOW_ID, SALES_QUESTION_WORKFLOW_ID } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../../agents/client-triage/configuration', () => ({
  ...jest.requireActual('../../../agents/client-triage/configuration'), isClientTriageEnabled: jest.fn(),
}))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const identity = { tenantId: uuid(1), organizationId: uuid(2), customerUserId: uuid(3) }
const input = { eventId: uuid(4), question: 'Does asking for a price start a free audit?' }

function setup(configured = false) {
  jest.clearAllMocks()
  jest.mocked(isClientTriageEnabled).mockReturnValue(configured)
  const rows: WorkflowInstance[] = []
  const customer = Object.assign(new CustomerUser(), { id: identity.customerUserId, ...identity, isActive: true, emailVerifiedAt: new Date(), customerEntityId: null, personEntityId: null })
  const em = { transactional: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(em)) }
  const startWorkflow = jest.fn(async (_manager: unknown, options: Record<string, unknown>) => {
    const row = Object.assign(new WorkflowInstance(), options, { id: uuid(10 + rows.length), context: options.initialContext, createdAt: new Date(), status: 'RUNNING', currentStepId: 'start' })
    rows.push(row)
    return row
  })
  const executeWorkflow = jest.fn(async (_manager: unknown, _container: unknown, id: string) => {
    const row = rows.find((item) => item.id === id)!
    row.currentStepId = row.workflowId === SALES_QUESTION_WORKFLOW_ID ? 'waiting_answer' : 'triage'
    row.status = row.workflowId === SALES_QUESTION_WORKFLOW_ID ? 'PAUSED' : 'WAITING_FOR_ACTIVITIES'
  })
  const findOwnedDefinition = jest.fn(async (_manager: unknown, options: { workflowId: string }) => ({
    id: uuid(30), workflowId: options.workflowId, version: 1, enabled: true,
    metadata: { generatedBy: { module: 'agency_operations', ownerId: options.workflowId === SALES_QUESTION_WORKFLOW_ID ? 'sales_question' : 'sales_answer' } },
    grantedFeatures: options.workflowId === SALES_ANSWER_WORKFLOW_ID ? ['agent_orchestrator.agents.run'] : [],
    definition: createSalesAnswerWorkflow(readSalesCatalogue()),
  }))
  jest.mocked(findOneWithDecryption).mockImplementation(async (_manager, entity, rawWhere) => {
    const where = rawWhere as Record<string, unknown>
    if (where.tenantId !== identity.tenantId || where.organizationId !== identity.organizationId) return null
    if (entity === CustomerUser) return where.id === customer.id ? customer as never : null
    if (entity === WorkflowInstance) return (rows.find((row) => (!where.id || row.id === where.id)
      && (!where.workflowId || row.workflowId === where.workflowId)
      && (!where.correlationKey || row.correlationKey === where.correlationKey)) ?? null) as never
    return null
  })
  jest.mocked(findWithDecryption).mockImplementation(async (_manager, _entity, rawWhere) => {
    const where = rawWhere as { metadata: { entityId: string }; workflowId: string }
    return rows.filter((row) => row.workflowId === where.workflowId && row.metadata?.entityId === where.metadata.entityId) as never
  })
  const services: Record<string, unknown> = { em, workflowExecutor: { startWorkflow, executeWorkflow }, workflowDefinitionAuthoring: { findOwnedDefinition } }
  const container = { resolve: (key: string) => services[key], hasRegistration: () => configured } as unknown as AppContainer
  return { service: createSalesQuestionsService(container), rows, startWorkflow, executeWorkflow, customer, findOwnedDefinition }
}

test('retains an unlinked account question while configuration is absent and replays the immutable original', async () => {
  const fixture = setup()
  const first = await fixture.service.submit(identity, input)
  expect(first.item).toMatchObject({ question: input.question, state: 'waiting_configuration', answer: null, productId: readSalesCatalogue().productId })
  const replay = await fixture.service.submit(identity, { ...input, question: 'Replace the saved question' })
  expect(replay).toMatchObject({ replayed: true, item: first.item })
  expect(fixture.startWorkflow).toHaveBeenCalledTimes(1)
  expect(fixture.customer.customerEntityId).toBeNull()
  expect((await fixture.service.list(identity)).items).toEqual([first.item])
})

test('configured execution dispatches exactly one saved-question workflow and preserves an owned follow-up', async () => {
  const fixture = setup(true)
  const first = await fixture.service.submit(identity, input)
  await fixture.service.submit(identity, input)
  expect(first.item.state).toBe('processing')
  expect(fixture.rows.filter((row) => row.workflowId === SALES_ANSWER_WORKFLOW_ID)).toHaveLength(1)
  const next = await fixture.service.submit(identity, { eventId: uuid(5), question: 'What does that amount cover?', previousQuestionId: first.item.id })
  expect(next.item.previousQuestionId).toBe(first.item.id)
  expect(fixture.rows.every((row) => !row.context.caseId && !row.context.orderId)).toBe(true)
})

test('registered agents alone do not authorize execution without an explicitly configured native definition', async () => {
  const fixture = setup(true)
  const original = fixture.findOwnedDefinition.getMockImplementation()!
  fixture.findOwnedDefinition.mockImplementation(async (manager, options) => options.workflowId === SALES_ANSWER_WORKFLOW_ID ? null as never : original(manager, options))
  const result = await fixture.service.submit(identity, input)
  expect(result.item.state).toBe('waiting_configuration')
  expect(fixture.rows.map((row) => row.workflowId)).toEqual([SALES_QUESTION_WORKFLOW_ID])
})

test('rejects a foreign customer follow-up and an inactive account before starting a workflow', async () => {
  const fixture = setup()
  const first = await fixture.service.submit(identity, input)
  fixture.rows[0].context.salesQuestion.customerUserId = uuid(90)
  await expect(fixture.service.submit(identity, { ...input, eventId: uuid(5), previousQuestionId: first.item.id })).rejects.toMatchObject({ status: 404 })
  fixture.customer.isActive = false
  await expect(fixture.service.submit(identity, { ...input, eventId: uuid(6) })).rejects.toMatchObject({ status: 403 })
  expect(fixture.startWorkflow).toHaveBeenCalledTimes(1)
})
