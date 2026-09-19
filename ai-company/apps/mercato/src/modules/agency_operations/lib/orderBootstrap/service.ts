import type { AwilixContainer } from 'awilix'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomerUser } from '@open-mercato/core/modules/customer_accounts/data/entities'
import type { SalesOrder, SalesPayment } from '@open-mercato/core/modules/sales/data/entities'
import type { GatewayTransaction } from '@open-mercato/core/modules/payment_gateways/data/entities'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  demoPurchaseRequestSchema, demoPaymentRetrySchema, purchaseIdentitySchema,
  type ActivatePaidPurchase, type DemoPurchaseReceipt, type DemoPurchaseService, type PurchaseIdentity,
} from './contracts'
import { createActivatePaidPurchase } from './activate'
import { readDemoPurchaseConfiguration } from './configure'
import { demoOffer, isDemoPurchaseEnabled } from './demoOffer'
import { createNativeDemoSales, purchaseRequestHash, readPurchaseBinding } from './nativeSales'
import { createDemoPaymentGateway, isRetryableDemoPayment, isVerifiedDemoCapture, matchesDemoPayment } from './payment'
import { createPaidCaseAnalysisBootstrap, createPaidCaseAnalysisReader } from '../paidCaseAnalysis/bootstrap'

function requireEnabled(): void {
  if (!isDemoPurchaseEnabled()) throw new CrudHttpError(403, { error: 'Demo purchases are disabled.' })
}

export function assertPurchaseOwner(order: SalesOrder, identity: PurchaseIdentity): void {
  const binding = readPurchaseBinding(order)
  if (order.tenantId !== identity.tenantId || order.organizationId !== identity.organizationId
    || order.customerEntityId !== identity.customerEntityId || binding.customerUserId !== identity.customerUserId) {
    throw new CrudHttpError(404, { error: 'Purchase not found.' })
  }
}

export function purchaseReceipt(order: SalesOrder, payment: SalesPayment, transaction: GatewayTransaction | null): DemoPurchaseReceipt {
  const binding = readPurchaseBinding(order)
  const base = { orderId: order.id, paymentId: payment.id, providerSessionId: transaction?.providerSessionId ?? null,
    caseId: binding.caseId ?? null, workflowInstanceId: binding.workflowInstanceId ?? null, canConfirmPayment: false }
  if (!transaction) return { ...base, status: 'pending_payment' }
  if (!matchesDemoPayment(order, payment, transaction)) {
    return { ...base, status: 'blocked', reason: 'Native payment does not match this demo purchase.' }
  }
  if (isVerifiedDemoCapture(order, payment, transaction)) {
    return binding.caseId && binding.workflowInstanceId && Number(payment.capturedAmount) === demoOffer.amount
      ? { ...base, status: 'paid' }
      : { ...base, status: 'blocked', reason: 'Test payment captured; purchase activation needs confirmation retry.', canConfirmPayment: true }
  }
  if (!['pending', 'authorized'].includes(transaction.unifiedStatus)) {
    return { ...base, status: 'blocked', reason: `Native test payment is ${transaction.unifiedStatus}.`,
      canRetryPayment: !binding.caseId && !binding.workflowInstanceId && isRetryableDemoPayment(order, payment, transaction) }
  }
  return { ...base, status: 'pending_payment', canConfirmPayment: Boolean(transaction.providerSessionId) }
}

export function createDemoPurchaseService(container: AwilixContainer, activateOverride?: ActivatePaidPurchase): DemoPurchaseService {
  const activatePaidPurchase = activateOverride ?? createActivatePaidPurchase(container)
  const startPaidAnalysis = createPaidCaseAnalysisBootstrap(container)
  const readPaidAnalysis = createPaidCaseAnalysisReader(container)
  async function activeCustomer(identity: PurchaseIdentity, em: EntityManager, lock: boolean): Promise<void> {
    const user = await findOneWithDecryption(em, CustomerUser, {
      id: identity.customerUserId, tenantId: identity.tenantId, organizationId: identity.organizationId,
      customerEntityId: identity.customerEntityId, isActive: true, deletedAt: null,
    }, lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : undefined,
    { tenantId: identity.tenantId, organizationId: identity.organizationId })
    if (!user) throw new CrudHttpError(403, { error: 'Active customer account required.' })
  }
  async function dependencies(identity: PurchaseIdentity) {
    const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
    const config = await readDemoPurchaseConfiguration(container, scope)
    return { sales: createNativeDemoSales(container, config), gateway: createDemoPaymentGateway(container, scope) }
  }
  async function locked<T>(identity: PurchaseIdentity, run: () => Promise<T>): Promise<T> {
    requireEnabled()
    purchaseIdentitySchema.parse(identity)
    // Sales/payment commands use their own transactions. Locking the customer user
    // serializes our requests without deadlocking their native parent-order locks.
    return container.resolve<EntityManager>('em').fork().transactional(async (em) => {
      await activeCustomer(identity, em, true)
      return run()
    })
  }
  return {
    async start(identity, rawInput) {
      const input = demoPurchaseRequestSchema.parse(rawInput)
      if (input.offerVersion !== demoOffer.offerVersion || input.termsVersion !== demoOffer.termsVersion) {
        throw new CrudHttpError(409, { error: 'Reload the current demo offer and terms before purchasing.' })
      }
      return locked(identity, async () => {
        const { sales, gateway } = await dependencies(identity)
        const order = await sales.ensureOrder(identity, input)
        assertPurchaseOwner(order, identity)
        if (readPurchaseBinding(order).requestHash !== purchaseRequestHash(input)) {
          throw new CrudHttpError(409, { error: 'This purchase request ID was already used with different details.' })
        }
        const payment = await sales.ensurePayment(order)
        const transaction = await gateway.ensureSession(order, payment)
        return purchaseReceipt(order, payment, transaction)
      })
    },
    async retryPayment(identity, orderId, rawInput) {
      const input = demoPaymentRetrySchema.parse(rawInput)
      return locked(identity, async () => {
        const { sales, gateway } = await dependencies(identity)
        const order = await sales.loadOrder(orderId)
        assertPurchaseOwner(order, identity)
        const binding = readPurchaseBinding(order)
        if (binding.caseId || binding.workflowInstanceId) throw new CrudHttpError(409, { error: 'This purchase is already activated.' })
        const payment = await sales.loadPayment(orderId)
        if (!payment) throw new CrudHttpError(409, { error: 'Start this purchase payment first.' })
        return purchaseReceipt(order, payment, await gateway.retrySession(order, payment, input.providerSessionId))
      })
    },
    async confirm(identity, orderId) {
      let launch: (() => Promise<void>) | undefined
      const receipt = await locked(identity, async () => {
        const { sales, gateway } = await dependencies(identity)
        let order = await sales.loadOrder(orderId)
        assertPurchaseOwner(order, identity)
        const binding = readPurchaseBinding(order)
        let payment = await sales.loadPayment(orderId)
        if (!payment) throw new CrudHttpError(409, { error: 'Start this purchase payment first.' })
        let transaction = await gateway.read(payment.id)
        if (!transaction) throw new CrudHttpError(409, { error: 'Start this purchase payment session first.' })
        const currentReceipt = purchaseReceipt(order, payment, transaction)
        if (!currentReceipt.canConfirmPayment) return currentReceipt
        transaction = await gateway.confirm(transaction)
        if (!isVerifiedDemoCapture(order, payment, transaction)) return purchaseReceipt(order, payment, transaction)
        await sales.reconcileCaptured(payment)
        if (!binding.caseId || !binding.workflowInstanceId) {
          const activation = await activatePaidPurchase({ identity, caseId: binding.reservedCaseId,
            orderId, paymentId: payment.id, originalPurchase: binding.originalPurchase, termsAcceptedAt: binding.termsAcceptedAt })
          if (activation.caseId !== binding.reservedCaseId) throw new Error('Purchase activation returned an unexpected case.')
          order = await sales.saveActivation(orderId, { caseId: activation.caseId, workflowInstanceId: activation.workflowInstanceId })
          launch = activation.launch
        }
        payment = await sales.loadPayment(orderId)
        if (!payment) throw new Error('The native payment disappeared after reconciliation.')
        return purchaseReceipt(order, payment, transaction)
      })
      // The research step is async and paid: dispatch it only once the purchase rows are committed.
      if (launch) {
        await launch()
        return receipt.status === 'paid' ? { ...receipt, processing: await readPaidAnalysis(identity, orderId) } : receipt
      }
      // Reconfirmation recovers a committed, not-yet-dispatched activation;
      // the bootstrap recognizes both current and historical purchase layouts.
      return receipt.status === 'paid' ? { ...receipt, processing: await startPaidAnalysis(identity, orderId) } : receipt
    },
    async read(identity, orderId) {
      requireEnabled()
      purchaseIdentitySchema.parse(identity)
      await activeCustomer(identity, container.resolve<EntityManager>('em').fork(), false)
      const { sales, gateway } = await dependencies(identity)
      const order = await sales.loadOrder(orderId)
      assertPurchaseOwner(order, identity)
      const payment = await sales.loadPayment(orderId)
      if (!payment) throw new CrudHttpError(409, { error: 'Purchase payment initiation is incomplete; retry the original request.' })
      const receipt = purchaseReceipt(order, payment, await gateway.read(payment.id))
      return receipt.status === 'paid' ? { ...receipt, processing: await readPaidAnalysis(identity, orderId) } : receipt
    },
  }
}
