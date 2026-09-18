/** @jest-environment node */

const getAuth = jest.fn()
const listArtifacts = jest.fn()
const getArtifact = jest.fn()
const resolve = jest.fn((key: string) => key === 'clientArtifactService'
  ? { list: listArtifacts, get: getArtifact } : {})
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
import { GET as detail } from '../[versionId]/route'

const auth = {
  sub: '00000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000002',
  orgId: '00000000-0000-4000-8000-000000000003', customerEntityId: '00000000-0000-4000-8000-000000000004',
}
const id = '00000000-0000-4000-8000-000000000005'
const versionId = '00000000-0000-4000-8000-000000000006'
const request = () => new Request(`http://localhost/api/agency/portal/cases/${id}/artifacts?customerEntityId=attacker`)

beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  listArtifacts.mockResolvedValue([{ versionId }])
  getArtifact.mockResolvedValue({ versionId, contentFormat: 'tov-brand-json' })
})

it('forwards only session identity and exact path ids to the artifact service', async () => {
  const response = await list(request(), { params: { id } })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ items: [{ versionId }] })
  const identity = {
    customerUserId: auth.sub, tenantId: auth.tenantId,
    organizationId: auth.orgId, customerEntityId: auth.customerEntityId,
  }
  expect(listArtifacts).toHaveBeenCalledWith(identity, id)
  expect((await detail(request(), { params: Promise.resolve({ id, versionId }) })).status).toBe(200)
  expect(getArtifact).toHaveBeenCalledWith(identity, id, versionId)
})

it('requires a native customer session and returns scoped 404 for unlinked versions', async () => {
  getAuth.mockResolvedValueOnce(null)
  expect((await list(request(), { params: { id } })).status).toBe(401)
  expect(listArtifacts).not.toHaveBeenCalled()
  getArtifact.mockResolvedValueOnce(null)
  const response = await detail(request(), { params: { id, versionId } })
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'api.errors.notFound' })
})
