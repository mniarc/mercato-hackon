import { createHash, randomUUID } from 'node:crypto'
import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { CatalogProductPrice } from '@open-mercato/core/modules/catalog/data/entities'
import { selectBestPrice } from '@open-mercato/core/modules/catalog/lib/pricing'
import { SalesOrder, SalesPayment, SalesQuote } from '@open-mercato/core/modules/sales/data/entities'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands/types'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { demoPurchaseRequestSchema, type DemoPurchaseRequest, type PurchaseIdentity } from './contracts'
import type { DemoPurchaseConfiguration } from './configure'
import { demoOffer } from './demoOffer'
import { purchasedOfferSchema } from './purchaseSnapshot'
import { paymentConfirmationStateSchema, type PaymentConfirmationState } from '../paymentConfirmation/contracts'

export const purchaseBindingSchema = z.object({
  requestId: z.uuid(), requestHash: z.string(), customerUserId: z.uuid(),
  reservedCaseId: z.uuid(), originalPurchase: demoPurchaseRequestSchema,
  termsAcceptedAt: z.iso.datetime(), offerVersion: z.string(), termsVersion: z.string(),
  amount: z.number(), currencyCode: z.string(), provider: z.string(),
  caseId: z.uuid().optional(), workflowInstanceId: z.uuid().optional(),
  acceptedOffer: purchasedOfferSchema.optional(),
  paymentConfirmation: paymentConfirmationStateSchema.optional(),
})
export type PurchaseBinding = z.infer<typeof purchaseBindingSchema>

export function purchaseRequestHash(input: DemoPurchaseRequest): string {
  return createHash('sha256').update(JSON.stringify(demoPurchaseRequestSchema.parse(input))).digest('hex')
}

export function readPurchaseBinding(order: Pick<SalesOrder, 'metadata'>): PurchaseBinding {
  const parsed = purchaseBindingSchema.safeParse(order.metadata?.agencyPurchase)
  if (!parsed.success) throw new CrudHttpError(409, { error: 'Invalid demo purchase binding.' })
  return parsed.data
}

export function assertDemoTotal(document: { currencyCode: string; grandTotalGrossAmount: string }): void {
  if (document.currencyCode !== demoOffer.currency || Number(document.grandTotalGrossAmount) !== demoOffer.amount) {
    throw new CrudHttpError(409, { error: 'Native document total does not match the approved simulated offer.' })
  }
}

export function createNativeDemoSales(container: AwilixContainer, config: DemoPurchaseConfiguration) {
  const manager = () => container.resolve<EntityManager>('em').fork()
  const scope = { tenantId: config.tenantId, organizationId: config.organizationId }
  const ctx: CommandRuntimeContext = {
    container,
    auth: { sub: config.executionUserId, tenantId: config.tenantId, orgId: config.organizationId },
    organizationScope: null, selectedOrganizationId: config.organizationId, organizationIds: [config.organizationId],
  }
  async function command<TResult>(name: string, input: Record<string, unknown>): Promise<TResult> {
    const result = await container.resolve<CommandBus>('commandBus').execute<Record<string, unknown>, TResult>(name, { input, ctx })
    return result.result
  }
  async function loadOrder(id: string): Promise<SalesOrder> {
    const order = await findOneWithDecryption(manager(), SalesOrder, { id, ...scope, deletedAt: null }, undefined, scope)
    if (!order) throw new CrudHttpError(404, { error: 'Purchase not found.' })
    return order
  }
  async function ensureOrder(identity: PurchaseIdentity, input: DemoPurchaseRequest): Promise<SalesOrder> {
    // The caller holds the scoped customer-user row lock throughout lookup/create.
    // Native metadata is encrypted as a whole: scope candidates by native columns,
    // then compare the retry binding only after the supported decryption helper.
    const matching = { ...scope, customerEntityId: identity.customerEntityId, channelId: config.channelId, deletedAt: null }
    const matchesRequest = (document: Pick<SalesOrder, 'metadata'>) => {
      const binding = document.metadata?.agencyPurchase as Partial<PurchaseBinding> | null | undefined
      return binding?.requestId === input.requestId && binding?.customerUserId === identity.customerUserId
    }
    let order = (await findWithDecryption(manager(), SalesOrder, matching, undefined, scope)).find(matchesRequest) ?? null
    if (order) return order
    let quote = (await findWithDecryption(manager(), SalesQuote, matching, undefined, scope)).find(matchesRequest) ?? null
    if (!quote) {
      const price = await manager().findOne(CatalogProductPrice, {
        id: config.priceId, ...scope, product: config.productId, variant: config.productVariantId,
      }, { populate: ['priceKind'] })
      const selected = selectBestPrice(price ? [price] : [], {
        channelId: config.channelId, customerId: identity.customerEntityId, quantity: 1, date: new Date(),
      })
      if (!selected || selected.currencyCode !== demoOffer.currency || Number(selected.unitPriceGross) !== demoOffer.amount
        || Number(selected.taxRate) !== 0 || Number(selected.unitPriceNet) !== demoOffer.amount) {
        throw new CrudHttpError(409, { error: 'Configure the approved zero-tax demo catalog price before purchasing.' })
      }
      const binding: PurchaseBinding = {
        requestId: input.requestId, requestHash: purchaseRequestHash(input), customerUserId: identity.customerUserId,
        reservedCaseId: randomUUID(), originalPurchase: input, termsAcceptedAt: new Date().toISOString(),
        offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion,
        amount: demoOffer.amount, currencyCode: demoOffer.currency, provider: demoOffer.provider,
        acceptedOffer: purchasedOfferSchema.parse(demoOffer),
      }
      const created = await command<{ quoteId: string }>('sales.quotes.create', {
        ...scope, customerEntityId: identity.customerEntityId, channelId: config.channelId,
        currencyCode: demoOffer.currency, paymentMethodId: config.paymentMethodId,
        metadata: { agencyPurchase: binding },
        lines: [{ kind: 'service', name: demoOffer.name, productId: config.productId,
          productVariantId: config.productVariantId, quantity: 1, currencyCode: demoOffer.currency,
          priceId: selected.id, priceMode: 'gross', unitPriceNet: Number(selected.unitPriceNet),
          unitPriceGross: Number(selected.unitPriceGross), taxRateId: config.taxRateId, taxRate: 0 }],
      })
      quote = await findOneWithDecryption(manager(), SalesQuote, { id: created.quoteId, ...scope, deletedAt: null }, undefined, scope)
      if (!quote) throw new Error('Native quote creation returned no persisted quote.')
    }
    if (readPurchaseBinding(quote).requestHash !== purchaseRequestHash(input)) {
      throw new CrudHttpError(409, { error: 'This purchase request ID was already used with different details.' })
    }
    assertDemoTotal(quote)
    // Native conversion uses the quote ID for the order: recovery is stable even if
    // conversion committed before a request was interrupted.
    order = await findOneWithDecryption(manager(), SalesOrder, { id: quote.id, ...scope, deletedAt: null }, undefined, scope)
    if (!order) {
      await command('sales.quotes.convert_to_order', { quoteId: quote.id })
      order = await loadOrder(quote.id)
    }
    assertDemoTotal(order)
    return order
  }
  async function loadPayment(orderId: string): Promise<SalesPayment | null> {
    return findOneWithDecryption(manager(), SalesPayment, {
      ...scope, order: orderId, paymentReference: `agency-demo:${orderId}`, deletedAt: null,
    }, undefined, scope)
  }
  async function ensurePayment(order: SalesOrder): Promise<SalesPayment> {
    let payment = await loadPayment(order.id)
    if (!payment) {
      await command('sales.payments.create', {
        ...scope, orderId: order.id, paymentMethodId: config.paymentMethodId,
        paymentReference: `agency-demo:${order.id}`, statusEntryId: config.pendingPaymentStatusId,
        amount: demoOffer.amount, currencyCode: demoOffer.currency, capturedAmount: 0,
        // Native sales totals count allocations, including pending payments.
        // Keep the full amount due until the provider confirms capture.
        allocations: [{ orderId: order.id, amount: 0, currencyCode: demoOffer.currency }],
        metadata: { demoOnly: true, source: 'agency-demo-purchase' },
      })
      payment = await loadPayment(order.id)
    }
    if (!payment) throw new Error('Native payment creation returned no persisted payment.')
    return payment
  }
  async function reconcileCaptured(payment: SalesPayment): Promise<void> {
    if (Number(payment.capturedAmount) === demoOffer.amount && payment.statusEntryId === config.capturedPaymentStatusId) return
    await command('sales.payments.update', {
      id: payment.id, capturedAmount: demoOffer.amount, capturedAt: new Date(),
      statusEntryId: config.capturedPaymentStatusId,
      allocations: [{ orderId: payment.order!.id, amount: demoOffer.amount, currencyCode: demoOffer.currency }],
    })
  }
  async function saveActivation(orderId: string, activation: { caseId: string; workflowInstanceId: string }): Promise<SalesOrder> {
    const order = await loadOrder(orderId)
    await command('sales.orders.update', { id: orderId,
      metadata: { ...order.metadata, agencyPurchase: { ...readPurchaseBinding(order), ...activation } },
    })
    return loadOrder(orderId)
  }
  async function savePaymentConfirmation(orderId: string, confirmation: PaymentConfirmationState): Promise<SalesOrder> {
    const order = await loadOrder(orderId)
    await command('sales.orders.update', { id: orderId,
      metadata: { ...order.metadata, agencyPurchase: { ...readPurchaseBinding(order), paymentConfirmation: confirmation } },
    })
    return loadOrder(orderId)
  }
  return { loadOrder, ensureOrder, loadPayment, ensurePayment, reconcileCaptured, saveActivation, savePaymentConfirmation }
}
