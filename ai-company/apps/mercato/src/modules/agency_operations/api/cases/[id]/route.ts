import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { readCaseProcess } from '../../../lib/processProjection/query'
import { caseProcessResponseSchema } from '../../../lib/processProjection/contract'

const pathSchema = z.object({ id: z.uuid() })
export const metadata = { GET: {
  requireAuth: true,
  requireFeatures: ['agency_operations.cases.view', 'workflows.instances.view', 'workflows.tasks.view'],
} }

export async function GET(request: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const auth = await getAuthFromRequest(request)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const params = pathSchema.safeParse(await context.params)
  if (!params.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
  const result = await readCaseProcess(await createRequestContainer(), params.data.id, {
    tenantId: auth.tenantId, organizationId: auth.orgId, userId: auth.sub, roleNames: auth.roles ?? [],
  })
  if (!result) return Response.json({ error: 'api.errors.notFound' }, { status: 404 })
  return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Operations', pathParams: pathSchema,
  methods: { GET: {
    summary: 'Read persisted client submission processes for an employee case',
    responses: [{ status: 200, description: 'Latest 100 submissions with native execution and visible pending tasks', schema: caseProcessResponseSchema }],
    errors: [{ status: 400, description: 'Invalid case id' }, { status: 401, description: 'Authentication required' }, { status: 403, description: 'Insufficient permissions' }, { status: 404, description: 'Case not found in scope' }],
  } },
}
