import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AgencyResearchDocumentVersion } from '../../data/entities'

/**
 * Staff read of one document version — the COMMON-ENVELOPE, the typed data, the
 * internal markdown and the client projection — or, with `order_ref` +
 * `template_id`, the version list of one document (envelopes only, no bodies).
 */

const querySchema = z
  .object({
    id: z.string().uuid().optional(),
    order_ref: z.string().trim().min(1).max(200).optional(),
    template_id: z.string().trim().min(1).max(50).optional(),
  })
  .refine((q) => Boolean(q.id) || Boolean(q.order_ref && q.template_id), { message: 'id, or order_ref with template_id, is required' })

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['agency_research.documents.view'] },
}

export function versionEnvelope(version: AgencyResearchDocumentVersion) {
  return {
    id: version.id,
    document_id: `${version.templateId}@${version.orderRef}`,
    template_id: version.templateId,
    schema_version: version.schemaVersion,
    order_id: version.orderRef,
    version: `${version.versionNo}.0`,
    version_no: version.versionNo,
    status: version.status,
    input_versions: version.inputVersions,
    field_evidence: version.fieldEvidence,
    approval_records: version.approvalRecords,
    simulation_flag: version.simulationFlag,
    issues: version.issues,
    task_run_id: version.taskRunId,
    qa_result: version.qaResult,
    created_at: version.createdAt.toISOString(),
  }
}

export async function GET(request: Request): Promise<Response> {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return NextResponse.json({ error: 'id, or order_ref with template_id, is required' }, { status: 400 })
  const auth = await getAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return NextResponse.json({ error: 'Organization scope is required' }, { status: 403 })
  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em')
  if (query.data.id) {
    const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, id: query.data.id }, undefined, scope)
    if (!version) return NextResponse.json({ error: 'Document version not found' }, { status: 404 })
    return NextResponse.json({ ...versionEnvelope(version), data: version.data, rendered_md: version.renderedMd, client_view_md: version.clientViewMd })
  }
  const versions = await findWithDecryption(
    em,
    AgencyResearchDocumentVersion,
    { ...scope, orderRef: query.data.order_ref as string, templateId: query.data.template_id as string },
    { orderBy: { versionNo: 'desc' } },
    scope,
  )
  return NextResponse.json({ items: versions.map(versionEnvelope), total: versions.length })
}

const envelopeSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  template_id: z.string(),
  schema_version: z.string(),
  order_id: z.string(),
  version: z.string(),
  version_no: z.number().int(),
  status: z.string(),
  input_versions: z.unknown(),
  field_evidence: z.unknown(),
  approval_records: z.unknown(),
  simulation_flag: z.boolean(),
  issues: z.unknown(),
  task_run_id: z.string(),
  qa_result: z.unknown().nullable(),
  created_at: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Research',
  methods: {
    GET: {
      summary: 'Read a research document version, or list the versions of a document',
      description: 'With `id`: the envelope, typed data, internal markdown and client projection of one version. With `order_ref` + `template_id`: the version list (envelopes only).',
      query: querySchema,
      responses: [
        {
          status: 200,
          schema: z.union([
            envelopeSchema.extend({ data: z.unknown(), rendered_md: z.string(), client_view_md: z.string().nullable() }),
            z.object({ items: z.array(envelopeSchema), total: z.number().int() }),
          ]),
        },
      ],
      errors: [
        { status: 400, description: 'Invalid query' },
        { status: 401, description: 'Authentication required' },
        { status: 403, description: 'Organization scope required' },
        { status: 404, description: 'Version not found' },
      ],
    },
  },
}
