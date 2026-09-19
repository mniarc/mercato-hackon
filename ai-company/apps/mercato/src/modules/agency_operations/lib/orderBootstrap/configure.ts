import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands/types'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { ModuleConfigService } from '@open-mercato/core/modules/configs/lib/module-config-service'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { CatalogProduct, CatalogProductVariant, CatalogProductPrice, CatalogPriceKind } from '@open-mercato/core/modules/catalog/data/entities'
import { SalesChannel, SalesPaymentMethod, SalesTaxRate } from '@open-mercato/core/modules/sales/data/entities'
import { DictionaryEntry } from '@open-mercato/core/modules/dictionaries/data/entities'
import { selectBestPrice } from '@open-mercato/core/modules/catalog/lib/pricing'
import { calculateLine } from '@open-mercato/core/modules/sales/lib/calculations'
import { demoOffer } from './demoOffer'

const configurationSchema = z.object({
  tenantId: z.uuid(), organizationId: z.uuid(), executionUserId: z.uuid(), channelId: z.uuid(),
  productId: z.uuid(), productVariantId: z.uuid(), priceId: z.uuid(), priceKindId: z.uuid(), taxRateId: z.uuid(),
  paymentMethodId: z.uuid(), pendingPaymentStatusId: z.uuid(), capturedPaymentStatusId: z.uuid(), pendingOrderStatusId: z.uuid(),
  offerVersion: z.literal(demoOffer.offerVersion), termsVersion: z.literal(demoOffer.termsVersion), currencyCode: z.literal('PLN'),
})
export type DemoPurchaseConfiguration = z.infer<typeof configurationSchema>
type Scope = { tenantId: string; organizationId: string }
// ModuleConfig resolves/cache-keys by tenant, not organization; encode the org in its supported name.
const configName = (scope: Scope) => `demo-purchase-${scope.organizationId}`

async function findConfiguration(container: AppContainer, scope: Scope): Promise<DemoPurchaseConfiguration | null> {
  const record = await container.resolve<ModuleConfigService>('moduleConfigService').getRecord('agency_operations', configName(scope), scope)
  const parsed = configurationSchema.safeParse(record?.value)
  return record?.source === 'tenant' && record.tenantId === scope.tenantId && parsed.success
    && parsed.data.tenantId === scope.tenantId && parsed.data.organizationId === scope.organizationId ? parsed.data : null
}

export async function readDemoPurchaseConfiguration(container: AppContainer, scope: Scope): Promise<DemoPurchaseConfiguration> {
  const configured = await findConfiguration(container, scope)
  if (!configured) throw new CrudHttpError(409, { error: 'Demo purchase is not configured for this organization.' })
  return configured
}

/** Explicit staff setup of a zero-charge fixture. All writes use existing native commands/config service. */
export async function configureDemoPurchase(container: AppContainer, rawInput: unknown): Promise<DemoPurchaseConfiguration> {
  const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).strict().parse(rawInput)
  if (process.env.NODE_ENV === 'production') throw new CrudHttpError(409, { error: 'Demo purchases cannot be configured in production.' })
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  const required = ['agency_research.manage', 'catalog.products.manage', 'catalog.variants.manage', 'catalog.pricing.manage', 'sales.channels.manage', 'sales.settings.manage', 'sales.orders.manage', 'sales.payments.manage']
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, required, scope)) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  const existing = await findConfiguration(container, scope)
  if (existing) return existing
  const em = container.resolve<EntityManager>('em').fork()
  const bus = container.resolve<CommandBus>('commandBus')
  const ctx: CommandRuntimeContext = { container, auth: { sub: input.userId, tenantId: scope.tenantId, orgId: scope.organizationId },
    organizationScope: null, selectedOrganizationId: scope.organizationId, organizationIds: [scope.organizationId] }
  const execute = async <T>(command: string, payload: Record<string, unknown>): Promise<T> => (await bus.execute<Record<string, unknown>, T>(command, { ctx, input: { ...scope, ...payload } })).result
  const metadata = { owner: 'agency_operations.demo_purchase', demoOnly: true, offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion }
  const where = { ...scope, deletedAt: null }
  const code = 'agency-demo-2026-09-19-v1'
  const channel = await findOneWithDecryption(em, SalesChannel, { ...where, code }, undefined, scope)
  const channelId = channel?.id ?? (await execute<{ channelId: string }>('sales.channels.create', {
    code, name: 'Agency demo — no real purchase', isActive: true, metadata,
  })).channelId
  const tax = await findOneWithDecryption(em, SalesTaxRate, { ...where, code: 'agency-demo-zero-tax' }, undefined, scope)
  if (tax && Number(tax.rate) !== 0) throw new CrudHttpError(409, { error: 'Demo zero-tax fixture was changed.' })
  const taxRateId = tax?.id ?? (await execute<{ taxRateId: string }>('sales.tax-rates.create', {
    code: 'agency-demo-zero-tax', name: 'DEMO ONLY zero tax — not production tax treatment', rate: 0, isDefault: false, channelId, metadata,
  })).taxRateId
  const payment = await findOneWithDecryption(em, SalesPaymentMethod, { ...where, code }, undefined, scope)
  if (payment && payment.providerKey !== demoOffer.provider) throw new CrudHttpError(409, { error: 'Demo payment method must use mock_processing.' })
  const paymentMethodId = payment?.id ?? (await execute<{ paymentMethodId: string }>('sales.payment-methods.create', {
    code, name: 'Demo payment — no money charged', providerKey: demoOffer.provider, isActive: true,
    terms: demoOffer.terms.en, providerSettings: { captureMethod: 'manual' }, metadata,
  })).paymentMethodId
  const product = await findOneWithDecryption(em, CatalogProduct, { ...where, sku: demoOffer.sku }, undefined, scope)
  const productId = product?.id ?? (await execute<{ productId: string }>('catalog.products.create', {
    sku: demoOffer.sku, title: demoOffer.name, description: demoOffer.terms.en, primaryCurrencyCode: 'PLN',
    productType: 'simple', isActive: true, requiresShipping: false, taxRateId, taxRate: 0, metadata,
  })).productId
  const variant = await findOneWithDecryption(em, CatalogProductVariant, { ...where, product: productId, sku: `${demoOffer.sku}-UNIT` }, undefined, scope)
  const productVariantId = variant?.id ?? (await execute<{ variantId: string }>('catalog.variants.create', {
    productId, sku: `${demoOffer.sku}-UNIT`, name: 'Demo package', isDefault: true, isActive: true, taxRateId, taxRate: 0, metadata,
  })).variantId
  // Native price kinds are tenant-wide, even when products/channels are organization-scoped.
  const kind = await findOneWithDecryption(em, CatalogPriceKind, { tenantId: scope.tenantId, code, deletedAt: null }, undefined, scope)
  const priceKindId = kind?.id ?? (await execute<{ priceKindId: string }>('catalog.priceKinds.create', {
    code, title: 'Demo 2,500 PLN — zero-charge test', displayMode: 'including-tax', currencyCode: 'PLN', isActive: true,
  })).priceKindId
  let prices = await findWithDecryption(em, CatalogProductPrice, { ...scope, variant: productVariantId, priceKind: priceKindId, channelId, currencyCode: 'PLN' }, { populate: ['priceKind'] }, scope)
  if (!prices.length) {
    await execute<{ priceId: string }>('catalog.prices.create', { productId, variantId: productVariantId, priceKindId,
      currencyCode: 'PLN', unitPriceGross: demoOffer.amount, unitPriceNet: demoOffer.amount, taxRateId, taxRate: 0, channelId, minQuantity: 1, maxQuantity: 1, metadata })
    prices = await findWithDecryption(em, CatalogProductPrice, { ...scope, variant: productVariantId, priceKind: priceKindId, channelId, currencyCode: 'PLN' }, { populate: ['priceKind'] }, scope)
  }
  const price = selectBestPrice(prices, { channelId, quantity: 1, date: new Date() })
  if (!price) throw new CrudHttpError(409, { error: 'Demo catalog price is unavailable.' })
  const totals = await calculateLine({ documentKind: 'order', context: { ...scope, currencyCode: 'PLN' },
    line: { kind: 'product', productId, productVariantId, quantity: 1, currencyCode: 'PLN', unitPriceNet: Number(price.unitPriceNet), unitPriceGross: Number(price.unitPriceGross), taxRate: Number(price.taxRate) } })
  if (totals.grossAmount !== demoOffer.amount || totals.netAmount !== demoOffer.amount || totals.taxAmount !== 0) throw new CrudHttpError(409, { error: 'Demo price must total 2,500 PLN with explicit zero test tax.' })
  const status = async (kind: 'payment' | 'order', value: string) => {
    const entry = await findOneWithDecryption(em, DictionaryEntry, { ...scope, dictionary: { key: `sales.${kind}_status` }, normalizedValue: value }, undefined, scope)
    return entry?.id ?? (await execute<{ entryId: string }>(`sales.${kind}-statuses.create`, { value, label: value[0].toUpperCase() + value.slice(1) })).entryId
  }
  const configured = configurationSchema.parse({ ...scope, executionUserId: input.userId, channelId, productId, productVariantId, priceId: price.id, priceKindId, taxRateId,
    paymentMethodId, pendingPaymentStatusId: await status('payment', 'pending'), capturedPaymentStatusId: await status('payment', 'captured'), pendingOrderStatusId: await status('order', 'pending'),
    offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion, currencyCode: 'PLN',
  })
  await container.resolve<ModuleConfigService>('moduleConfigService').setValue('agency_operations', configName(scope), configured, scope)
  return configured
}
