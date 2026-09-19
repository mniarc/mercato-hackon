/** @jest-environment node */

import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'

jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({ getCustomerAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findWithDecryption: jest.fn(), findOneWithDecryption: jest.fn() }))

import * as route from '../route'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002'
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000004'
const customer = { sub: 'u', sid: 's', type: 'customer', tenantId: TENANT_ID, orgId: ORGANIZATION_ID, email: 'c@x', displayName: 'C', customerEntityId: CUSTOMER_ID, resolvedFeatures: [] }

const getCustomerAuthMock = getCustomerAuthFromRequest as jest.MockedFunction<typeof getCustomerAuthFromRequest>
const createContainerMock = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const findOneMock = findOneWithDecryption as jest.MockedFunction<typeof findOneWithDecryption>

const ustaleniaData = {
  field_map: [],
  questions: [
    { question_id: 'Q01', question: 'Którą potrzebę obsługujemy?', hint: 'h', reason: 'r', brief_field: 'priority_offer', priority: 'must', if_unanswered: 'x', state: 'open' },
    { question_id: 'Q02', question: 'Rozstrzygnięte', hint: 'h', reason: 'r', brief_field: 'voice_preferences', priority: 'must', if_unanswered: 'x', state: 'resolved_by_client' },
  ],
  evidence_requests: [],
  readiness: [],
  research_return: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  createContainerMock.mockResolvedValue({ resolve: () => ({ id: 'em' }) } as never)
})

const request = (orderRef: string) => new Request(`http://localhost/api/agency_research/portal/brief?order_ref=${encodeURIComponent(orderRef)}`)

describe('GET /api/agency_research/portal/brief', () => {
  it('is customer-authenticated and refuses an order the customer does not own', async () => {
    expect(route.metadata).toEqual({ GET: { requireAuth: false } })
    getCustomerAuthMock.mockResolvedValueOnce(null)
    expect((await route.GET(request(`${CUSTOMER_ID}-1`))).status).toBe(401)
    getCustomerAuthMock.mockResolvedValueOnce({ ...customer, customerEntityId: null } as never)
    expect((await route.GET(request(`${CUSTOMER_ID}-1`))).status).toBe(403)
    getCustomerAuthMock.mockResolvedValueOnce(customer as never)
    const foreign = await route.GET(request('someone-elses-order'))
    expect(foreign.status).toBe(403)
    expect(findOneMock).not.toHaveBeenCalled()
    expect(() => route.assertCustomerOwnsOrder({ customerEntityId: CUSTOMER_ID }, `${CUSTOMER_ID}-7`)).not.toThrow()
    expect(() => route.assertCustomerOwnsOrder({ customerEntityId: null }, `${CUSTOMER_ID}-7`)).toThrow()
  })

  it('returns only the client view, version, status and the first-contact questions', async () => {
    getCustomerAuthMock.mockResolvedValue(customer as never)
    const orderRef = `${CUSTOMER_ID}-1`
    findOneMock
      .mockResolvedValueOnce({ id: 'doc-brief', currentVersionId: 'ver-brief', status: 'ready_for_review' } as never)
      .mockResolvedValueOnce({ id: 'ver-brief', versionNo: 2, clientViewMd: '# Brief', renderedMd: 'INTERNAL', data: { secret: true } } as never)
      .mockResolvedValueOnce({ id: 'doc-ust', currentVersionId: 'ver-ust' } as never)
      .mockResolvedValueOnce({ id: 'ver-ust', data: ustaleniaData } as never)
    const response = await route.GET(request(orderRef))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({
      order_ref: orderRef,
      version: '2.0',
      status: 'ready_for_review',
      client_view_md: '# Brief',
      questions: [{ question_id: 'Q01', question: 'Którą potrzebę obsługujemy?', hint: 'h', reason: 'r', brief_field: 'priority_offer', priority: 'must' }],
    })
    expect(JSON.stringify(body)).not.toContain('INTERNAL')
    expect(findOneMock.mock.calls[0][2]).toMatchObject({ tenantId: TENANT_ID, organizationId: ORGANIZATION_ID, orderRef, templateId: 'WZR-BRIEF' })
  })

  it('404s while the brief has no version yet', async () => {
    getCustomerAuthMock.mockResolvedValue(customer as never)
    findOneMock.mockResolvedValueOnce({ id: 'doc-brief', currentVersionId: null } as never)
    expect((await route.GET(request(`${CUSTOMER_ID}-1`))).status).toBe(404)
  })
})
