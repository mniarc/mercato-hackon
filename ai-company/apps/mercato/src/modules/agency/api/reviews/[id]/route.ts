import { z } from 'zod'
import { getCustomerAuthFromRequest, requireCustomerFeature } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import { PORTAL_TASKS_VIEW_FEATURE } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { BRIEF_REVIEW_SERVICE, briefReviewReadSchema, type BriefReviewService } from '@/modules/agency_operations/lib/briefStrategyProcess/contracts'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../lib/clientCaseStatusBridge'

const pathParams = z.object({ id: z.uuid() })
export const metadata = { GET: { requireAuth: false } }
export async function GET(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const auth = await getCustomerAuthFromRequest(request)
    if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
    const params = pathParams.safeParse(await context.params)
    if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const container = await createRequestContainer()
    await requireCustomerFeature(auth, [PORTAL_TASKS_VIEW_FEATURE], container.resolve<CustomerRbacService>('customerRbacService'))
    const result = await container.resolve<BriefReviewService>(BRIEF_REVIEW_SERVICE).read(auth, params.data.id)
    return Response.json(result, { headers: clientCaseResponseHeaders })
  } catch (error) { return error instanceof Response ? error : clientCaseErrorResponse(error) }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', pathParams,
  methods: { GET: {
    summary: 'Read the client-safe exact brief snapshot for an owned native review task',
    responses: [{ status: 200, schema: briefReviewReadSchema }],
    errors: [{ status: 400, description: 'Invalid task id' }, { status: 401, description: 'Customer authentication required' }, { status: 403, description: 'Portal task view permission required' }, { status: 404, description: 'Review task not visible to this customer' }],
  } },
}
