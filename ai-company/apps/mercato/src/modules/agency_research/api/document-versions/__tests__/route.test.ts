/** @jest-environment node */

import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findWithDecryption: jest.fn(), findOneWithDecryption: jest.fn() }))

import * as route from '../route'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002'
const VERSION_ID = '00000000-0000-4000-8000-000000000009'
const auth = { sub: '00000000-0000-4000-8000-000000000005', tenantId: TENANT_ID, orgId: ORGANIZATION_ID, roles: ['employee'] }

const getAuthMock = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const createContainerMock = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const findOneMock = findOneWithDecryption as jest.MockedFunction<typeof findOneWithDecryption>
const findMock = findWithDecryption as jest.MockedFunction<typeof findWithDecryption>

const version = {
  id: VERSION_ID, orderRef: 'demo-1', templateId: 'WZR-BRIEF', versionNo: 1, schemaVersion: '1.1', status: 'draft',
  inputVersions: [{ document_id: 'WEW-DANE-ZAMOWIENIA@demo-1', version: '1.0' }], fieldEvidence: { priority_offer: ['F01'] }, approvalRecords: [], simulationFlag: false,
  issues: [], taskRunId: '00000000-0000-4000-8000-000000000010', qaResult: null, createdAt: new Date('2026-09-19T10:00:00Z'), data: { priority_offer: { value: 'x' } }, renderedMd: '# KLI-BRIEF', clientViewMd: '# Brief',
}

beforeEach(() => {
  jest.clearAllMocks()
  createContainerMock.mockResolvedValue({ resolve: () => ({ id: 'em' }) } as never)
  getAuthMock.mockResolvedValue(auth as never)
})

const request = (query: string) => new Request(`http://localhost/api/agency_research/document-versions${query}`)

describe('GET /api/agency_research/document-versions', () => {
  it('requires an id or an order_ref + template_id pair', async () => {
    expect((await route.GET(request(''))).status).toBe(400)
    expect((await route.GET(request('?order_ref=demo-1'))).status).toBe(400)
    expect((await route.GET(request('?id=not-a-uuid'))).status).toBe(400)
  })

  it('returns one version with envelope, data, markdown and client view, scoped to the tenant', async () => {
    findOneMock.mockResolvedValueOnce(version as never)
    const response = await route.GET(request(`?id=${VERSION_ID}`))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({ document_id: 'WZR-BRIEF@demo-1', version: '1.0', version_no: 1, status: 'draft', rendered_md: '# KLI-BRIEF', client_view_md: '# Brief', created_at: '2026-09-19T10:00:00.000Z' })
    expect(body.data).toEqual({ priority_offer: { value: 'x' } })
    expect(findOneMock.mock.calls[0][2]).toEqual({ tenantId: TENANT_ID, organizationId: ORGANIZATION_ID, id: VERSION_ID })
  })

  it('404s an unknown version and lists a document\'s versions without bodies', async () => {
    findOneMock.mockResolvedValueOnce(null as never)
    expect((await route.GET(request(`?id=${VERSION_ID}`))).status).toBe(404)
    findMock.mockResolvedValueOnce([version, { ...version, versionNo: 2 }] as never)
    const response = await route.GET(request('?order_ref=demo-1&template_id=WZR-BRIEF'))
    const body = (await response.json()) as { items: Record<string, unknown>[]; total: number }
    expect(body.total).toBe(2)
    expect(body.items[0]).not.toHaveProperty('data')
    expect(body.items[0]).not.toHaveProperty('rendered_md')
    expect(findMock.mock.calls[0][2]).toEqual({ tenantId: TENANT_ID, organizationId: ORGANIZATION_ID, orderRef: 'demo-1', templateId: 'WZR-BRIEF' })
  })
})
