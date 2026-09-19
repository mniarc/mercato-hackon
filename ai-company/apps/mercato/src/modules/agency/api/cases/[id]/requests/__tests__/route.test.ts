/** @jest-environment node */
const getAuth = jest.fn()
const requireFeature = jest.fn()
const respond = jest.fn()
const read = jest.fn()
const guard = jest.fn()
const afterSuccess = jest.fn()
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({
  getCustomerAuthFromRequest: (request: Request) => getAuth(request),
  requireCustomerFeature: (...args: unknown[]) => requireFeature(...args),
}))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => ({ resolve: () => ({ respond, read }) }) }))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({ resolveTranslations: async () => ({ translate: (key: string) => key }) }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: (input: unknown) => guard(input) }))

import { POST } from '../route'
import { GET } from '../../../../reviews/[id]/route'
import { PORTAL_TASKS_COMPLETE_FEATURE, PORTAL_TASKS_VIEW_FEATURE } from '@open-mercato/core/modules/workflows/lib/portal-task-access'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const auth = { sub: uuid(1), tenantId: uuid(2), orgId: uuid(3), customerEntityId: uuid(4) }
const caseId = uuid(5), taskId = uuid(6)
const input = { channel: 'portal', kind: 'approval', documentId: uuid(7), versionId: uuid(8), externalEventId: 'event-1' }
const receipt = { requestId: uuid(9), status: 'response_received', replayed: false }
const request = (body: unknown = input) => new Request(`http://localhost/api/agency/cases/${caseId}/requests`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  requireFeature.mockResolvedValue(undefined)
  guard.mockResolvedValue({ ok: true, runAfterSuccess: afterSuccess })
  respond.mockResolvedValue(receipt)
  read.mockResolvedValue({ ok: true, review: { versionId: input.versionId }, canRespond: false })
})

test('response route preserves native customer authority, mutation guards and stable receipt semantics', async () => {
  const response = await POST(request(), { params: { id: caseId } })
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual(receipt)
  expect(requireFeature).toHaveBeenCalledWith(auth, [PORTAL_TASKS_COMPLETE_FEATURE], expect.anything())
  expect(respond).toHaveBeenCalledWith(auth, caseId, input)
  expect(guard).toHaveBeenCalledTimes(1)
  expect(afterSuccess).toHaveBeenCalledTimes(1)
  respond.mockResolvedValueOnce({ ...receipt, replayed: true })
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})

test('unauthenticated, injected authority and denied mutations cannot reach response service', async () => {
  getAuth.mockResolvedValueOnce(null)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(401)
  expect((await POST(request({ ...input, customerEntityId: uuid(20) }), { params: { id: caseId } })).status).toBe(400)
  guard.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 403 }) })
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(403)
  expect(respond).not.toHaveBeenCalled()
})

test('review projection route gates native task visibility without returning workflow context', async () => {
  const response = await GET(new Request(`http://localhost/api/agency/reviews/${taskId}`), { params: { id: taskId } })
  expect(response.status).toBe(200)
  expect(requireFeature).toHaveBeenCalledWith(auth, [PORTAL_TASKS_VIEW_FEATURE], expect.anything())
  expect(read).toHaveBeenCalledWith(auth, taskId)
  expect(await response.json()).toEqual({ ok: true, review: { versionId: input.versionId }, canRespond: false })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})

test('review projection stops before service on native feature denial', async () => {
  requireFeature.mockRejectedValueOnce(Response.json({ error: 'forbidden' }, { status: 403 }))
  expect((await GET(new Request(`http://localhost/api/agency/reviews/${taskId}`), { params: { id: taskId } })).status).toBe(403)
  expect(read).not.toHaveBeenCalled()
})
