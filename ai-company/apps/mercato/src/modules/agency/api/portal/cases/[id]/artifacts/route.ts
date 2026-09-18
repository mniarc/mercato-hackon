import { z } from 'zod'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CLIENT_ARTIFACT_SERVICE, clientArtifactSummarySchema, type ClientArtifactService } from '@/modules/agency_operations/lib/contracts/clientArtifact'
import { clientCaseErrorResponse, clientCaseResponseHeaders, resolveClientCaseQuery } from '../../../../../lib/clientCaseStatusBridge'

const pathParamsSchema = z.object({ id: z.uuid() })
type RouteContext = { params: Promise<{ id: string }> | { id: string } }
export const metadata = { GET: { requireAuth: false } }

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { identity } = await resolveClientCaseQuery(request)
    const params = pathParamsSchema.safeParse(await context.params)
    if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const container = await createRequestContainer()
    const items = await container.resolve<ClientArtifactService>(CLIENT_ARTIFACT_SERVICE).list(identity, params.data.id)
    return Response.json({ items }, { headers: clientCaseResponseHeaders })
  } catch (error) {
    return clientCaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', pathParams: pathParamsSchema,
  methods: { GET: {
    summary: 'List exact client-facing ToV versions linked to an owned case',
    description: 'Native customer session required. Empty items means no linked KLI-TOV version is available; it does not imply completion. Internal per-author evidence documents are excluded. No review invitation, current-version or approval state is inferred.',
    responses: [{ status: 200, schema: z.object({ items: z.array(clientArtifactSummarySchema) }) }],
    errors: [
      { status: 400, description: 'Invalid case id' },
      { status: 401, description: 'Customer authentication required' },
      { status: 403, description: 'Inactive or unlinked customer account' },
      { status: 404, description: 'Case not found in customer scope' },
    ],
  } },
}
