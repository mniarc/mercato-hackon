import type { EntityManager } from '@mikro-orm/postgresql'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../../data/entities'
import { ustaleniaDataSchema } from '../../../data/schemas/ustalenia'
import { firstContactQuestions } from '../../../lib/research/render/brief'

/**
 * The customer portal's brief surface (step 4.3's delivery): the client view of
 * the current KLI-BRIEF and the questions of the first contact — never the
 * envelope, the internal markdown, the evidence registry or QA logs. Approval
 * itself is the spine's (4.3–4.6).
 */

const querySchema = z.object({ order_ref: z.string().trim().min(1).max(200) })

export const metadata = { GET: { requireAuth: false } }

/**
 * A customer may read only their own order. Orders are not persisted by the
 * portal yet, so ownership is the convention `orderRef` starts with the
 * customer's entity id; the portal (Krysia) replaces this with a lookup of the
 * persisted order once it exists. Throws 403 by default.
 */
export function assertCustomerOwnsOrder(auth: Pick<CustomerAuthContext, 'customerEntityId'>, orderRef: string): void {
  const customerEntityId = auth.customerEntityId ?? ''
  if (customerEntityId && orderRef.startsWith(customerEntityId)) return
  // TODO(portal): resolve the persisted order for `orderRef` and compare its customer entity id.
  throw new CrudHttpError(403, { error: 'This order is not yours' })
}

export const portalBriefResponseSchema = z.object({
  order_ref: z.string(),
  version: z.string(),
  status: z.string(),
  client_view_md: z.string().nullable(),
  questions: z.array(z.object({ question_id: z.string(), question: z.string(), hint: z.string(), reason: z.string(), brief_field: z.string(), priority: z.string() })),
})

export async function GET(request: Request): Promise<Response> {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return NextResponse.json({ error: 'order_ref is required' }, { status: 400 })
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Customer authentication required' }, { status: 401 })
  if (!auth.customerEntityId) return NextResponse.json({ error: 'Customer account not linked' }, { status: 403 })
  try {
    assertCustomerOwnsOrder(auth, query.data.order_ref)
    const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const brief = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: query.data.order_ref, templateId: 'WZR-BRIEF', deletedAt: null }, undefined, scope)
    if (!brief?.currentVersionId) return NextResponse.json({ error: 'Brief not ready' }, { status: 404 })
    const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, id: brief.currentVersionId }, undefined, scope)
    if (!version) return NextResponse.json({ error: 'Brief not ready' }, { status: 404 })
    const ustalenia = await findOneWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef: query.data.order_ref, templateId: 'WZR-USTALENIA', deletedAt: null }, undefined, scope)
    const ustaleniaVersion = ustalenia?.currentVersionId
      ? await findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, id: ustalenia.currentVersionId }, undefined, scope)
      : null
    const parsed = ustaleniaVersion ? ustaleniaDataSchema.safeParse(ustaleniaVersion.data) : null
    const questions = parsed?.success
      ? firstContactQuestions(parsed.data).map((q) => ({ question_id: q.question_id, question: q.question, hint: q.hint, reason: q.reason, brief_field: q.brief_field, priority: q.priority }))
      : []
    return NextResponse.json({ order_ref: query.data.order_ref, version: `${version.versionNo}.0`, status: brief.status, client_view_md: version.clientViewMd, questions })
  } catch (error) {
    if (isCrudHttpError(error)) return NextResponse.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Research',
  methods: {
    GET: {
      summary: 'Read the current brief of the signed-in customer\'s order',
      description: 'The client projection of KLI-BRIEF (≤ 700 words) and the questions of the first contact (≤ 8). No internal data.',
      query: querySchema,
      responses: [{ status: 200, schema: portalBriefResponseSchema }],
      errors: [
        { status: 400, description: 'order_ref missing' },
        { status: 401, description: 'Customer authentication required' },
        { status: 403, description: 'Customer account not linked or order not owned' },
        { status: 404, description: 'Brief not ready' },
      ],
    },
  },
}
