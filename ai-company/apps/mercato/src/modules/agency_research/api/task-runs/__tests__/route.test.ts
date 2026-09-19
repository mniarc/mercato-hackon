/** @jest-environment node */

import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { orderStatus } from '../../../lib/store'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('../../../lib/store', () => ({ orderStatus: jest.fn(), liveAgentRuns: jest.fn(async () => []) }))

import * as route from '../route'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002'
const auth = { sub: '00000000-0000-4000-8000-000000000005', tenantId: TENANT_ID, orgId: ORGANIZATION_ID, roles: ['employee'] }

const getAuthMock = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const createContainerMock = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const orderStatusMock = orderStatus as jest.MockedFunction<typeof orderStatus>

beforeEach(() => {
  jest.clearAllMocks()
  createContainerMock.mockResolvedValue({ resolve: () => ({ id: 'em' }) } as never)
})

describe('GET /api/agency_research/task-runs', () => {
  it('guards the request and returns the per-order process state with the ledger total', async () => {
    expect(route.metadata.GET.requireFeatures).toEqual(['agency_research.documents.view'])
    getAuthMock.mockResolvedValueOnce(null)
    expect((await route.GET(new Request('http://localhost/api/agency_research/task-runs?order_ref=demo-1'))).status).toBe(401)
    getAuthMock.mockResolvedValue(auth as never)
    expect((await route.GET(new Request('http://localhost/api/agency_research/task-runs'))).status).toBe(400)
    orderStatusMock.mockResolvedValueOnce({
      documents: [{ templateId: 'WZR-BRIEF', outputId: 'KLI-BRIEF', status: 'draft', versionNo: 1, versionId: 'v-1', updatedAt: new Date('2026-09-19T10:00:00Z') }],
      taskRuns: [{ id: 'r-1', stepId: '4.1', attempt: 1, status: 'done', runner: 'orchestrator', costPln: 1.25, agentRuns: 3, outputVersionId: 'v-1', error: null, createdAt: new Date('2026-09-19T09:00:00Z'), finishedAt: null }],
      totalPln: 1.25,
      sources: 6,
    })
    const response = await route.GET(new Request('http://localhost/api/agency_research/task-runs?order_ref=demo-1'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({ orderRef: 'demo-1', totalPln: 1.25, sources: 6 })
    expect((body.taskRuns as Record<string, unknown>[])[0]).toMatchObject({ stepId: '4.1', costPln: 1.25, createdAt: '2026-09-19T09:00:00.000Z', finishedAt: null })
    expect(orderStatusMock).toHaveBeenCalledWith({ id: 'em' }, { tenantId: TENANT_ID, organizationId: ORGANIZATION_ID }, 'demo-1')
  })
})
