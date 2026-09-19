import { GET, POST } from '../route'
import { getCustomerAuthFromRequest, requireCustomerFeature } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'

jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({ getCustomerAuthFromRequest: jest.fn(), requireCustomerFeature: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const auth = { sub: uuid(1), tenantId: uuid(2), orgId: uuid(3), customerEntityId: uuid(4) }
const taskId = uuid(5)
const payload = { channel: 'portal', kind: 'approval', strategy: { documentId: uuid(6), versionId: uuid(7) }, tov: { documentId: uuid(8), versionId: uuid(9) }, approvedDocuments: ['strategy'], externalEventId: 'event' }
const read = jest.fn(), respond = jest.fn(), after = jest.fn()
const context = { params: { id: taskId } }
const request = (data: unknown = payload) => new Request(`http://localhost/api/agency/strategy-reviews/${taskId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getCustomerAuthFromRequest).mockResolvedValue(auth as never)
  jest.mocked(createRequestContainer).mockResolvedValue({ resolve: (key: string) => key === 'agencyStrategyPairReviewService' ? { read, respond } : {} } as never)
  jest.mocked(runRouteMutationGuards).mockResolvedValue({ ok: true, runAfterSuccess: after } as never)
  read.mockResolvedValue({ ok: true, review: {}, canRespond: false })
  respond.mockResolvedValue({ requestId: uuid(10), status: 'response_received', replayed: false })
})
test('requires native customer authentication before reading', async () => {
  jest.mocked(getCustomerAuthFromRequest).mockResolvedValue(null)
  expect((await GET(new Request('http://localhost'), context)).status).toBe(401)
  expect(read).not.toHaveBeenCalled()
})
test('reads the actual task-bound projection', async () => {
  expect((await GET(new Request('http://localhost'), context)).status).toBe(200)
  expect(read).toHaveBeenCalledWith(auth, taskId)
  expect(requireCustomerFeature).toHaveBeenCalled()
})
test('forwards original partial selection and both versions once through guarded service', async () => {
  expect((await POST(request(), context)).status).toBe(201)
  expect(respond).toHaveBeenCalledWith(auth, taskId, payload)
  expect(after).toHaveBeenCalledTimes(1)
})
test('ambiguous approval plus message is rejected without mutation', async () => {
  expect((await POST(request({ ...payload, body: 'Change this too' }), context)).status).toBe(400)
  expect(respond).not.toHaveBeenCalled()
})
test('native mutation guard can reject a valid response', async () => {
  jest.mocked(runRouteMutationGuards).mockResolvedValue({ ok: false, response: Response.json({ error: 'blocked' }, { status: 409 }) } as never)
  expect((await POST(request(), context)).status).toBe(409)
  expect(respond).not.toHaveBeenCalled()
})
