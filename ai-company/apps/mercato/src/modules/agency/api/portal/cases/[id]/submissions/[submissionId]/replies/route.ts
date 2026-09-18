import { z } from 'zod'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { readBoundedRequestBody, WebhookBodyTooLargeError } from '@open-mercato/shared/lib/webhooks/body'
import {
  CLIENT_REPLY_SERVICE, clientReplyItemSchema, clientReplyRequestSchema, clientReplyResultSchema, type ClientReplyService,
} from '@/modules/agency_operations/lib/contracts/clientReply'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../../../../../lib/clientCaseStatusBridge'

type RouteContext = { params: Promise<{ id: string; submissionId: string }> | { id: string; submissionId: string } }
const pathParams = z.object({ id: z.uuid(), submissionId: z.uuid() })
export const metadata = { GET: { requireAuth: false }, POST: { requireAuth: false } }

async function resolveRequest(request: Request, context: RouteContext) {
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
  if (!auth.customerEntityId) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  const params = pathParams.safeParse(await context.params)
  if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
  const container = await createRequestContainer()
  return {
    auth, container, caseId: params.data.id, submissionId: params.data.submissionId,
    identity: { customerUserId: auth.sub, customerEntityId: auth.customerEntityId, tenantId: auth.tenantId, organizationId: auth.orgId },
    service: container.resolve<ClientReplyService>(CLIENT_REPLY_SERVICE),
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { identity, service, caseId, submissionId } = await resolveRequest(request, context)
    return Response.json(await service.list(identity, caseId, submissionId), { headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { auth, identity, container, service, caseId, submissionId } = await resolveRequest(request, context)
    let body: unknown
    try { body = JSON.parse(await readBoundedRequestBody(request, { maxBytes: 100000 })) } catch (error) {
      throw new CrudHttpError(error instanceof WebhookBodyTooLargeError ? 413 : 400, { error: 'api.errors.badRequest' })
    }
    const parsed = clientReplyRequestSchema.safeParse(body)
    if (!parsed.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const guard = await runRouteMutationGuards({
      container, req: request,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: auth.resolvedFeatures },
      input: { resourceKind: 'agency_operations:agency_client_reply', operation: 'create', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const guarded = clientReplyRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await service.reply(identity, caseId, submissionId, guarded.data)
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', pathParams,
  methods: {
    GET: {
      summary: 'Read accepted clarification replies for a customer-owned submission',
      responses: [{ status: 200, schema: z.object({ items: z.array(clientReplyItemSchema) }) }],
      errors: [{ status: 401, description: 'Customer authentication required' }, { status: 403, description: 'Inactive or unlinked customer' }, { status: 404, description: 'Case or submission not found in customer scope' }],
    },
    POST: {
      summary: 'Reply to the fixed clarification request on a customer-owned submission',
      description: 'Accepts only eventId and original reply text. Server derives the native wait and signal from the owned submission. Replaying eventId returns the accepted reply without signaling again; a new event against a no-longer-waiting request returns 409. No artifact approval, reclassification, or employee task is created. Follow current status through the submission API.',
      requestBody: { contentType: 'application/json', schema: clientReplyRequestSchema },
      responses: [200, 201].map((status) => ({ status, schema: clientReplyResultSchema })),
      errors: [{ status: 400, description: 'Invalid reply' }, { status: 401, description: 'Customer authentication required' }, { status: 403, description: 'Inactive or unlinked customer' }, { status: 404, description: 'Case or submission not found in customer scope' }, { status: 409, description: 'Submission is not waiting for this clarification' }, { status: 413, description: 'Request exceeds 100 KB' }],
    },
  },
}
