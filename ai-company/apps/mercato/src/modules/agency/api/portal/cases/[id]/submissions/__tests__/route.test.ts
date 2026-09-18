/** @jest-environment node */
const getAuth = jest.fn()
const submit = jest.fn()
const list = jest.fn()
const guard = jest.fn()
const afterSuccess = jest.fn()
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({ getCustomerAuthFromRequest: (request: Request) => getAuth(request) }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => ({ resolve: () => ({ submit, list }) }) }))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({ resolveTranslations: async () => ({ translate: (key: string) => key }) }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: (input: unknown) => guard(input) }))

import { GET, POST } from '../route'

const auth = {
  sub: '00000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000002',
  orgId: '00000000-0000-4000-8000-000000000003', customerEntityId: '00000000-0000-4000-8000-000000000004',
}
const caseId = '00000000-0000-4000-8000-000000000005'
const context = { params: { id: caseId } }
const request = (body: unknown) => new Request(`http://localhost/api/agency/portal/cases/${caseId}/submissions?customerEntityId=attacker`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  guard.mockResolvedValue({ ok: true, runAfterSuccess: afterSuccess })
  submit.mockResolvedValue({ item: { submissionId: 'submission' }, replayed: false })
  list.mockResolvedValue({ items: [] })
})

it('uses only native customer scope, calls mutation guards, and marks replays as existing', async () => {
  const response = await POST(request({ eventId: '1', text: 'Original' }), context)
  expect(response.status).toBe(201)
  const identity = { customerUserId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, customerEntityId: auth.customerEntityId }
  expect(submit).toHaveBeenCalledWith(identity, caseId, { eventId: '1', text: 'Original', scaffoldScenario: 'clarify' })
  expect(guard).toHaveBeenCalledTimes(1)
  expect(afterSuccess).toHaveBeenCalledTimes(1)
  submit.mockResolvedValueOnce({ item: {}, replayed: true })
  expect((await POST(request({ eventId: '1', text: 'Original' }), context)).status).toBe(200)
  expect((await GET(request({}), context)).headers.get('cache-control')).toBe('private, no-store')
  expect(list).toHaveBeenCalledWith(identity, caseId)
})

it('rejects unauthenticated requests, injected scope, and guard denial without submission', async () => {
  getAuth.mockResolvedValueOnce(null)
  expect((await POST(request({ eventId: '1', text: 'Original' }), context)).status).toBe(401)
  expect((await POST(request({ eventId: '1', text: 'Original', tenantId: auth.tenantId }), context)).status).toBe(400)
  guard.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 403 }) })
  expect((await POST(request({ eventId: '1', text: 'Original' }), context)).status).toBe(403)
  expect(submit).not.toHaveBeenCalled()
})
