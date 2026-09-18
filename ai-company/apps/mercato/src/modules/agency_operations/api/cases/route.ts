import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { buildIlikeTerm } from '@open-mercato/shared/lib/db/buildIlikeTerm'
import {
  createCrudOpenApiFactory,
  createPagedListResponseSchema,
} from '@open-mercato/shared/lib/openapi/crud'
import { AgencyCase } from '../../data/entities'

const AGENCY_CASE_ENTITY_ID = 'agency_operations:agency_case' as const

const agencyCaseListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    id: z.string().uuid().optional(),
    search: z.string().trim().max(200).optional(),
    sortField: z
      .enum([
        'title',
        'customerEntityId',
        'agentWorkerId',
        'materialFileName',
        'createdAt',
        'updatedAt',
      ])
      .optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

type AgencyCaseListQuery = z.infer<typeof agencyCaseListSchema>

const agencyCaseListItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  customerEntityId: z.string().uuid(),
  submittedByCustomerUserId: z.string().uuid(),
  title: z.string(),
  agentWorkerId: z.string(),
  hasMaterial: z.boolean(),
  materialFileName: z.string().nullable(),
  materialMimeType: z.string().nullable(),
  materialFileSize: z.number().int().nonnegative().nullable(),
  workflowInstanceId: z.string().uuid().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

const routeMetadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['agency_operations.cases.view'],
  },
}

export const metadata = routeMetadata

const listFields = [
  'id',
  'tenant_id',
  'organization_id',
  'customer_entity_id',
  'submitted_by_customer_user_id',
  'title',
  'agent_worker_id',
  'material_attachment_id',
  'material_file_name',
  'material_mime_type',
  'material_file_size',
  'workflow_instance_id',
  'created_at',
  'updated_at',
]

function readField(record: Record<string, unknown>, snakeCase: string, camelCase: string): unknown {
  return record[snakeCase] ?? record[camelCase]
}

function readString(record: Record<string, unknown>, snakeCase: string, camelCase: string): string | null {
  const value = readField(record, snakeCase, camelCase)
  return typeof value === 'string' ? value : null
}

function readNumber(record: Record<string, unknown>, snakeCase: string, camelCase: string): number | null {
  const value = readField(record, snakeCase, camelCase)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function transformAgencyCase(item: unknown): unknown {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item
  const record = item as Record<string, unknown>
  return {
    id: readString(record, 'id', 'id'),
    tenantId: readString(record, 'tenant_id', 'tenantId'),
    organizationId: readString(record, 'organization_id', 'organizationId'),
    customerEntityId: readString(record, 'customer_entity_id', 'customerEntityId'),
    submittedByCustomerUserId: readString(
      record,
      'submitted_by_customer_user_id',
      'submittedByCustomerUserId',
    ),
    title: readString(record, 'title', 'title'),
    agentWorkerId: readString(record, 'agent_worker_id', 'agentWorkerId'),
    hasMaterial: readString(record, 'material_attachment_id', 'materialAttachmentId') !== null,
    materialFileName: readString(record, 'material_file_name', 'materialFileName'),
    materialMimeType: readString(record, 'material_mime_type', 'materialMimeType'),
    materialFileSize: readNumber(record, 'material_file_size', 'materialFileSize'),
    workflowInstanceId: readString(record, 'workflow_instance_id', 'workflowInstanceId'),
    createdAt: toIso(readField(record, 'created_at', 'createdAt')),
    updatedAt: toIso(readField(record, 'updated_at', 'updatedAt')),
  }
}

const crud = makeCrudRoute<never, never, AgencyCaseListQuery>({
  metadata: routeMetadata,
  orm: {
    entity: AgencyCase,
    idField: 'id',
    tenantField: 'tenantId',
    orgField: 'organizationId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: AGENCY_CASE_ENTITY_ID },
  list: {
    schema: agencyCaseListSchema,
    entityId: AGENCY_CASE_ENTITY_ID,
    fields: listFields,
    sortFieldMap: {
      title: 'title',
      customerEntityId: 'customer_entity_id',
      agentWorkerId: 'agent_worker_id',
      materialFileName: 'material_file_name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    defaultSort: { field: 'createdAt', dir: 'desc' },
    tiebreakSortField: 'id',
    buildFilters: async (query) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = { $eq: query.id }
      if (query.search) {
        const term = buildIlikeTerm(query.search)
        filters.$or = [
          { title: { $ilike: term } },
          { material_file_name: { $ilike: term } },
          { agent_worker_id: { $ilike: term } },
        ]
      }
      return filters
    },
    transformItem: transformAgencyCase,
  },
})

export const GET = crud.GET

const createAgencyOperationsCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: 'Agency Operations',
})

export const openApi = createAgencyOperationsCrudOpenApi({
  resourceName: 'Agency case',
  pluralName: 'Agency cases',
  description: 'Returns agency cases visible in the authenticated employee organization scope.',
  querySchema: agencyCaseListSchema,
  listResponseSchema: createPagedListResponseSchema(agencyCaseListItemSchema),
})
