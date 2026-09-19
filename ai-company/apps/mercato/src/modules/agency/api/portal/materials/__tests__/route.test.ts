/** @jest-environment node */

const getAuth = jest.fn()
const submitMaterial = jest.fn()
const runGuards = jest.fn()
const afterSuccess = jest.fn()
const validateUpload = jest.fn()
const container = {
  resolve: jest.fn((name: string) => {
    if (name === 'attachmentService') return {
      readUploadForm: (request: Request) => request.formData(),
      validateUpload,
    }
    if (name === 'clientMaterialIntakeService') return { submitMaterial }
    throw new Error(`Unexpected service: ${name}`)
  }),
}

jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({
  getCustomerAuthFromRequest: (request: Request) => getAuth(request),
}))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => container }))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (key: string) => key }),
}))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({
  runRouteMutationGuards: (input: unknown) => runGuards(input),
}))

import { POST } from '../route'

const auth = {
  sub: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  orgId: '00000000-0000-4000-8000-000000000003',
  customerEntityId: '00000000-0000-4000-8000-000000000004',
  resolvedFeatures: ['portal.*'],
}

function request(process?: string) {
  const body = new FormData()
  body.set('title', 'Campaign brief')
  body.set('file', new Blob(['Actual client material'], { type: 'text/plain' }), 'brief.txt')
  body.set('tenantId', 'attacker-tenant')
  body.set('customerEntityId', 'attacker-customer')
  if (process !== undefined) body.set('process', process)
  return new Request('http://localhost/api/agency/portal/materials', { method: 'POST', body })
}

beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  runGuards.mockResolvedValue({ ok: true, runAfterSuccess: afterSuccess })
  submitMaterial.mockResolvedValue({ caseId: 'case-1', workflowInstanceId: 'workflow-1', status: 'COMPLETED' })
})

it('requires a native customer session and a linked customer before accessing intake', async () => {
  getAuth.mockResolvedValueOnce(null)
  expect((await POST(request())).status).toBe(401)
  getAuth.mockResolvedValueOnce({ ...auth, customerEntityId: null })
  expect((await POST(request())).status).toBe(403)
  expect(container.resolve).not.toHaveBeenCalled()
  expect(submitMaterial).not.toHaveBeenCalled()
})

it('submits the real file using only session identity, with mutation guards around the bridge', async () => {
  runGuards.mockResolvedValueOnce({ ok: true, modifiedPayload: { title: 'Guarded title' }, runAfterSuccess: afterSuccess })
  const response = await POST(request())
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ caseId: 'case-1', workflowInstanceId: 'workflow-1', status: 'COMPLETED' })
  expect(submitMaterial).toHaveBeenCalledWith({
    identity: {
      customerUserId: auth.sub, tenantId: auth.tenantId,
      organizationId: auth.orgId, customerEntityId: auth.customerEntityId,
    },
    title: 'Guarded title',
    file: { buffer: Buffer.from('Actual client material'), fileName: 'brief.txt', mimeType: 'text/plain' },
  })
  expect(validateUpload).toHaveBeenCalledWith({ fileName: 'brief.txt', fileSize: 22 })
  expect(runGuards).toHaveBeenCalledWith(expect.objectContaining({
    auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: ['portal.*'] },
  }))
  expect(afterSuccess).toHaveBeenCalledTimes(1)
})

it('does not invoke intake when a mutation guard rejects the submission', async () => {
  runGuards.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 403 }) })
  expect((await POST(request())).status).toBe(403)
  expect(submitMaterial).not.toHaveBeenCalled()
  expect(afterSuccess).not.toHaveBeenCalled()
})

it.each([
  { kind: 'tone_of_voice', brand: 'Acme', outputLanguage: 'pl' },
  { kind: 'analysis' },
])('accepts an explicit $kind request without reporting queued work as completed', async (process) => {
  submitMaterial.mockResolvedValueOnce({ caseId: 'case-2', workflowInstanceId: 'workflow-2', status: 'WAITING_FOR_ACTIVITIES' })
  const response = await POST(request(JSON.stringify(process)))
  expect(response.status).toBe(202)
  expect(await response.json()).toEqual({
    caseId: 'case-2', workflowInstanceId: 'workflow-2', status: 'WAITING_FOR_ACTIVITIES',
  })
  expect(submitMaterial).toHaveBeenCalledWith(expect.objectContaining({
    process,
    identity: {
      customerUserId: auth.sub, tenantId: auth.tenantId,
      organizationId: auth.orgId, customerEntityId: auth.customerEntityId,
    },
    file: { buffer: Buffer.from('Actual client material'), fileName: 'brief.txt', mimeType: 'text/plain' },
  }))
  expect(runGuards).toHaveBeenCalledWith(expect.objectContaining({
    input: expect.objectContaining({ mutationPayload: { title: 'Campaign brief', process } }),
  }))
  expect(afterSuccess).toHaveBeenCalledTimes(1)
})

it.each([
  { policy: { maxCostPln: 1 } },
  { maxCostPln: 1 },
  { model: 'customer-selected-model' },
  { grantedFeatures: ['*'] },
  { through: '3.8' },
])('rejects caller-supplied execution configuration for analysis: %j', async (configuration) => {
  expect((await POST(request(JSON.stringify({ kind: 'analysis', ...configuration })))).status).toBe(400)
  expect(submitMaterial).not.toHaveBeenCalled()
  expect(runGuards).not.toHaveBeenCalled()
})

it('revalidates guarded analysis input before invoking the intake bridge', async () => {
  runGuards.mockResolvedValueOnce({
    ok: true,
    modifiedPayload: { process: { kind: 'analysis', maxCostPln: 1 } },
    runAfterSuccess: afterSuccess,
  })
  expect((await POST(request(JSON.stringify({ kind: 'analysis' })))).status).toBe(400)
  expect(submitMaterial).not.toHaveBeenCalled()
  expect(afterSuccess).not.toHaveBeenCalled()
})

it.each([
  '{malformed',
  JSON.stringify({ kind: 'arbitrary_worker', brand: 'Acme', outputLanguage: 'pl' }),
])('rejects an invalid explicit process before calling intake', async (process) => {
  expect((await POST(request(process))).status).toBe(400)
  expect(submitMaterial).not.toHaveBeenCalled()
})
