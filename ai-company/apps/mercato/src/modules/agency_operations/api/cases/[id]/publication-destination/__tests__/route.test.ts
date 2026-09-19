/** @jest-environment node */
import { POST, metadata } from '../route'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const caseId = uuid(1)
const auth = { sub: uuid(2), tenantId: uuid(3), orgId: uuid(4) }
const body = { nativeChannelId: uuid(5), discordChannelId: '123456789012345678', displayName: 'Explicit demo channel' }
const configure = jest.fn(), after = jest.fn()
const request = (input: unknown = body) => new Request(`http://localhost/api/agency_operations/cases/${caseId}/publication-destination`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAuthFromRequest).mockResolvedValue(auth as never)
  jest.mocked(createRequestContainer).mockResolvedValue({ resolve: () => ({ configure }) } as never)
  jest.mocked(runRouteMutationGuards).mockResolvedValue({ ok: true, modifiedPayload: {}, runAfterSuccess: after } as never)
  configure.mockResolvedValue({ status: 'configured', orderRef: caseId, configVersionId: uuid(6),
    readiness: 'not_verified', canSend: false, replayed: false })
})

test('configures only from server staff scope and URL case through native mutation guards', async () => {
  const preparation = { status: 'prepared', orderRef: caseId, postVersionId: uuid(7), acceptanceSubmissionId: uuid(8),
    taskRunId: uuid(9), instructionVersionId: uuid(10), configVersionId: uuid(6), contentHash: 'saved-accepted-content',
    contentApproval: 'valid', publicationConsent: 'missing', canSend: false, missingGates: ['publication_consent'], replayed: false }
  configure.mockResolvedValueOnce({ status: 'configured', orderRef: caseId, configVersionId: uuid(6),
    readiness: 'not_verified', canSend: false, replayed: false, preparation })
  const response = await POST(request(), { params: { id: caseId } })
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ readiness: 'not_verified', canSend: false, preparation })
  expect(configure).toHaveBeenCalledWith({ tenantId: auth.tenantId, organizationId: auth.orgId, userId: auth.sub }, { ...body, caseId })
  expect(runRouteMutationGuards).toHaveBeenCalledWith(expect.objectContaining({
    input: { resourceKind: 'agency_operations:agency_case', resourceId: caseId, operation: 'update', mutationPayload: body },
  }))
  expect(metadata.POST.requireFeatures).toEqual(expect.arrayContaining(['agency_research.manage', 'channel_discord.view']))
  expect(after).toHaveBeenCalledTimes(1)
})

test('rejects caller secret/scope claims and anonymous or mutation-blocked writes', async () => {
  expect((await POST(request({ ...body, credentialsRef: uuid(7) }), { params: { id: caseId } })).status).toBe(400)
  jest.mocked(getAuthFromRequest).mockResolvedValueOnce(null)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(401)
  jest.mocked(runRouteMutationGuards).mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 409 }) } as never)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(409)
  expect(configure).not.toHaveBeenCalled()
  expect(after).not.toHaveBeenCalled()
})

test('returns an unmet native prerequisite without claiming a successful configuration write', async () => {
  configure.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'credentials_missing', canSend: false })
  const response = await POST(request(), { params: { id: caseId } })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'not_ready', orderRef: caseId, reason: 'credentials_missing', canSend: false })
  expect(after).not.toHaveBeenCalled()
})
