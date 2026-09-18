import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { clientCaseListQuerySchema, clientCaseListResultSchema } from '@/modules/agency_operations/lib/contracts/clientCaseQuery'
import { clientCaseErrorResponse, clientCaseResponseHeaders, resolveClientCaseQuery } from '../../../lib/clientCaseStatusBridge'

export const metadata = { GET: { requireAuth: false } }

export async function GET(request: Request): Promise<Response> {
  try {
    const { identity, service } = await resolveClientCaseQuery(request)
    const query = clientCaseListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!query.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    return Response.json(await service.list(identity, query.data), { headers: clientCaseResponseHeaders })
  } catch (error) {
    return clientCaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency',
  methods: {
    GET: {
      summary: 'List cases owned by the signed-in customer',
      description: 'Native customer session required. Customer, tenant and organization scope come only from the session and current account linkage. Newest first; workflow is the current native status, or null if no scoped run is available. Internal context, traces and errors are never returned.',
      query: clientCaseListQuerySchema,
      responses: [{ status: 200, schema: clientCaseListResultSchema }],
      errors: [
        { status: 400, description: 'Invalid pagination' },
        { status: 401, description: 'Customer authentication required' },
        { status: 403, description: 'Inactive or unlinked customer account' },
      ],
    },
  },
}
