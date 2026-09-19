import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'

/**
 * Staff read of an order's research documents: one row per (order, template)
 * with its current version reference. Bodies are read through
 * `document-versions?id=`; this list carries ids, statuses and counts only.
 */

const querySchema = z.object({ order_ref: z.string().trim().min(1).max(200) })

const documentItemSchema = z.object({
  id: z.string(),
  orderRef: z.string(),
  brand: z.string(),
  templateId: z.string(),
  outputId: z.string(),
  status: z.string(),
  currentVersionId: z.string().nullable(),
  currentVersionNo: z.number().int().nullable(),
  currentVersionStatus: z.string().nullable(),
  issues: z.number().int(),
  hasClientView: z.boolean(),
  updatedAt: z.string().nullable(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['agency_research.documents.view'] },
}

export async function GET(request: Request): Promise<Response> {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return NextResponse.json({ error: 'order_ref is required' }, { status: 400 })
  const auth = await getAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return NextResponse.json({ error: 'Organization scope is required' }, { status: 403 })
  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em')
  const documents = await findWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: query.data.order_ref, deletedAt: null }, { orderBy: { templateId: 'asc' } }, scope)
  const versionIds = documents.map((d) => d.currentVersionId).filter((id): id is string => id !== null)
  const versions = versionIds.length ? await findWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, id: { $in: versionIds } }, undefined, scope) : []
  const byId = new Map(versions.map((v) => [v.id, v]))
  const items = documents.map((d) => {
    const current = d.currentVersionId ? (byId.get(d.currentVersionId) ?? null) : null
    return {
      id: d.id,
      orderRef: d.orderRef,
      brand: d.brand,
      templateId: d.templateId,
      outputId: d.outputId,
      status: d.status,
      currentVersionId: d.currentVersionId,
      currentVersionNo: current?.versionNo ?? null,
      currentVersionStatus: current?.status ?? null,
      issues: Array.isArray(current?.issues) ? current.issues.length : 0,
      hasClientView: Boolean(current?.clientViewMd),
      updatedAt: d.updatedAt ? d.updatedAt.toISOString() : null,
    }
  })
  return NextResponse.json({ items, total: items.length })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Research',
  methods: {
    GET: {
      summary: 'List the research documents of an order',
      description: 'One row per document template (WEW-ZRODLA, WEW-AUDYT, … KLI-BRIEF) with its current version reference, in the authenticated employee organization scope.',
      query: querySchema,
      responses: [{ status: 200, schema: z.object({ items: z.array(documentItemSchema), total: z.number().int() }) }],
      errors: [
        { status: 400, description: 'order_ref missing' },
        { status: 401, description: 'Authentication required' },
        { status: 403, description: 'Organization scope required' },
      ],
    },
  },
}
