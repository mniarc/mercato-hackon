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

const request = (): Request => new Request('http://localhost/api/agency_research/orders')

describe('GET /api/agency_research/orders', () => {
  it('declares the staff feature and rejects missing auth and missing scope', async () => {
    expect(route.metadata.GET).toEqual({ requireAuth: true, requireFeatures: ['agency_research.documents.view'] })
    getAuthMock.mockResolvedValueOnce(null)
    expect((await route.GET(request())).status).toBe(401)
    getAuthMock.mockResolvedValueOnce({ ...auth, orgId: null } as never)
    expect((await route.GET(request())).status).toBe(403)
    expect(findMock).not.toHaveBeenCalled()
  })

  it('folds documents and task runs into one row per order, newest activity first, spend summed like the ledger', async () => {
    getAuthMock.mockResolvedValue(auth as never)
    findMock
      .mockResolvedValueOnce([
        { orderRef: 'live-1', brand: 'Open Mercato', createdAt: new Date('2026-09-19T05:00:00Z'), updatedAt: new Date('2026-09-19T06:00:00Z') },
        { orderRef: 'live-1', brand: 'Open Mercato', createdAt: new Date('2026-09-19T05:00:00Z'), updatedAt: new Date('2026-09-19T06:30:00Z') },
        { orderRef: 'flow-1', brand: 'FLOW', createdAt: new Date('2026-09-18T23:00:00Z'), updatedAt: null },
      ] as never)
      .mockResolvedValueOnce([
        { orderRef: 'live-1', brand: 'Open Mercato', stepId: '3.2', status: 'done', cost: { total: 2.26 }, createdAt: new Date('2026-09-19T05:10:00Z'), finishedAt: new Date('2026-09-19T05:20:00Z') },
        { orderRef: 'live-1', brand: 'Open Mercato', stepId: '3.7', status: 'to_fix', cost: { total: 1.1 }, createdAt: new Date('2026-09-19T06:40:00Z'), finishedAt: null },
        { orderRef: 'fixture-only', brand: 'FLOW', stepId: '3.1', status: 'done', cost: null, createdAt: new Date('2026-09-18T22:00:00Z'), finishedAt: new Date('2026-09-18T22:00:01Z') },
      ] as never)
    const response = await route.GET(request())
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: Record<string, unknown>[]; total: number }
    expect(body.total).toBe(3)
    expect(body.items.map((item) => item.orderRef)).toEqual(['live-1', 'flow-1', 'fixture-only'])
    expect(body.items[0]).toMatchObject({ brand: 'Open Mercato', documents: 2, taskRuns: 2, lastStep: '3.7', lastStatus: 'to_fix', totalPln: 3.36, firstRunAt: '2026-09-19T05:10:00.000Z', lastActivityAt: '2026-09-19T06:40:00.000Z' })
    expect(body.items[1]).toMatchObject({ documents: 1, taskRuns: 0, lastStep: null, totalPln: 0, lastActivityAt: '2026-09-18T23:00:00.000Z' })
    expect(body.items[2]).toMatchObject({ documents: 0, taskRuns: 1, lastStep: '3.1', lastStatus: 'done', totalPln: 0 })
    expect(findMock.mock.calls[0][2]).toMatchObject({ tenantId: TENANT_ID, organizationId: ORGANIZATION_ID, deletedAt: null })
    expect(findMock.mock.calls[1][2]).toMatchObject({ tenantId: TENANT_ID, organizationId: ORGANIZATION_ID })
  })
})
