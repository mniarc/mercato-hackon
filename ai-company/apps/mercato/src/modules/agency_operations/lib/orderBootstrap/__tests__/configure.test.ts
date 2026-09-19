/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { configureDemoPurchase, readDemoPurchaseConfiguration } from '../configure'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const input = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3) }
const records = new Map<string, unknown>()
const getRecord = jest.fn()
const setValue = jest.fn()
const execute = jest.fn()
const allowed = jest.fn()
const container = { resolve: (name: string) => ({
  moduleConfigService: { getRecord, setValue }, rbacService: { userHasAllFeatures: allowed },
  em: { fork: () => ({}) }, commandBus: { execute },
} as Record<string, unknown>)[name] } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks(); records.clear()
  allowed.mockResolvedValue(true)
  getRecord.mockImplementation(async (_module: string, name: string) => records.has(name) ? { source: 'tenant', tenantId: input.tenantId, value: records.get(name) } : null)
  setValue.mockImplementation(async (_module: string, name: string, value: unknown) => { records.set(name, value) })
  jest.mocked(findOneWithDecryption).mockResolvedValue(null)
  let priceCreated = false
  let nextId = 10
  execute.mockImplementation(async (command: string) => {
    const key = ({ 'sales.channels.create': 'channelId', 'sales.tax-rates.create': 'taxRateId', 'sales.payment-methods.create': 'paymentMethodId',
      'catalog.products.create': 'productId', 'catalog.variants.create': 'variantId', 'catalog.priceKinds.create': 'priceKindId', 'catalog.prices.create': 'priceId',
      'sales.payment-statuses.create': 'entryId', 'sales.order-statuses.create': 'entryId' } as Record<string, string>)[command]
    if (command === 'catalog.prices.create') priceCreated = true
    return { result: { [key]: uuid(nextId++) } }
  })
  jest.mocked(findWithDecryption).mockImplementation(async () => priceCreated ? [{ id: uuid(16), unitPriceGross: '2500', unitPriceNet: '2500', taxRate: '0', minQuantity: 1, maxQuantity: 1, priceKind: { code: 'demo' } }] as never : [] as never)
})

test('provisions through native commands, calculates the zero-tax demo amount, and reuses scoped configuration', async () => {
  const config = await configureDemoPurchase(container, input)
  expect(config).toMatchObject({ tenantId: input.tenantId, organizationId: input.organizationId, executionUserId: input.userId, currencyCode: 'PLN' })
  expect(execute).toHaveBeenCalledWith('sales.payment-methods.create', expect.objectContaining({ input: expect.objectContaining({ providerKey: 'mock_processing' }) }))
  expect(execute).toHaveBeenCalledWith('sales.tax-rates.create', expect.objectContaining({ input: expect.objectContaining({ rate: 0, isDefault: false }) }))
  expect(execute).toHaveBeenCalledWith('catalog.prices.create', expect.objectContaining({ input: expect.objectContaining({ unitPriceGross: 2500, taxRate: 0, currencyCode: 'PLN' }) }))
  const count = execute.mock.calls.length
  expect(await configureDemoPurchase(container, input)).toEqual(config)
  expect(execute).toHaveBeenCalledTimes(count)
  expect(await readDemoPurchaseConfiguration(container, input)).toEqual(config)
  await expect(readDemoPurchaseConfiguration(container, { ...input, organizationId: uuid(99) })).rejects.toMatchObject({ status: 409 })
})
test('a tenant/global fallback cannot supply another organization principal, and unauthorized setup writes nothing', async () => {
  const config = await configureDemoPurchase(container, input)
  getRecord.mockResolvedValue({ source: 'tenant', tenantId: input.tenantId, value: config })
  await expect(readDemoPurchaseConfiguration(container, { ...input, organizationId: uuid(99) })).rejects.toMatchObject({ status: 409 })
  getRecord.mockResolvedValue({ source: 'instance', tenantId: null, value: config })
  await expect(readDemoPurchaseConfiguration(container, input)).rejects.toMatchObject({ status: 409 })
  execute.mockClear(); allowed.mockResolvedValue(false)
  await expect(configureDemoPurchase(container, input)).rejects.toMatchObject({ status: 403 })
  expect(execute).not.toHaveBeenCalled()
})
