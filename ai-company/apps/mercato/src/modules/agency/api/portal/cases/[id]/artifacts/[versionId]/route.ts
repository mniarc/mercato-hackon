import { z } from 'zod'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CLIENT_ARTIFACT_SERVICE, clientArtifactSchema, type ClientArtifactService } from '@/modules/agency_operations/lib/contracts/clientArtifact'
import { clientCaseErrorResponse, clientCaseResponseHeaders, resolveClientCaseQuery } from '../../../../../../lib/clientCaseStatusBridge'

const pathParamsSchema = z.object({ id: z.uuid(), versionId: z.uuid() })
type Params = z.infer<typeof pathParamsSchema>
type RouteContext = { params: Promise<Params> | Params }
export const metadata = { GET: { requireAuth: false } }

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { identity } = await resolveClientCaseQuery(request)
    const params = pathParamsSchema.safeParse(await context.params)
    if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const container = await createRequestContainer()
    const artifact = await container.resolve<ClientArtifactService>(CLIENT_ARTIFACT_SERVICE)
      .get(identity, params.data.id, params.data.versionId)
    if (!artifact) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    return Response.json(artifact, { headers: clientCaseResponseHeaders })
  } catch (error) {
    return clientCaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', pathParams: pathParamsSchema,
  methods: { GET: {
    summary: 'Read a case-linked KLI-TOV version as client-safe structured content',
    description: 'Requires an owned case and its exact persisted workflow result reference. Returns an allowlisted JSON projection, not raw research, Markdown or HTML. Treat strings as untrusted text. This is not the agencyReview task/approval envelope; provider traces, corpus, citations and QA payloads are excluded.',
    responses: [{ status: 200, schema: clientArtifactSchema }],
    errors: [
      { status: 400, description: 'Invalid case or version id' },
      { status: 401, description: 'Customer authentication required' },
      { status: 403, description: 'Inactive or unlinked customer account' },
      { status: 404, description: 'Case or client-facing version not found in this case scope' },
      { status: 409, description: 'Stored version cannot be projected to supported client content' },
    ],
  } },
}
