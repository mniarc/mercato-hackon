/** @jest-environment node */
import { GET, POST } from '../route'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const caseId = uuid(1), parentTaskId = uuid(2)
const auth = { sub: uuid(3), tenantId: uuid(4), orgId: uuid(5), roles: ['employee'] }
const ask = jest.fn(), list = jest.fn(), after = jest.fn()
const request = () => new Request(`http://localhost/api/agency_operations/cases/${caseId}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentTaskId, eventId: 'stable-event', question: 'What is missing?' }) })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAuthFromRequest).mockResolvedValue(auth as never)
  jest.mocked(createRequestContainer).mockResolvedValue({ resolve: () => ({ ask, list }) } as never)
  jest.mocked(runRouteMutationGuards).mockResolvedValue({ ok: true, modifiedPayload: {}, runAfterSuccess: after } as never)
  ask.mockResolvedValue({ workflowInstanceId: uuid(6), customerTaskId: uuid(7), replayed: false })
  list.mockResolvedValue({ configured: true, parents: [], questions: [] })
})

test('staff question uses server scope and existing mutation guards', async () => {
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(201)
  expect(ask).toHaveBeenCalledWith({ parentTaskId, eventId: 'stable-event', question: 'What is missing?', caseId, userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, roleNames: auth.roles })
  expect(after).toHaveBeenCalledTimes(1)
  expect((await GET(request(), { params: { id: caseId } })).headers.get('Cache-Control')).toBe('private, no-store')
})

test('anonymous or mutation-blocked requests do not ask a question', async () => {
  jest.mocked(getAuthFromRequest).mockResolvedValueOnce(null)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(401)
  jest.mocked(runRouteMutationGuards).mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 409 }) } as never)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(409)
  expect(ask).not.toHaveBeenCalled()
  expect(after).not.toHaveBeenCalled()
})
