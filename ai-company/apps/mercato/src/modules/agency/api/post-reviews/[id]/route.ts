import { z } from 'zod'
import { getCustomerAuthFromRequest, requireCustomerFeature } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import { PORTAL_TASKS_VIEW_FEATURE, PORTAL_TASKS_COMPLETE_FEATURE } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { readBoundedRequestBody, WebhookBodyTooLargeError } from '@open-mercato/shared/lib/webhooks/body'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { POST_REVIEW_SERVICE, postReviewReadSchema, postReviewRequestSchema, postReviewReceiptSchema, type PostReviewService } from '@/modules/agency_operations/lib/postReview/contracts'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../lib/clientCaseStatusBridge'

const pathParams = z.object({ id: z.uuid() })
type RouteContext = { params: Promise<{ id: string }> | { id: string } }
export const metadata = { GET: { requireAuth: false }, POST: { requireAuth: false } }
async function authorize(request: Request, context: RouteContext, feature: string) {
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
  const params = pathParams.safeParse(await context.params)
  if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
  const container = await createRequestContainer()
  await requireCustomerFeature(auth, [feature], container.resolve<CustomerRbacService>('customerRbacService'))
  return { auth, container, taskId: params.data.id }
}
export async function GET(request: Request, context: RouteContext) {
  try {
    const { auth, container, taskId } = await authorize(request, context, PORTAL_TASKS_VIEW_FEATURE)
    const result = await container.resolve<PostReviewService>(POST_REVIEW_SERVICE).read(auth, taskId)
    return Response.json(result, { headers: clientCaseResponseHeaders })
  } catch (error) { return error instanceof Response ? error : clientCaseErrorResponse(error) }
}
export async function POST(request: Request, context: RouteContext) {
  try {
    const { auth, container, taskId } = await authorize(request, context, PORTAL_TASKS_COMPLETE_FEATURE)
    let raw: unknown
    try { raw = JSON.parse(await readBoundedRequestBody(request, { maxBytes: 100000 })) } catch (error) {
      throw new CrudHttpError(error instanceof WebhookBodyTooLargeError ? 413 : 400, { error: 'api.errors.badRequest' })
    }
    const input = postReviewRequestSchema.safeParse(raw)
    if (!input.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const guard = await runRouteMutationGuards({
      container, req: request, auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: auth.resolvedFeatures },
      input: { resourceKind: 'agency_operations:agency_client_submission', operation: 'create', mutationPayload: input.data },
    })
    if (!guard.ok) return guard.response
    const guarded = postReviewRequestSchema.safeParse({ ...input.data, ...guard.modifiedPayload })
    if (!guarded.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await container.resolve<PostReviewService>(POST_REVIEW_SERVICE).respond(auth, taskId, guarded.data)
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: clientCaseResponseHeaders })
  } catch (error) { return error instanceof Response ? error : clientCaseErrorResponse(error) }
}
const errors = [{ status: 401, description: 'Customer authentication required' }, { status: 403, description: 'Native portal task permission required' }, { status: 404, description: 'Review task or post not visible to this customer' }]
export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', pathParams,
  methods: {
    GET: { summary: 'Read the exact invited post content', responses: [{ status: 200, schema: postReviewReadSchema }], errors },
    POST: { summary: 'Receive an original content response through shared intake; not document acceptance',
      requestBody: { contentType: 'application/json', schema: postReviewRequestSchema },
      responses: [200, 201].map((status) => ({ status, schema: postReviewReceiptSchema })),
      errors: [...errors, { status: 400, description: 'Invalid post response' }, { status: 409, description: 'Stale post or invalid QA or response conflict' }, { status: 413, description: 'Request exceeds 100 KB' }],
    },
  },
}




