import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: jest.fn() }))

import { POST, metadata } from '../route'

const caseId = '11111111-1111-4111-8111-111111111111'
const auth = { sub: '22222222-2222-4222-8222-222222222222', tenantId: '33333333-3333-4333-8333-333333333333', orgId: '44444444-4444-4444-8444-444444444444' }
const escalate = jest.fn()
const afterSuccess = jest.fn()
const request = () => new Request(`http://localhost/api/agency_operations/cases/${caseId}/escalate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Needs employee attention' }) })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAuthFromRequest).mockResolvedValue(auth)
  jest.mocked(createRequestContainer).mockResolvedValue({ resolve: () => ({ escalate }) } as never)
  jest.mocked(runRouteMutationGuards).mockResolvedValue({ ok: true, runAfterSuccess: afterSuccess })
  escalate.mockResolvedValue({ caseId, workflowInstanceId: caseId, deduplicated: false })
})

it('uses staff-session scope and mutation guards for the real escalation callsite', async () => {
  expect(metadata.POST.requireFeatures).toEqual(['agency_operations.cases.escalate'])
  const response = await POST(request(), { params: { id: caseId } })
  expect(response.status).toBe(201)
  expect(escalate).toHaveBeenCalledWith({ caseId, userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, reason: 'Needs employee attention', evidence: '' })
  expect(runRouteMutationGuards).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ resourceId: caseId, operation: 'update' }) }))
  expect(afterSuccess).toHaveBeenCalledTimes(1)
})

it('does not invoke attention on anonymous or blocked requests', async () => {
  jest.mocked(getAuthFromRequest).mockResolvedValueOnce(null)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(401)
  jest.mocked(runRouteMutationGuards).mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 409 }), errorStatus: 409, errorBody: { error: 'blocked' } })
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(409)
  expect(escalate).not.toHaveBeenCalled()
})
