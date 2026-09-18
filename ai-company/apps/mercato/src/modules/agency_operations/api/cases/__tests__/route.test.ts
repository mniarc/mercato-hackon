/** @jest-environment node */

import { z } from 'zod'

type CapturedRouteOptions = {
  metadata: Record<string, unknown>
  orm: {
    tenantField: string
    orgField: string
    softDeleteField: string
  }
  indexer: { entityType: string }
  list: {
    schema: z.ZodTypeAny
    fields: string[]
    sortFieldMap: Record<string, string>
    defaultSort: { field: string; dir: string }
    tiebreakSortField: string
    buildFilters: (query: Record<string, unknown>) => Promise<Record<string, unknown>>
    transformItem: (item: unknown) => unknown
  }
}

const captured: { options: CapturedRouteOptions | null } = { options: null }
const getHandler = jest.fn()

jest.mock('@open-mercato/shared/lib/crud/factory', () => ({
  makeCrudRoute: (options: CapturedRouteOptions) => {
    captured.options = options
    return { metadata: options.metadata, GET: getHandler }
  },
}))

import * as route from '../route'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002'
const CASE_ID = '00000000-0000-4000-8000-000000000003'
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000004'
const CUSTOMER_USER_ID = '00000000-0000-4000-8000-000000000005'
const ATTACHMENT_ID = '00000000-0000-4000-8000-000000000006'
const WORKFLOW_ID = '00000000-0000-4000-8000-000000000007'

function routeOptions(): CapturedRouteOptions {
  if (!captured.options) throw new Error('[internal] makeCrudRoute was not called by the agency cases route')
  return captured.options
}

function projectedRow() {
  return {
    id: CASE_ID,
    tenant_id: TENANT_ID,
    organization_id: ORGANIZATION_ID,
    customer_entity_id: CUSTOMER_ID,
    submitted_by_customer_user_id: CUSTOMER_USER_ID,
    title: 'Autumn launch brief',
    agent_worker_id: 'agency_operations.material_intake',
    material_attachment_id: ATTACHMENT_ID,
    material_file_name: 'brief.pdf',
    material_mime_type: 'application/pdf',
    material_file_size: 2048,
    workflow_instance_id: WORKFLOW_ID,
    created_at: new Date('2026-09-18T09:00:00.000Z'),
    updated_at: '2026-09-18T09:01:00.000Z',
  }
}

describe('agency cases employee read route', () => {
  it('publishes one authenticated GET guarded by the employee view feature', () => {
    expect(route.metadata).toEqual({
      GET: {
        requireAuth: true,
        requireFeatures: ['agency_operations.cases.view'],
      },
    })
    expect(route.GET).toBe(getHandler)
    expect(route).not.toHaveProperty('POST')
    expect(route).not.toHaveProperty('PUT')
    expect(route).not.toHaveProperty('DELETE')
  })

  it('delegates tenant, organization, and soft-delete scope to the CRUD factory', () => {
    expect(routeOptions().orm).toMatchObject({
      tenantField: 'tenantId',
      orgField: 'organizationId',
      softDeleteField: 'deletedAt',
    })
    expect(routeOptions().indexer.entityType).toBe('agency_operations:agency_case')
  })

  it('accepts the list and detail query contract', () => {
    expect(
      routeOptions().list.schema.parse({
        page: '2',
        pageSize: '25',
        search: 'launch',
        sortField: 'createdAt',
        sortDir: 'desc',
      }),
    ).toMatchObject({ page: 2, pageSize: 25, search: 'launch', sortField: 'createdAt', sortDir: 'desc' })

    expect(routeOptions().list.schema.parse({ id: CASE_ID, pageSize: 1 })).toMatchObject({
      id: CASE_ID,
      page: 1,
      pageSize: 1,
    })
  })

  it('builds only case-specific filters while the factory owns scope filters', async () => {
    const filters = await routeOptions().list.buildFilters({ id: CASE_ID, search: '100% launch_' })

    expect(filters).toEqual({
      id: { $eq: CASE_ID },
      $or: [
        { title: { $ilike: '%100\\% launch\\_%' } },
        { material_file_name: { $ilike: '%100\\% launch\\_%' } },
        { agent_worker_id: { $ilike: '%100\\% launch\\_%' } },
      ],
    })
    expect(filters).not.toHaveProperty('tenant_id')
    expect(filters).not.toHaveProperty('organization_id')
  })

  it('returns the complete camel-cased AgencyCase read DTO', () => {
    expect(routeOptions().list.transformItem(projectedRow())).toEqual({
      id: CASE_ID,
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      customerEntityId: CUSTOMER_ID,
      submittedByCustomerUserId: CUSTOMER_USER_ID,
      title: 'Autumn launch brief',
      agentWorkerId: 'agency_operations.material_intake',
      hasMaterial: true,
      materialFileName: 'brief.pdf',
      materialMimeType: 'application/pdf',
      materialFileSize: 2048,
      workflowInstanceId: WORKFLOW_ID,
      createdAt: '2026-09-18T09:00:00.000Z',
      updatedAt: '2026-09-18T09:01:00.000Z',
    })
  })

  it('documents only GET and validates the paged response shape', () => {
    expect(Object.keys(route.openApi.methods ?? {})).toEqual(['GET'])
    const responseSchema = route.openApi.methods?.GET?.responses?.[0]?.schema as z.ZodTypeAny
    const item = routeOptions().list.transformItem(projectedRow())

    expect(
      responseSchema.parse({
        items: [item],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      }),
    ).toMatchObject({ total: 1, totalPages: 1 })
  })
})
