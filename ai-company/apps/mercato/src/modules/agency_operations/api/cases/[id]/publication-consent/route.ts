import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { PUBLICATION_CONSENT_REQUEST_SERVICE, publicationConsentInvitationReceiptSchema, type PublicationConsentRequestService } from '../../../../lib/publicationConsentRequest/contracts'

const pathParams = z.object({ id: z.uuid() })
const bodySchema = z.object({ postVersionId: z.uuid() }).strict()
export const metadata = { POST: { requireAuth: true, requireFeatures: ['agency_operations.cases.view', 'customers.companies.view', 'agency_research.manage'] } }
export async function POST(req: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const params = pathParams.safeParse(await context.params)
  let raw: unknown
  try { raw = await req.json() } catch { return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(raw)
  if (!params.success || !parsed.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
  const container = await createRequestContainer()
  try {
    const guard = await runRouteMutationGuards({ container, req,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId },
      input: { resourceKind: 'agency_operations:agency_case', resourceId: params.data.id, operation: 'update', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const input = bodySchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!input.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
    const result = await container.resolve<PublicationConsentRequestService>(PUBLICATION_CONSENT_REQUEST_SERVICE).invite({
      tenantId: auth.tenantId, organizationId: auth.orgId, userId: auth.sub, caseId: params.data.id, postVersionId: input.data.postVersionId,
    })
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}
export const openApi: OpenApiRouteDoc = { tag: 'Agency Operations', pathParams, methods: {
  POST: { summary: 'Request separate consent for an approved post at its current destination; no sending',
    requestBody: { contentType: 'application/json', schema: bodySchema },
    responses: [200, 201].map((status) => ({ status, schema: publicationConsentInvitationReceiptSchema })),
    errors: [{ status: 400, description: 'Invalid request' }, { status: 401, description: 'Staff authentication required' },
      { status: 403, description: 'Staff permissions required' }, { status: 404, description: 'Case outside scope' },
      { status: 409, description: 'Current approved post and configured target required, or consent already valid' }],
  },
} }
