import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { AGENCY_PUBLICATION_DESTINATION_SERVICE, configureDiscordDestinationRequestSchema, type PublicationDestinationService } from '../../../../lib/publicationDestination/contracts'
import { publicationDestinationResultSchema } from '@/modules/agency_research/lib/publicationDestination/contracts'

const pathSchema = z.object({ id: z.uuid() })
const bodySchema = configureDiscordDestinationRequestSchema.omit({ caseId: true })
export const metadata = { POST: { requireAuth: true,
  requireFeatures: ['agency_operations.cases.view', 'customers.companies.view', 'agency_research.manage', 'channel_discord.view'],
} }

export async function POST(req: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const params = pathSchema.safeParse(await context.params)
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(body)
  if (!params.success || !parsed.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
  const container = await createRequestContainer()
  try {
    const guard = await runRouteMutationGuards({ container, req,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId },
      input: { resourceKind: 'agency_operations:agency_case', resourceId: params.data.id, operation: 'update', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const guarded = bodySchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
    const result = await container.resolve<PublicationDestinationService>(AGENCY_PUBLICATION_DESTINATION_SERVICE).configure(
      { tenantId: auth.tenantId, organizationId: auth.orgId, userId: auth.sub },
      { ...guarded.data, caseId: params.data.id },
    )
    if (result.status === 'configured') await guard.runAfterSuccess()
    return Response.json(result, { status: result.status === 'configured' && !result.replayed ? 201 : 200,
      headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = { tag: 'Agency Operations', pathParams: pathSchema, methods: {
  POST: { summary: 'Save an explicit Discord destination without verifying access, granting consent or sending',
    requestBody: { contentType: 'application/json', schema: bodySchema },
    responses: [{ status: 201, description: 'Immutable destination configuration saved; sending remains disabled', schema: publicationDestinationResultSchema },
      { status: 200, description: 'Existing configuration or explicit unmet prerequisite', schema: publicationDestinationResultSchema }],
    errors: [{ status: 400, description: 'Invalid request' }, { status: 401, description: 'Staff authentication required' },
      { status: 403, description: 'Insufficient native permissions' }, { status: 404, description: 'Case or native channel outside scope' }],
  },
} }
