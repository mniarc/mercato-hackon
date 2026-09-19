import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { TOV_DISCOVERY_WRITE_FEATURES } from '../../../../lib/tovDiscovery/service'
import {
  createTovCollectionService,
  tovCollectionRequestSchema,
  tovCollectionStatusSchema,
} from '../../../../lib/tovDiscovery/collection'

const pathSchema = z.object({ id: z.uuid() })
export const metadata = { POST: { requireAuth: true, requireFeatures: TOV_DISCOVERY_WRITE_FEATURES } }

export async function POST(req: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const path = pathSchema.safeParse(await context.params)
  const parsed = tovCollectionRequestSchema.safeParse(await req.json().catch(() => null))
  if (!path.success || !parsed.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
  const container = await createRequestContainer()
  try {
    const guard = await runRouteMutationGuards({
      container,
      req,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId },
      input: {
        resourceKind: 'agency_operations:agency_case',
        resourceId: parsed.data.caseId,
        operation: 'update',
        mutationPayload: parsed.data,
      },
    })
    if (!guard.ok) return guard.response
    const guarded = tovCollectionRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
    const result = await createTovCollectionService(container).collect({
      ...guarded.data,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      userId: auth.sub,
      discoveryRunId: path.data.id,
    })
    await guard.runAfterSuccess()
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Operations',
  pathParams: pathSchema,
  methods: { POST: {
    summary: 'Collect explicitly selected source-scout targets into the existing ToV intake',
    description: 'Staff-only and disabled by default. Revalidates exact target IDs from the saved discovery run, uses the configured agency_tov corpus scraper with fixed limits, then hands normalized posts to the existing case-bound ToV intake.',
    requestBody: { schema: tovCollectionRequestSchema },
    responses: [{ status: 200, description: 'Saved collection handoff, replay, or actionable terminal result', schema: tovCollectionStatusSchema }],
    errors: [
      { status: 400, description: 'Invalid discovery collection request' },
      { status: 401, description: 'Staff authentication required' },
      { status: 403, description: 'Insufficient case, agent-run, or web-egress permissions' },
      { status: 404, description: 'Discovery run or paid case not found in scope' },
      { status: 409, description: 'Collection is disabled, unavailable, already unresolved, mismatched, or the intake already exists' },
    ],
  } },
}

