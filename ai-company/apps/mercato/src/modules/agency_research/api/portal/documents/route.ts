import type { EntityManager } from '@mikro-orm/postgresql'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../../data/entities'
import { outputIdByTemplate } from '../../../data/schemas/envelope'
import { clientViewTemplates, type ClientViewTemplate } from '../../../lib/contracts'
import { assertCustomerOwnsOrder } from '../brief/route'

/**
 * The customer portal's document surface for everything after the brief: the
 * client projection of the current KLI-STRATEGIA, KLI-TOV, KLI-PLAN, KLI-POST
 * and KLI-PAKIET of the customer's own order — never the envelope, the internal
 * markdown, the evidence register or QA logs. Without `output`, the list of what
 * exists and its status, so the portal can show the order's progress. Approvals,
 * selections and consents are recorded by the spine / portal, not here.
 */

const outputIds = clientViewTemplates.map((template) => outputIdByTemplate[template])

const querySchema = z.object({
  order_ref: z.string().trim().min(1).max(200),
  /** `KLI-STRATEGIA` … `KLI-PAKIET`; omitted = the list of the order's client documents. */
  output: z.enum(outputIds as [string, ...string[]]).optional(),
})

export const metadata = { GET: { requireAuth: false } }

export const portalDocumentSchema = z.object({
  order_ref: z.string(),
  output_id: z.string(),
  version: z.string(),
  status: z.string(),
  simulation: z.boolean(),
  client_view_md: z.string().nullable(),
})

export const portalDocumentListSchema = z.object({
  order_ref: z.string(),
  documents: z.array(z.object({ output_id: z.string(), version: z.string().nullable(), status: z.string(), simulation: z.boolean(), has_client_view: z.boolean() })),
})

function templateOf(outputId: string): ClientViewTemplate {
  return clientViewTemplates.find((template) => outputIdByTemplate[template] === outputId) as ClientViewTemplate
}

export async function GET(request: Request): Promise<Response> {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return NextResponse.json({ error: `order_ref is required; output must be one of ${outputIds.join(', ')}` }, { status: 400 })
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Customer authentication required' }, { status: 401 })
  if (!auth.customerEntityId) return NextResponse.json({ error: 'Customer account not linked' }, { status: 403 })
  try {
    assertCustomerOwnsOrder(auth, query.data.order_ref)
    const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    if (!query.data.output) {
      const documents = await findWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: query.data.order_ref, templateId: { $in: [...clientViewTemplates] }, deletedAt: null }, undefined, scope)
      const rows = await Promise.all(
        documents.map(async (document) => {
          const version = document.currentVersionId ? await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, id: document.currentVersionId }, undefined, scope) : null
          return { output_id: document.outputId, version: version ? `${version.versionNo}.0` : null, status: document.status, simulation: version?.simulationFlag ?? false, has_client_view: Boolean(version?.clientViewMd) }
        }),
      )
      return NextResponse.json({ order_ref: query.data.order_ref, documents: rows })
    }
    const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: query.data.order_ref, templateId: templateOf(query.data.output), deletedAt: null }, undefined, scope)
    if (!document?.currentVersionId) return NextResponse.json({ error: 'Document not ready' }, { status: 404 })
    const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, id: document.currentVersionId }, undefined, scope)
    if (!version) return NextResponse.json({ error: 'Document not ready' }, { status: 404 })
    return NextResponse.json({ order_ref: query.data.order_ref, output_id: document.outputId, version: `${version.versionNo}.0`, status: document.status, simulation: version.simulationFlag, client_view_md: version.clientViewMd })
  } catch (error) {
    if (isCrudHttpError(error)) return NextResponse.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Research',
  methods: {
    GET: {
      summary: "Read the client documents of the signed-in customer's order",
      description: 'The client projection of the current KLI-STRATEGIA / KLI-TOV / KLI-PLAN / KLI-POST / KLI-PAKIET (`output`), or the list of the order\'s client documents with status and version. No internal data; `simulation` says the document was built on inputs the customer has not approved yet.',
      query: querySchema,
      responses: [{ status: 200, schema: z.union([portalDocumentSchema, portalDocumentListSchema]) }],
      errors: [
        { status: 400, description: 'order_ref missing or output unknown' },
        { status: 401, description: 'Customer authentication required' },
        { status: 403, description: 'Customer account not linked or order not owned' },
        { status: 404, description: 'Document not ready' },
      ],
    },
  },
}
