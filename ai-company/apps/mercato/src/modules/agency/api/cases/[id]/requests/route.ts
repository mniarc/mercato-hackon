import { z } from 'zod'
import { getCustomerAuthFromRequest, requireCustomerFeature } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import { PORTAL_TASKS_COMPLETE_FEATURE } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { readBoundedRequestBody, WebhookBodyTooLargeError } from '@open-mercato/shared/lib/webhooks/body'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { BRIEF_REVIEW_SERVICE, briefReviewRequestSchema, briefReviewReceiptSchema, type BriefReviewService } from '@/modules/agency_operations/lib/briefStrategyProcess/contracts'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../../lib/clientCaseStatusBridge'

const pathParams = z.object({ id: z.uuid() })
export const metadata = { POST: { requireAuth: false } }
export async function POST(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const auth = await getCustomerAuthFromRequest(request)
    if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
    const params = pathParams.safeParse(await context.params)
    if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const container = await createRequestContainer()
    await requireCustomerFeature(auth, [PORTAL_TASKS_COMPLETE_FEATURE], container.resolve<CustomerRbacService>('customerRbacService'))
    let body: unknown
    try { body = JSON.parse(await readBoundedRequestBody(request, { maxBytes: 100000 })) } catch (error) {
      throw new CrudHttpError(error instanceof WebhookBodyTooLargeError ? 413 : 400, { error: 'api.errors.badRequest' })
    }
    const input = briefReviewRequestSchema.safeParse(body)
    if (!input.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const guard = await runRouteMutationGuards({
      container, req: request,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: auth.resolvedFeatures },
      input: { resourceKind: 'agency_operations:agency_client_submission', operation: 'create', mutationPayload: input.data },
    })
    if (!guard.ok) return guard.response
    const guarded = briefReviewRequestSchema.safeParse({ ...input.data, ...guard.modifiedPayload })
    if (!guarded.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await container.resolve<BriefReviewService>(BRIEF_REVIEW_SERVICE).respond(auth, params.data.id, guarded.data)
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: clientCaseResponseHeaders })
  } catch (error) { return error instanceof Response ? error : clientCaseErrorResponse(error) }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', pathParams,
  methods: { POST: {
    summary: 'Receive one version-bound brief response through shared client intake',
    description: 'Records the original client request; never directly approves a brief. Requires an actual native invitation for this contact and current version. Stable externalEventId replays return the stored receipt.',
    requestBody: { contentType: 'application/json', schema: briefReviewRequestSchema },
    responses: [200, 201].map((status) => ({ status, schema: briefReviewReceiptSchema })),
    errors: [{ status: 400, description: 'Invalid response' }, { status: 401, description: 'Customer authentication required' }, { status: 403, description: 'Portal task completion permission required' }, { status: 404, description: 'Case, version or invitation not owned' }, { status: 409, description: 'Stale, unavailable, conflicting or incomplete response continuation' }, { status: 413, description: 'Request exceeds 100 KB' }],
  } },
}
