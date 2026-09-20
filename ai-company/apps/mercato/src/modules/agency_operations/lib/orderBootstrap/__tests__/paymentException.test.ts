/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { workflowDefinitionDataSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { SalesOrder, SalesPayment } from '@open-mercato/core/modules/sales/data/entities'
import { GatewayTransaction } from '@open-mercato/core/modules/payment_gateways/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { PAYMENT_EXCEPTION_WORKFLOW_ID, paymentDiscrepancy, paymentExceptionWorkflow, preparePaymentException } from '../paymentException'
import { demoOffer } from '../demoOffer'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const em = {} as EntityManager
const findOwnedDefinition = jest.fn(), upsertOwnedDefinition = jest.fn(), startWorkflow = jest.fn(), executeWorkflow = jest.fn()
const services: Record<string, unknown> = {
  em, workflowExecutor: { startWorkflow, executeWorkflow }, workflowDefinitionAuthoring: { findOwnedDefinition, upsertOwnedDefinition },
}
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer
let order: SalesOrder, payment: SalesPayment, transaction: GatewayTransaction
const definition = { id: uuid(7), workflowId: PAYMENT_EXCEPTION_WORKFLOW_ID, version: 1, enabled: true,
  metadata: { generatedBy: { module: 'agency_operations', ownerId: 'payment_exception' } } }

beforeEach(() => {
  jest.clearAllMocks()
  order = Object.assign(new SalesOrder(), { ...scope, id: uuid(3), grandTotalGrossAmount: '2500', currencyCode: 'PLN' })
  payment = Object.assign(new SalesPayment(), { ...scope, id: uuid(4), order, amount: '2500', currencyCode: 'PLN', capturedAmount: '0', refundedAmount: '0' })
  transaction = Object.assign(new GatewayTransaction(), { ...scope, id: uuid(5), paymentId: payment.id, providerKey: demoOffer.provider,
    amount: '2400', currencyCode: 'PLN', unifiedStatus: 'pending', capturedAmount: '0' })
  jest.mocked(findOneWithDecryption).mockResolvedValue(null)
  findOwnedDefinition.mockResolvedValue(null)
  upsertOwnedDefinition.mockResolvedValue({ ok: true, definition })
  startWorkflow.mockResolvedValue({ id: uuid(6), currentStepId: 'start', status: 'RUNNING' })
  executeWorkflow.mockResolvedValue({ currentStep: 'payment_exception', status: 'PAUSED' })
})

test('mismatch records native transaction evidence and dispatches an employee task only when invoked after commit', async () => {
  workflowDefinitionDataSchema.parse(paymentExceptionWorkflow)
  const dispatch = await preparePaymentException(container, em, order, payment, transaction)
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({
    ...scope, workflowId: PAYMENT_EXCEPTION_WORKFLOW_ID,
    correlationKey: `agency-payment-exception:${order.id}:${transaction.id}`,
    metadata: { entityType: 'sales:sales_order', entityId: order.id },
    initialContext: expect.objectContaining({ orderId: order.id, transactionId: transaction.id,
      evidence: expect.objectContaining({ reason: 'payment_purchase_mismatch', expected: { amount: 2500, currency: 'PLN', provider: demoOffer.provider },
        transaction: expect.objectContaining({ amount: '2400' }) }) }),
  }))
  expect(upsertOwnedDefinition).toHaveBeenCalledWith(em, expect.objectContaining({ definition: paymentExceptionWorkflow, grantedFeatures: [] }))
  expect(paymentExceptionWorkflow.steps.find((step) => step.stepId === 'payment_exception')?.userTaskConfig)
    .toMatchObject({ assignedToRoles: ['employee'], decisions: [{ id: 'keep_blocked' }] })
  expect(executeWorkflow).not.toHaveBeenCalled()
  await dispatch!()
  expect(executeWorkflow).toHaveBeenCalledWith(em, container, uuid(6))
})

test.each(['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'])('replayed %s exception is not recreated or restarted', async (status) => {
  jest.mocked(findOneWithDecryption).mockResolvedValue({ id: uuid(6), status, currentStepId: 'payment_exception' } as WorkflowInstance)
  expect(await preparePaymentException(container, em, order, payment, transaction)).toBeNull()
  expect(startWorkflow).not.toHaveBeenCalled()
  expect(executeWorkflow).not.toHaveBeenCalled()
  expect(findOneWithDecryption).toHaveBeenCalledWith(em, WorkflowInstance, expect.objectContaining({
    ...scope, correlationKey: `agency-payment-exception:${order.id}:${transaction.id}`, deletedAt: null,
  }), undefined, scope)
})

test('replay can dispatch a committed exception whose initial dispatch was interrupted', async () => {
  jest.mocked(findOneWithDecryption).mockResolvedValue({ id: uuid(6), status: 'RUNNING', currentStepId: 'start' } as WorkflowInstance)
  const dispatch = await preparePaymentException(container, em, order, payment, transaction)
  await dispatch!()
  expect(startWorkflow).not.toHaveBeenCalled()
  expect(executeWorkflow).toHaveBeenCalledTimes(1)
})

test('ordinary pending, failed and valid captured payments do not create billing exceptions', async () => {
  transaction.amount = '2500'
  for (const status of ['pending', 'failed', 'captured']) {
    transaction.unifiedStatus = status
    transaction.capturedAmount = status === 'captured' ? '2500' : '0'
    expect(await preparePaymentException(container, em, order, payment, transaction)).toBeNull()
  }
  expect(findOneWithDecryption).not.toHaveBeenCalled()
  expect(startWorkflow).not.toHaveBeenCalled()
  transaction.capturedAmount = '2400'
  expect(paymentDiscrepancy(order, payment, transaction)).toBe('capture_amount_mismatch')
})

test('foreign-scope evidence and an operator-disabled definition are not imported or overwritten', async () => {
  transaction.organizationId = uuid(90)
  await expect(preparePaymentException(container, em, order, payment, transaction)).rejects.toMatchObject({ status: 409 })
  expect(findOneWithDecryption).not.toHaveBeenCalled()
  transaction.organizationId = scope.organizationId
  findOwnedDefinition.mockResolvedValue({ ...definition, enabled: false })
  await expect(preparePaymentException(container, em, order, payment, transaction)).rejects.toMatchObject({ status: 409 })
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
  expect(startWorkflow).not.toHaveBeenCalled()
})
