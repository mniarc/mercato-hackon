/** @jest-environment node */
const getAuth = jest.fn()
const reply = jest.fn()
const list = jest.fn()
const guard = jest.fn()
const afterSuccess = jest.fn()
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({ getCustomerAuthFromRequest: (request: Request) => getAuth(request) }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => ({ resolve: () => ({ reply, list }) }) }))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({ resolveTranslations: async () => ({ translate: (key: string) => key }) }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: (input: unknown) => guard(input) }))

import { GET, POST } from '../route'

const auth = {
  sub: '00000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000002',
  orgId: '00000000-0000-4000-8000-000000000003', customerEntityId: '00000000-0000-4000-8000-000000000004',
}
const caseId = '00000000-0000-4000-8000-000000000005'
const submissionId = '00000000-0000-4000-8000-000000000006'
const context = { params: { id: caseId, submissionId } }
const request = (body: unknown) => new Request('http://localhost/api/agency/portal/cases/case/submissions/submission/replies?customerEntityId=attacker', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  guard.mockResolvedValue({ ok: true, runAfterSuccess: afterSuccess })
  reply.mockResolvedValue({ item: { replyId: 'reply' }, replayed: false })
  list.mockResolvedValue({ items: [] })
})

it('derives all authority from the session and path, and returns an existing receipt on replay', async () => {
  expect((await POST(request({ eventId: '1', text: 'Original' }), context)).status).toBe(201)
  const identity = { customerUserId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, customerEntityId: auth.customerEntityId }
  expect(reply).toHaveBeenCalledWith(identity, caseId, submissionId, { eventId: '1', text: 'Original' })
  expect(guard).toHaveBeenCalledTimes(1)
  expect(afterSuccess).toHaveBeenCalledTimes(1)
  reply.mockResolvedValueOnce({ item: {}, replayed: true })
  expect((await POST(request({ eventId: '1', text: 'Original' }), context)).status).toBe(200)
  expect((await GET(request({}), context)).headers.get('cache-control')).toBe('private, no-store')
  expect(list).toHaveBeenCalledWith(identity, caseId, submissionId)
})

it('rejects anonymous callers and caller-controlled signal/workflow IDs, respecting mutation denial', async () => {
  getAuth.mockResolvedValueOnce(null)
  expect((await POST(request({ eventId: '1', text: 'Original' }), context)).status).toBe(401)
  expect((await POST(request({ eventId: '1', text: 'Original', workflowInstanceId: caseId, signalName: 'arbitrary' }), context)).status).toBe(400)
  guard.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 403 }) })
  expect((await POST(request({ eventId: '1', text: 'Original' }), context)).status).toBe(403)
  expect(reply).not.toHaveBeenCalled()
})
