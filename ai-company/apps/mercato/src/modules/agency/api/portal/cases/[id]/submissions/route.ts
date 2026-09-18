import { z } from 'zod'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { readBoundedRequestBody, WebhookBodyTooLargeError } from '@open-mercato/shared/lib/webhooks/body'
import {
  CLIENT_SUBMISSION_SERVICE, clientSubmissionItemSchema, clientSubmissionRequestSchema, type ClientSubmissionService,
} from '@/modules/agency_operations/lib/contracts/clientSubmission'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../../../lib/clientCaseStatusBridge'

type RouteContext = { params: Promise<{ id: string }> | { id: string } }
const pathParams = z.object({ id: z.uuid() })
export const metadata = { GET: { requireAuth: false }, POST: { requireAuth: false } }

async function resolveRequest(request: Request, context: RouteContext) {
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
  if (!auth.customerEntityId) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  const params = pathParams.safeParse(await context.params)
  if (!params.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
  const container = await createRequestContainer()
  return {
    auth, container, caseId: params.data.id,
    identity: { customerUserId: auth.sub, customerEntityId: auth.customerEntityId, tenantId: auth.tenantId, organizationId: auth.orgId },
    service: container.resolve<ClientSubmissionService>(CLIENT_SUBMISSION_SERVICE),
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { identity, service, caseId } = await resolveRequest(request, context)
    return Response.json(await service.list(identity, caseId), { headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { auth, identity, container, service, caseId } = await resolveRequest(request, context)
    let body: unknown
    try { body = JSON.parse(await readBoundedRequestBody(request, { maxBytes: 100000 })) } catch (error) {
      if (error instanceof WebhookBodyTooLargeError) throw new CrudHttpError(413, { error: 'api.errors.badRequest' })
      throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    }
    const parsed = clientSubmissionRequestSchema.safeParse(body)
    if (!parsed.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const guard = await runRouteMutationGuards({
      container, req: request,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: auth.resolvedFeatures },
      input: { resourceKind: 'agency_operations:agency_client_submission', operation: 'create', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const guarded = clientSubmissionRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await service.submit(identity, caseId, guarded.data)
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', pathParams,
  methods: {
    GET: {
      summary: 'Read the latest 100 submissions for a customer-owned case',
      responses: [{ status: 200, schema: z.object({ items: z.array(clientSubmissionItemSchema) }) }],
      errors: [{ status: 401, description: 'Customer authentication required' }, { status: 403, description: 'Inactive or unlinked customer' }, { status: 404, description: 'Case not found in customer scope' }],
    },
    POST: {
      summary: 'Submit immutable client input to the deterministic triage scaffold',
      description: 'Native customer session required. Retrying eventId within the same case returns the stored original and decision without running again. Intelligence is an explicitly labelled fixture, not a live model. Only this case material may be referenced; a documentVersionReference is an unverified caller reference, not approval. Clarification waits for a native client reply signal; the reply endpoint is a separate capability.',
      requestBody: { contentType: 'application/json', schema: clientSubmissionRequestSchema },
      responses: [200, 201].map((status) => ({ status, schema: z.object({ item: clientSubmissionItemSchema, replayed: z.boolean() }) })),
      errors: [{ status: 400, description: 'Invalid submission' }, { status: 401, description: 'Customer authentication required' }, { status: 403, description: 'Inactive or unlinked customer' }, { status: 404, description: 'Case or material not found in customer scope' }, { status: 413, description: 'Request exceeds 100 KB' }],
    },
  },
}
