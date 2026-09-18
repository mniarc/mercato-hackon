import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { AGENCY_HUMAN_ATTENTION_SERVICE, humanAttentionRequestSchema, type AgencyHumanAttentionService } from '../../../../lib/humanAttentionService'

const pathSchema = z.object({ id: z.uuid() })
export const metadata = { POST: { requireAuth: true, requireFeatures: ['agency_operations.cases.escalate'] } }

export async function POST(req: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'Organization scope is required' }, { status: 403 })
  const params = pathSchema.safeParse(await context.params)
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const input = humanAttentionRequestSchema.safeParse(body)
  if (!params.success || !input.success) return Response.json({ error: 'Invalid escalation request' }, { status: 400 })
  const container = await createRequestContainer()
  try {
    const guard = await runRouteMutationGuards({
      container, req,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId },
      input: { resourceKind: 'agency_operations:agency_case', resourceId: params.data.id, operation: 'update', mutationPayload: input.data },
    })
    if (!guard.ok) return guard.response
    const guarded = humanAttentionRequestSchema.safeParse({ ...input.data, ...guard.modifiedPayload })
    if (!guarded.success) return Response.json({ error: 'Invalid escalation request' }, { status: 400 })
    const result = await container.resolve<AgencyHumanAttentionService>(AGENCY_HUMAN_ATTENTION_SERVICE).escalate({
      ...guarded.data, caseId: params.data.id, userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId,
    })
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.deduplicated ? 200 : 201 })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Operations', pathParams: pathSchema,
  methods: { POST: {
    summary: 'Escalate a case to the native employee work inbox',
    requestBody: { contentType: 'application/json', schema: humanAttentionRequestSchema },
    responses: [{ status: 201, description: 'Native human attention workflow started', schema: z.object({ caseId: z.uuid(), workflowInstanceId: z.uuid(), deduplicated: z.boolean() }) }, { status: 200, description: 'Existing open attention workflow reused' }],
    errors: [{ status: 400, description: 'Invalid request' }, { status: 401, description: 'Authentication required' }, { status: 403, description: 'Insufficient permissions' }, { status: 404, description: 'Case not found in scope' }],
  } },
}
