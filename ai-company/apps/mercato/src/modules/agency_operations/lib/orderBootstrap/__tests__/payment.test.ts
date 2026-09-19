/** @jest-environment node */
import type { AwilixContainer } from 'awilix'
import { GatewayTransaction } from '@open-mercato/core/modules/payment_gateways/data/entities'
import { SalesOrder, SalesPayment } from '@open-mercato/core/modules/sales/data/entities'
import { getWebhookHandler } from '@open-mercato/shared/modules/payment_gateways/types'
import { processPaymentGatewayWebhookJob } from '@open-mercato/core/modules/payment_gateways/lib/webhook-processor'
import { isTrustedWebhookDispatch } from '@open-mercato/shared/lib/queue/dispatchOrigin'
import { mockGatewayAdapter } from '@/modules/example/lib/mock-gateway-adapter'
import { createDemoPaymentGateway } from '../payment'

jest.mock('@open-mercato/shared/modules/payment_gateways/types', () => ({ getWebhookHandler: jest.fn() }))
jest.mock('@open-mercato/core/modules/payment_gateways/lib/webhook-processor', () => ({ processPaymentGatewayWebhookJob: jest.fn() }))

const scope = { tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002' }
const originalFlag = process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED
afterAll(() => {
  if (originalFlag === undefined) delete process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED
  else process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED = originalFlag
})

test('demo confirmation verifies its webhook and reads native capture inside the existing transaction', async () => {
  process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED = 'true'
  const transaction = Object.assign(new GatewayTransaction(), { ...scope, id: 'transaction', paymentId: 'payment',
    providerKey: 'mock_processing', providerSessionId: 'mock_pending', amount: '2500', currencyCode: 'PLN', unifiedStatus: 'pending' })
  const handler = jest.fn(mockGatewayAdapter.verifyWebhook)
  jest.mocked(getWebhookHandler).mockReturnValue({ handler } as never)
  const transactionLocal = Object.assign(new GatewayTransaction(), transaction)
  jest.mocked(processPaymentGatewayWebhookJob).mockImplementation(async () => { transactionLocal.unifiedStatus = 'captured'; transactionLocal.capturedAmount = '2500' })
  // The native service flushes before the enclosing purchase transaction commits;
  // a detached fork can only observe the previous committed pending record.
  const em = { fork: jest.fn((options?: { keepTransactionContext?: boolean }) => ({
    findOne: jest.fn(async () => options?.keepTransactionContext ? transactionLocal : transaction),
  })) }
  const services = { em, paymentGatewayService: {}, integrationLogService: {},
    integrationCredentialsService: { resolve: jest.fn(async () => ({ webhookSecret: 'private-test-secret' })) } }
  const container = { resolve: (name: string) => services[name as keyof typeof services] } as unknown as AwilixContainer
  const gateway = createDemoPaymentGateway(container, scope)
  expect((await gateway.confirm(transaction)).unifiedStatus).toBe('captured')
  expect(em.fork).toHaveBeenCalledWith({ keepTransactionContext: true })
  expect(transaction.unifiedStatus).toBe('pending')
  expect(handler).toHaveBeenCalledTimes(1)
  const payload = jest.mocked(processPaymentGatewayWebhookJob).mock.calls[0][1]
  expect(isTrustedWebhookDispatch(payload)).toBe(true)
  expect(payload).toMatchObject({ providerKey: 'mock_processing', transactionId: transaction.id, scope,
    event: { idempotencyKey: `agency-demo-capture:${transaction.id}`, data: { id: transaction.providerSessionId, amount: 2500 } } })
  expect(handler.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(processPaymentGatewayWebhookJob).mock.invocationCallOrder[0])
})

test('failed-session retry preserves order/payment/history and replays the same native attempt', async () => {
  const order = Object.assign(new SalesOrder(), { ...scope, id: 'order', currencyCode: 'PLN', grandTotalGrossAmount: '2500' })
  const payment = Object.assign(new SalesPayment(), { ...scope, id: 'payment', order, currencyCode: 'PLN', amount: '2500', capturedAmount: '0', refundedAmount: '0' })
  const failed = Object.assign(new GatewayTransaction(), { ...scope, id: 'failed', paymentId: payment.id, providerKey: 'mock_processing',
    providerSessionId: 'failed_session', amount: '2500', currencyCode: 'PLN', unifiedStatus: 'failed', capturedAmount: '0' })
  const replacement = Object.assign(new GatewayTransaction(), failed, { id: 'replacement', providerSessionId: 'replacement_session', unifiedStatus: 'pending' })
  let current = failed
  const findOne = jest.fn(async (_entity: unknown, where: { providerSessionId?: string }) =>
    where.providerSessionId ? (where.providerSessionId === failed.providerSessionId ? failed : null) : current)
  const createPaymentSession = jest.fn(async () => { current = replacement; return { transaction: replacement } })
  const services = { em: { fork: () => ({ findOne }) }, paymentGatewayService: { createPaymentSession } }
  const container = { resolve: (name: string) => services[name as keyof typeof services] } as unknown as AwilixContainer
  const gateway = createDemoPaymentGateway(container, scope)

  expect(await gateway.retrySession(order, payment, 'failed_session')).toBe(replacement)
  expect(await gateway.retrySession(order, payment, 'failed_session')).toBe(replacement)
  replacement.unifiedStatus = 'failed'
  expect(await gateway.retrySession(order, payment, 'failed_session')).toBe(replacement)
  expect(createPaymentSession).toHaveBeenCalledTimes(1)
  expect(createPaymentSession).toHaveBeenCalledWith(expect.objectContaining({ ...scope, orderId: order.id, paymentId: payment.id,
    providerKey: 'mock_processing', amount: 2500, currencyCode: 'PLN', captureMethod: 'manual', idempotencyKey: 'agency-demo:payment:retry:failed' }))
  expect(failed.unifiedStatus).toBe('failed')
  expect(payment.capturedAmount).toBe('0')
  expect(findOne).toHaveBeenCalledWith(GatewayTransaction, { ...scope, paymentId: payment.id, providerKey: 'mock_processing', deletedAt: null },
    { orderBy: { createdAt: 'desc', id: 'desc' } })

  await expect(gateway.retrySession(order, payment, 'foreign_session')).rejects.toMatchObject({ status: 409 })
  for (const status of ['pending', 'authorized', 'captured', 'refunded']) {
    failed.unifiedStatus = status
    await expect(gateway.retrySession(order, payment, 'failed_session')).rejects.toMatchObject({ status: 409 })
  }
  failed.unifiedStatus = 'failed'
  payment.capturedAmount = '2500'
  await expect(gateway.retrySession(order, payment, 'failed_session')).rejects.toMatchObject({ status: 409 })
  expect(createPaymentSession).toHaveBeenCalledTimes(1)
})
