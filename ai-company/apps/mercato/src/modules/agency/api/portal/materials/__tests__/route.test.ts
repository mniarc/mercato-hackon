/** @jest-environment node */
const getAuth = jest.fn(), submitSupplement = jest.fn(), runGuards = jest.fn(), afterSuccess = jest.fn(), validateUpload = jest.fn()
const container = { resolve: jest.fn((name: string) => {
  if (name === 'attachmentService') return { readUploadForm: (request: Request) => request.formData(), validateUpload }
  if (name === 'clientMaterialIntakeService') return { submitSupplement }
  throw new Error(name)
}) }
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({ getCustomerAuthFromRequest: (req: Request) => getAuth(req) }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => container }))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({ resolveTranslations: async () => ({ translate: (key: string) => key }) }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: (input: unknown) => runGuards(input) }))
import { POST } from '../route'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const auth = { sub: uuid(1), tenantId: uuid(2), orgId: uuid(3), customerEntityId: uuid(4), resolvedFeatures: ['portal.*'] }
const result = { caseId: uuid(5), attachmentId: uuid(6), submissionId: uuid(7), replayed: false, state: 'saved_waiting_for_triage' }
function request(extra?: [string, string]) {
  const body = new FormData()
  body.set('caseId', uuid(5)); body.set('eventId', 'material-1'); body.set('text', '  Original client words  ')
  body.set('file', new Blob(['Actual client material'], { type: 'text/plain' }), 'brief.txt')
  body.set('tenantId', 'attacker-tenant')
  if (extra) body.set(...extra)
  return new Request('http://localhost/api/agency/portal/materials', { method: 'POST', body })
}
beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  runGuards.mockResolvedValue({ ok: true, runAfterSuccess: afterSuccess })
  submitSupplement.mockResolvedValue(result)
})
it('requires a linked native customer session', async () => {
  getAuth.mockResolvedValueOnce(null)
  expect((await POST(request())).status).toBe(401)
  getAuth.mockResolvedValueOnce({ ...auth, customerEntityId: null })
  expect((await POST(request())).status).toBe(403)
  expect(submitSupplement).not.toHaveBeenCalled()
})
it('saves a supplementary file to the selected existing case using session identity and no process override', async () => {
  const response = await POST(request())
  expect(response.status).toBe(202)
  expect(await response.json()).toEqual(result)
  expect(submitSupplement).toHaveBeenCalledWith({
    identity: { customerUserId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, customerEntityId: auth.customerEntityId },
    caseId: uuid(5), eventId: 'material-1', text: '  Original client words  ',
    file: { buffer: Buffer.from('Actual client material'), fileName: 'brief.txt', mimeType: 'text/plain' },
  })
  expect(afterSuccess).toHaveBeenCalledTimes(1)
})
it('rejects the old no-case/process customer shortcut instead of creating a no-op case', async () => {
  expect((await POST(request(['caseId', '']))).status).toBe(400)
  expect((await POST(request(['process', '{"kind":"analysis"}']))).status).toBe(400)
  expect(submitSupplement).not.toHaveBeenCalled()
})
it('preserves mutation rejection and reports saved replay without reclassifying', async () => {
  runGuards.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 403 }) })
  expect((await POST(request())).status).toBe(403)
  expect(submitSupplement).not.toHaveBeenCalled()
  submitSupplement.mockResolvedValueOnce({ ...result, replayed: true })
  expect((await POST(request())).status).toBe(200)
})
