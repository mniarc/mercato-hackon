import { z } from 'zod'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { clientCaseTasksSchema } from '@/modules/agency_operations/lib/clientCaseTasks/contracts'
import { readClientCaseTasks } from '@/modules/agency_operations/lib/clientCaseTasks/query'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../../../lib/clientCaseStatusBridge'

const paramsSchema = z.object({ id: z.uuid() })
export const metadata = { GET: { requireAuth: false } }

export async function GET(request: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  try {
    const auth = await getCustomerAuthFromRequest(request)
    if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await readClientCaseTasks(await createRequestContainer(), auth, params.data.id)
    return Response.json(result, { headers: clientCaseResponseHeaders })
  } catch (error) {
    if (error instanceof Response) return error
    return clientCaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', pathParams: paramsSchema,
  methods: { GET: {
    summary: 'Read visible open customer tasks bound to this agency case',
    description: 'Uses native customer task visibility. No tasks means no open customer task, not that the case is complete. Task pages retain decision authority.',
    responses: [{ status: 200, schema: clientCaseTasksSchema }],
    errors: [{ status: 400, description: 'Invalid case id' }, { status: 401, description: 'Customer authentication required' },
      { status: 403, description: 'Task visibility feature or active company link required' }, { status: 404, description: 'Case not found in customer scope' }],
  } },
}
