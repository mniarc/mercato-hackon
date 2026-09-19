import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { tovDiscoveryStatusSchema } from '../../../lib/tovDiscovery/contracts'
import { createTovDiscoveryService } from '../../../lib/tovDiscovery/service'

const pathSchema = z.object({ id: z.uuid() })
export const metadata = { GET: { requireAuth: true,
  requireFeatures: ['agency_operations.cases.view', 'customers.companies.view', 'agency_tov.view'],
} }

export async function GET(req: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const parsed = pathSchema.safeParse(await context.params)
  if (!parsed.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
  try {
    const result = await createTovDiscoveryService(await createRequestContainer()).get({
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      userId: auth.sub,
      discoveryRunId: parsed.data.id,
    })
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Operations',
  pathParams: pathSchema,
  methods: { GET: {
    summary: 'Read a saved case-scoped tone-of-voice source discovery result',
    responses: [{ status: 200, schema: tovDiscoveryStatusSchema }],
    errors: [
      { status: 400, description: 'Invalid discovery run reference' },
      { status: 401, description: 'Staff authentication required' },
      { status: 403, description: 'Insufficient staff permissions' },
      { status: 404, description: 'Discovery run or paid case not found in scope' },
    ],
  } },
}
