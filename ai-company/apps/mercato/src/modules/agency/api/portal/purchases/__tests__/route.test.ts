/** @jest-environment node */
const getAuth = jest.fn(), start = jest.fn(), read = jest.fn(), confirm = jest.fn(), guards = jest.fn(), afterSuccess = jest.fn()
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({ getCustomerAuthFromRequest: () => getAuth() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => ({ resolve: () => ({ start, read, confirm }) }) }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: (input: unknown) => guards(input) }))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({ resolveTranslations: async () => ({ translate: (key: string) => key }) }))
jest.mock('@/modules/agency_operations/lib/orderBootstrap/demoOffer', () => ({ readDemoOffer: () => ({ enabled: false, demoOnly: true, amount: 2500, currency: 'PLN' }) }))

import { GET as offer, POST as purchase } from '../route'
import { GET as detail } from '../[id]/route'
import { POST as confirmation } from '../[id]/confirm/route'

const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const auth = { sub: uuid(1), tenantId: uuid(2), orgId: uuid(3), customerEntityId: uuid(4), resolvedFeatures: ['portal.*'] }
const identity = { customerUserId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, customerEntityId: auth.customerEntityId }
const context = { params: { id: uuid(5) } }
const receipt = { orderId: uuid(5), paymentId: uuid(6), providerSessionId: null, status: 'pending_payment', caseId: null, workflowInstanceId: null }
const payload = { requestId: uuid(7), offerVersion: 'demo-v1', termsVersion: 'terms-v1', acceptedTerms: true, buyer: {
  brandDisplayName: 'Acme', brandWebsiteUrl: 'https://example.com', market: 'Poland', language: 'pl', contactName: 'Buyer', contactEmail: 'buyer@example.com',
  billingBuyerType: 'company', billingLegalName: 'Acme', billingCountry: 'PL', billingAddress: 'Demo street', billingTaxId: 'TEST', officialSocialUrl: '', purchaseGoal: '',
} }
const request = (body?: unknown) => new Request('http://localhost/api/agency/portal/purchases', body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  start.mockResolvedValue(receipt); read.mockResolvedValue(receipt); confirm.mockResolvedValue(receipt)
  guards.mockResolvedValue({ ok: true, runAfterSuccess: afterSuccess })
})

test('offer and all purchase endpoints require a linked native customer', async () => {
  for (const actor of [null, { ...auth, customerEntityId: null }]) {
    getAuth.mockResolvedValue(actor)
    const status = actor ? 403 : 401
    expect((await offer(request())).status).toBe(status)
    expect((await purchase(request(payload))).status).toBe(status)
    expect((await detail(request(), context)).status).toBe(status)
    expect((await confirmation(request({}), context)).status).toBe(status)
  }
  expect(start).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled()
})

test('plain offer/receipt shapes retain server authority and session identity', async () => {
  expect(await (await offer(request())).json()).toEqual({ enabled: false, demoOnly: true, amount: 2500, currency: 'PLN' })
  const response = await purchase(request(payload))
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual(receipt)
  expect(start).toHaveBeenCalledWith(identity, payload)
  expect(afterSuccess).toHaveBeenCalledTimes(1)
  expect((await purchase(request({ ...payload, amount: 1, status: 'paid' }))).status).toBe(400)
  expect(start).toHaveBeenCalledTimes(1)
})

test('confirmation verifies customer ownership before mutation guards and never accepts client payment status', async () => {
  guards.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 403 }) })
  expect((await confirmation(request({}), context)).status).toBe(403)
  expect(read).toHaveBeenCalledWith(identity, context.params.id)
  expect(confirm).not.toHaveBeenCalled()
  expect((await confirmation(request({ status: 'paid' }), context)).status).toBe(400)
  expect((await confirmation(request({}), context)).status).toBe(200)
  expect(confirm).toHaveBeenCalledWith(identity, context.params.id)
})
