/** @jest-environment node */

const getAuth = jest.fn()
const listCases = jest.fn()
const getCase = jest.fn()
const resolve = jest.fn(() => ({ list: listCases, get: getCase }))
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({
  getCustomerAuthFromRequest: (request: Request) => getAuth(request),
}))
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: async () => ({ resolve }),
}))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (key: string) => key }),
}))

import { GET as list } from '../route'
import { GET as detail } from '../[id]/route'

const auth = {
  sub: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  orgId: '00000000-0000-4000-8000-000000000003',
  customerEntityId: '00000000-0000-4000-8000-000000000004',
}
const caseId = '00000000-0000-4000-8000-000000000005'
const request = () => new Request('http://localhost/api/agency/portal/cases?tenantId=attacker&organizationId=attacker&customerEntityId=attacker')

beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  listCases.mockResolvedValue({ items: [], total: 0, totalPages: 0, page: 1, pageSize: 20 })
  getCase.mockResolvedValue({ caseId })
})

it('derives all list and detail ownership from the native customer session', async () => {
  const response = await list(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const identity = {
    customerUserId: auth.sub, tenantId: auth.tenantId,
    organizationId: auth.orgId, customerEntityId: auth.customerEntityId,
  }
  expect(listCases).toHaveBeenCalledWith(identity, { page: 1, pageSize: 20 })
  expect((await detail(request(), { params: Promise.resolve({ id: caseId }) })).status).toBe(200)
  expect(getCase).toHaveBeenCalledWith(identity, caseId)
})

it('requires customer authentication and linkage before resolving the query service', async () => {
  getAuth.mockResolvedValueOnce(null)
  expect((await list(request())).status).toBe(401)
  getAuth.mockResolvedValueOnce({ ...auth, customerEntityId: null })
  expect((await detail(request(), { params: { id: caseId } })).status).toBe(403)
  expect(resolve).not.toHaveBeenCalled()
})

it('returns the same scoped 404 when the case is absent or inaccessible', async () => {
  getCase.mockResolvedValueOnce(null)
  const response = await detail(request(), { params: { id: caseId } })
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'api.errors.notFound' })
})

it('bounds pagination before querying cases', async () => {
  expect((await list(new Request('http://localhost/api/agency/portal/cases?pageSize=101'))).status).toBe(400)
  expect(listCases).not.toHaveBeenCalled()
})
