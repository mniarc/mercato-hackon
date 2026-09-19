/** @jest-environment node */
import type { AwilixContainer } from 'awilix'
import { SalesOrder, SalesQuote } from '@open-mercato/core/modules/sales/data/entities'
import { selectBestPrice } from '@open-mercato/core/modules/catalog/lib/pricing'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createNativeDemoSales, readPurchaseBinding } from '../nativeSales'
import { readPurchaseHistory } from '../purchaseSnapshot'
import { demoOffer } from '../demoOffer'
import type { DemoPurchaseRequest } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/catalog/lib/pricing', () => ({ selectBestPrice: jest.fn() }))
const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const identity = { ...scope, customerEntityId: uuid(3), customerUserId: uuid(4) }
const originalOffer = structuredClone(demoOffer)
const input: DemoPurchaseRequest = { requestId: uuid(5), offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion, acceptedTerms: true,
  buyer: { brandDisplayName: 'Brand', brandWebsiteUrl: 'https://example.test', market: 'PL', language: 'pl', contactName: 'Customer', contactEmail: 'customer@example.test',
    billingBuyerType: 'individual', billingLegalName: 'Customer', billingCountry: 'PL', billingAddress: 'Address', billingTaxId: '', officialSocialUrl: '', purchaseGoal: '' } }
let quote: SalesQuote | null, order: SalesOrder | null
const execute = jest.fn()
const em = { findOne: jest.fn(), fork() { return this } }
const container = { resolve: (name: string) => name === 'em' ? em : { execute } } as unknown as AwilixContainer
const config = { ...scope, executionUserId: uuid(6), priceId: uuid(7), productId: uuid(8), productVariantId: uuid(9), channelId: uuid(10), paymentMethodId: uuid(11), taxRateId: uuid(12) }
beforeEach(() => {
  jest.clearAllMocks(); quote = null; order = null
  Object.assign(demoOffer, structuredClone(originalOffer))
  const price = { id: config.priceId, currencyCode: 'PLN', unitPriceGross: 2500, unitPriceNet: 2500, taxRate: 0 }
  em.findOne.mockResolvedValue(price)
  jest.mocked(selectBestPrice).mockReturnValue(price as never)
  jest.mocked(findWithDecryption).mockImplementation(async (_em, entity) => (entity === SalesOrder ? order ? [order] : [] : quote ? [quote] : []) as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity) => (entity === SalesOrder ? order : quote) as never)
  execute.mockImplementation(async (name, options) => {
    if (name === 'sales.quotes.create') {
      quote = Object.assign(new SalesQuote(), { id: uuid(20), ...scope, customerEntityId: identity.customerEntityId, currencyCode: 'PLN', grandTotalGrossAmount: '2500', metadata: options.input.metadata })
      return { result: { quoteId: quote.id } }
    }
    if (name === 'sales.quotes.convert_to_order') {
      order = Object.assign(new SalesOrder(), quote, { metadata: structuredClone(quote!.metadata) })
    }
    return { result: {} }
  })
})
afterEach(() => { Object.assign(demoOffer, structuredClone(originalOffer)) })

test('native quote creation captures server text once; existing-order recovery preserves it after the current offer changes', async () => {
  const sales = createNativeDemoSales(container, config as never)
  const created = await sales.ensureOrder(identity, input)
  const accepted = readPurchaseBinding(created)
  expect(accepted.acceptedOffer).toEqual(originalOffer)
  expect(accepted.acceptedOffer).not.toBe(demoOffer)
  expect(execute).toHaveBeenCalledWith('sales.quotes.create', expect.objectContaining({ input: expect.objectContaining({
    metadata: { agencyPurchase: expect.objectContaining({ acceptedOffer: originalOffer, termsAcceptedAt: expect.any(String) }) },
    lines: [expect.objectContaining({ productId: config.productId, productVariantId: config.productVariantId, priceId: config.priceId })],
  }) }))
  Object.assign(demoOffer, { name: 'Later catalogue name', offerVersion: 'later-offer', termsVersion: 'later-terms', terms: { en: 'Later terms', pl: 'Późniejsze warunki' } })
  const retried = await sales.ensureOrder(identity, input)
  expect(retried.id).toBe(created.id)
  expect(readPurchaseHistory(readPurchaseBinding(retried))).toEqual({ state: 'available',
    acceptedAt: accepted.termsAcceptedAt, offerVersion: originalOffer.offerVersion, termsVersion: originalOffer.termsVersion, offer: originalOffer })
  expect(execute).toHaveBeenCalledTimes(2)
})

test('a legacy order retains its recorded version IDs and timestamp without substituting current terms', async () => {
  const created = await createNativeDemoSales(container, config as never).ensureOrder(identity, input)
  const { acceptedOffer: _snapshot, ...legacy } = readPurchaseBinding(created)
  created.metadata = { agencyPurchase: legacy }
  const history = readPurchaseHistory(readPurchaseBinding(created))
  expect(history).toEqual({ state: 'unavailable', reason: 'content_not_recorded',
    acceptedAt: legacy.termsAcceptedAt, offerVersion: legacy.offerVersion, termsVersion: legacy.termsVersion })
  expect(history).not.toHaveProperty('offer')
})
