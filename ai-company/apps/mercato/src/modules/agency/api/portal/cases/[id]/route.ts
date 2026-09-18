import { z } from 'zod'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { clientCaseItemSchema } from '@/modules/agency_operations/lib/contracts/clientCaseQuery'
import { clientCaseErrorResponse, clientCaseResponseHeaders, resolveClientCaseQuery } from '../../../../lib/clientCaseStatusBridge'

const pathParamsSchema = z.object({ id: z.uuid() })
type RouteContext = { params: Promise<{ id: string }> | { id: string } }

export const metadata = { GET: { requireAuth: false } }

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { identity, service } = await resolveClientCaseQuery(request)
    const params = pathParamsSchema.safeParse(await context.params)
    if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const agencyCase = await service.get(identity, params.data.id)
    if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    return Response.json(agencyCase, { headers: clientCaseResponseHeaders })
  } catch (error) {
    return clientCaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency',
  pathParams: pathParamsSchema,
  methods: {
    GET: {
      summary: 'Read a case owned by the signed-in customer',
      description: 'Native customer session required. A nonexistent case and another customer’s, tenant’s or organization’s case both return 404. Workflow is a safe native status projection; no employee-only data is exposed.',
      responses: [{ status: 200, schema: clientCaseItemSchema }],
      errors: [
        { status: 400, description: 'Invalid case id' },
        { status: 401, description: 'Customer authentication required' },
        { status: 403, description: 'Inactive or unlinked customer account' },
        { status: 404, description: 'Case not found in the customer scope' },
      ],
    },
  },
}
