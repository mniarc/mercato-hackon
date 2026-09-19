import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  tovDiscoveryRequestSchema,
  tovDiscoveryStatusSchema,
} from '../../lib/tovDiscovery/contracts'
import { createTovDiscoveryService } from '../../lib/tovDiscovery/service'

const features = [
  'agency_operations.cases.view',
  'customers.companies.view',
  'agency_tov.manage',
  'agent_orchestrator.agents.run',
  'agent_orchestrator.web_search',
  'agent_orchestrator.web_fetch',
]
export const metadata = { POST: { requireAuth: true, requireFeatures: features } }

export async function POST(req: Request): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const parsed = tovDiscoveryRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
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
    const guarded = tovDiscoveryRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
    const result = await createTovDiscoveryService(container).start({
      ...guarded.data,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      userId: auth.sub,
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
  methods: { POST: {
    summary: 'Discover candidate public sources for a paid agency case tone-of-voice intake',
    description: 'Staff-only. Runs the native agency_tov source scout and saves its case-scoped candidate targets. It does not collect a corpus, accept sources, start the specialist, or create a business spend approval; native runtime permissions and configured limits still govern execution.',
    requestBody: { schema: tovDiscoveryRequestSchema },
    responses: [{ status: 200, description: 'Saved discovery result or exact idempotent replay', schema: tovDiscoveryStatusSchema }],
    errors: [
      { status: 400, description: 'Invalid discovery request' },
      { status: 401, description: 'Staff authentication required' },
      { status: 403, description: 'Insufficient case, agent-run, web-search, or web-fetch permissions' },
      { status: 404, description: 'Paid case not found in scope' },
      { status: 409, description: 'Case is not backed by the canonical paid analysis workflow' },
    ],
  } },
}
