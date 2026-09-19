/** @jest-environment node */
import { POST, metadata } from '../route'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const caseId = uuid(1), body = { postVersionId: uuid(2) }, auth = { sub: uuid(3), tenantId: uuid(4), orgId: uuid(5) }
const invite = jest.fn(), after = jest.fn()
const request = (input: unknown = body) => new Request('http://localhost/api/agency_operations/cases/test/publication-consent', { method: 'POST', body: JSON.stringify(input) })
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAuthFromRequest).mockResolvedValue(auth as never)
  jest.mocked(createRequestContainer).mockResolvedValue({ resolve: () => ({ invite }) } as never)
  jest.mocked(runRouteMutationGuards).mockResolvedValue({ ok: true, modifiedPayload: {}, runAfterSuccess: after } as never)
  invite.mockResolvedValue({ workflowInstanceId: uuid(6), taskId: uuid(7), replayed: false, canSend: false })
})
test('staff request uses URL case and authenticated scope, never customer consent from the body', async () => {
  const response = await POST(request(), { params: { id: caseId } })
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ canSend: false, taskId: uuid(7) })
  expect(invite).toHaveBeenCalledWith({ caseId, ...body, tenantId: auth.tenantId, organizationId: auth.orgId, userId: auth.sub })
  expect(metadata.POST.requireFeatures).toContain('agency_research.manage')
  expect(after).toHaveBeenCalledTimes(1)
})
test('rejects invented destination or consent claims and honors native mutation blocks', async () => {
  expect((await POST(request({ ...body, consent: true }), { params: { id: caseId } })).status).toBe(400)
  jest.mocked(runRouteMutationGuards).mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 409 }) } as never)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(409)
  expect(invite).not.toHaveBeenCalled()
})
