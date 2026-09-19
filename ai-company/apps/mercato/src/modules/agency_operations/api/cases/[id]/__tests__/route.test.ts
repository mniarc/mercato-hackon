/** @jest-environment node */
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { readCaseProcess } from '../../../../lib/processProjection/query'
import { GET, metadata } from '../route'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('../../../../lib/processProjection/query', () => ({ readCaseProcess: jest.fn() }))

const caseId = '00000000-0000-4000-8000-000000000001'
const request = new Request(`http://localhost/api/agency_operations/cases/${caseId}`)
const context = { params: { id: caseId } }
const auth = { sub: 'employee', tenantId: 'tenant', orgId: 'organization', roles: ['employee'] }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAuthFromRequest).mockResolvedValue(auth as never)
  jest.mocked(createRequestContainer).mockResolvedValue({} as never)
})

test('declares case and native workflow read permission gates', () => {
  expect(metadata.GET.requireFeatures).toEqual(['agency_operations.cases.view', 'workflows.instances.view', 'workflows.tasks.view'])
})

test('rejects missing organization scope before loading records', async () => {
  jest.mocked(getAuthFromRequest).mockResolvedValue({ ...auth, orgId: null } as never)
  expect((await GET(request, context)).status).toBe(403)
  expect(readCaseProcess).not.toHaveBeenCalled()
})

test('returns a bare not-found for cases outside scope', async () => {
  jest.mocked(readCaseProcess).mockResolvedValue(null)
  expect((await GET(request, context)).status).toBe(404)
  expect(readCaseProcess).toHaveBeenCalledWith({}, caseId, { tenantId: 'tenant', organizationId: 'organization', userId: 'employee', roleNames: ['employee'] })
})

test('returns the persisted projection without caching case data', async () => {
  const data = { caseId, submissions: [], hasMore: false }
  jest.mocked(readCaseProcess).mockResolvedValue(data)
  const response = await GET(request, context)
  expect(await response.json()).toEqual(data)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
