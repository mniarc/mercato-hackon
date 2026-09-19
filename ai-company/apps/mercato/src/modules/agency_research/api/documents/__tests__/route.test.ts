/** @jest-environment node */

import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findWithDecryption: jest.fn(), findOneWithDecryption: jest.fn() }))

import * as route from '../route'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002'
const auth = { sub: '00000000-0000-4000-8000-000000000005', tenantId: TENANT_ID, orgId: ORGANIZATION_ID, roles: ['employee'] }

const getAuthMock = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const createContainerMock = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const findMock = findWithDecryption as jest.MockedFunction<typeof findWithDecryption>

beforeEach(() => {
  jest.clearAllMocks()
  createContainerMock.mockResolvedValue({ resolve: () => ({ id: 'em' }) } as never)
})

function request(query = '?order_ref=demo-1'): Request {
  return new Request(`http://localhost/api/agency_research/documents${query}`)
}

describe('GET /api/agency_research/documents', () => {
  it('declares the staff feature and rejects missing order_ref, missing auth and missing scope', async () => {
    expect(route.metadata.GET).toEqual({ requireAuth: true, requireFeatures: ['agency_research.documents.view'] })
    expect((await route.GET(request(''))).status).toBe(400)
    getAuthMock.mockResolvedValueOnce(null)
    expect((await route.GET(request())).status).toBe(401)
    getAuthMock.mockResolvedValueOnce({ ...auth, orgId: null } as never)
    expect((await route.GET(request())).status).toBe(403)
    expect(findMock).not.toHaveBeenCalled()
  })

  it('lists documents scoped to the tenant with their current version reference and counts', async () => {
    getAuthMock.mockResolvedValue(auth as never)
    findMock
      .mockResolvedValueOnce([
        { id: 'doc-1', orderRef: 'demo-1', brand: 'FLOW', templateId: 'WZR-BRIEF', outputId: 'KLI-BRIEF', status: 'ready_for_review', currentVersionId: 'ver-1', updatedAt: new Date('2026-09-19T10:00:00Z') },
        { id: 'doc-2', orderRef: 'demo-1', brand: 'FLOW', templateId: 'WZR-ZRODLA', outputId: 'WEW-ZRODLA', status: 'ready_for_review', currentVersionId: null, updatedAt: null },
      ] as never)
      .mockResolvedValueOnce([{ id: 'ver-1', versionNo: 2, status: 'draft', issues: [{ code: 'X' }], clientViewMd: '# brief' }] as never)
    const response = await route.GET(request())
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: Record<string, unknown>[]; total: number }
    expect(body.total).toBe(2)
    expect(body.items[0]).toMatchObject({ outputId: 'KLI-BRIEF', currentVersionId: 'ver-1', currentVersionNo: 2, currentVersionStatus: 'draft', issues: 1, hasClientView: true, updatedAt: '2026-09-19T10:00:00.000Z' })
    expect(body.items[1]).toMatchObject({ outputId: 'WEW-ZRODLA', currentVersionId: null, currentVersionNo: null, issues: 0, hasClientView: false })
    expect(findMock.mock.calls[0][2]).toMatchObject({ tenantId: TENANT_ID, organizationId: ORGANIZATION_ID, orderRef: 'demo-1', deletedAt: null })
    expect(findMock.mock.calls[1][2]).toMatchObject({ tenantId: TENANT_ID, organizationId: ORGANIZATION_ID, id: { $in: ['ver-1'] } })
  })
})
