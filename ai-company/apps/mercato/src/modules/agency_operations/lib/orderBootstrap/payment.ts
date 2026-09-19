import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import { GatewayTransaction } from '@open-mercato/core/modules/payment_gateways/data/entities'
import type { PaymentGatewayService } from '@open-mercato/core/modules/payment_gateways/lib/gateway-service'
import { processPaymentGatewayWebhookJob } from '@open-mercato/core/modules/payment_gateways/lib/webhook-processor'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import type { IntegrationLogService } from '@open-mercato/core/modules/integrations/lib/log-service'
import type { SalesOrder, SalesPayment } from '@open-mercato/core/modules/sales/data/entities'
import { getWebhookHandler } from '@open-mercato/shared/modules/payment_gateways/types'
import { markQueueJobOrigin } from '@open-mercato/shared/lib/queue/dispatchOrigin'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { computeMockWebhookSignature, MOCK_GATEWAY_DEV_WEBHOOK_SECRET, MOCK_GATEWAY_SIGNATURE_HEADER } from '@/modules/example/lib/mock-gateway-adapter'
import { demoOffer, isDemoPurchaseEnabled } from './demoOffer'

export function matchesDemoPayment(order: SalesOrder, payment: SalesPayment, transaction: GatewayTransaction): boolean {
  return payment.order?.id === order.id
    && transaction.paymentId === payment.id
    && transaction.providerKey === demoOffer.provider
    && [payment, transaction].every((record) => record.tenantId === order.tenantId
      && record.organizationId === order.organizationId
      && record.currencyCode === demoOffer.currency && Number(record.amount) === demoOffer.amount)
    && order.currencyCode === demoOffer.currency && Number(order.grandTotalGrossAmount) === demoOffer.amount
    && Number(payment.refundedAmount) === 0
}

export function isVerifiedDemoCapture(order: SalesOrder, payment: SalesPayment, transaction: GatewayTransaction): boolean {
  return matchesDemoPayment(order, payment, transaction)
    && transaction.unifiedStatus === 'captured' && Number(transaction.capturedAmount) === demoOffer.amount
}

export function isRetryableDemoPayment(order: SalesOrder, payment: SalesPayment, transaction: GatewayTransaction): boolean {
  return matchesDemoPayment(order, payment, transaction) && transaction.unifiedStatus === 'failed'
    && Boolean(transaction.providerSessionId) && Number(transaction.capturedAmount) === 0 && Number(payment.capturedAmount) === 0
}

export function createDemoPaymentGateway(container: AwilixContainer, scope: { tenantId: string; organizationId: string }) {
  // Confirmation holds a customer lock in a native transaction. The gateway
  // service writes there; a detached read would still see its old pending state.
  const manager = () => container.resolve<EntityManager>('em').fork({ keepTransactionContext: true })
  const gateway = container.resolve<PaymentGatewayService>('paymentGatewayService')
  async function read(paymentId: string): Promise<GatewayTransaction | null> {
    return manager().findOne(GatewayTransaction, {
      paymentId, providerKey: demoOffer.provider, ...scope, deletedAt: null,
    }, { orderBy: { createdAt: 'desc', id: 'desc' } })
  }
  async function createSession(order: SalesOrder, payment: SalesPayment, idempotencyKey: string): Promise<GatewayTransaction> {
    const result = await gateway.createPaymentSession({
      ...scope, providerKey: demoOffer.provider, paymentId: payment.id, orderId: order.id,
      idempotencyKey, amount: demoOffer.amount,
      currencyCode: demoOffer.currency, captureMethod: 'manual', description: demoOffer.name,
      metadata: { demoOnly: true, orderId: order.id, source: 'agency-demo-purchase' },
    })
    return result.transaction
  }
  async function ensureSession(order: SalesOrder, payment: SalesPayment): Promise<GatewayTransaction> {
    return await read(payment.id) ?? createSession(order, payment, `agency-demo:${payment.id}`)
  }
  async function retrySession(order: SalesOrder, payment: SalesPayment, providerSessionId: string): Promise<GatewayTransaction> {
    const previous = await manager().findOne(GatewayTransaction, {
      paymentId: payment.id, providerKey: demoOffer.provider, providerSessionId, ...scope, deletedAt: null,
    })
    if (!previous || !isRetryableDemoPayment(order, payment, previous)) {
      throw new CrudHttpError(409, { error: 'Only this order’s failed, uncaptured demo payment can be retried.' })
    }
    const current = await read(payment.id)
    // Replay of an earlier failed attempt must not create another session,
    // including when its replacement has since failed too.
    if (current && current.id !== previous.id) return current
    return createSession(order, payment, `agency-demo:${payment.id}:retry:${previous.id}`)
  }
  async function confirm(transaction: GatewayTransaction): Promise<GatewayTransaction> {
    if (!isDemoPurchaseEnabled() || transaction.providerKey !== demoOffer.provider) {
      throw new CrudHttpError(403, { error: 'Demo payments are disabled.' })
    }
    if (transaction.unifiedStatus === 'captured') return transaction
    if (!['pending', 'authorized'].includes(transaction.unifiedStatus) || !transaction.providerSessionId) {
      throw new CrudHttpError(409, { error: 'This test payment cannot be confirmed.' })
    }
    const registration = getWebhookHandler(demoOffer.provider)
    if (!registration) throw new CrudHttpError(409, { error: 'The native demo webhook provider is not registered.' })
    const credentials = await container.resolve<CredentialsService>('integrationCredentialsService')
      .resolve(`gateway_${demoOffer.provider}`, scope) ?? {}
    const configuredSecret = typeof credentials.webhookSecret === 'string' ? credentials.webhookSecret.trim() : ''
    const secret = configuredSecret || process.env.MOCK_GATEWAY_WEBHOOK_SECRET?.trim() || MOCK_GATEWAY_DEV_WEBHOOK_SECRET
    const rawBody = JSON.stringify({
      id: `agency-demo-capture:${transaction.id}`, type: 'payment.captured',
      data: { id: transaction.providerSessionId, status: 'captured', amount: demoOffer.amount, currency: demoOffer.currency },
    })
    // This is a labelled zero-charge simulator, not a client-supplied payment status.
    // Use the registered provider's signature verifier and the native webhook processor.
    const event = await registration.handler({
      rawBody, headers: { [MOCK_GATEWAY_SIGNATURE_HEADER]: computeMockWebhookSignature(rawBody, secret) }, credentials,
    })
    await processPaymentGatewayWebhookJob({
      em: manager(), paymentGatewayService: gateway,
      integrationLogService: container.resolve<IntegrationLogService>('integrationLogService'),
    }, markQueueJobOrigin({ providerKey: demoOffer.provider, event, transactionId: transaction.id, scope }, 'inbound-webhook'))
    const updated = await read(transaction.paymentId)
    if (!updated) throw new Error('The native gateway transaction disappeared.')
    return updated
  }
  return { read, ensureSession, retrySession, confirm }
}
