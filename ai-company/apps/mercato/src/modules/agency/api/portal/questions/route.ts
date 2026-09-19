import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { readBoundedRequestBody, WebhookBodyTooLargeError } from '@open-mercato/shared/lib/webhooks/body'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOnboardingCustomer } from '@/modules/agency_operations/lib/customerOnboarding/identity'
import { SALES_QUESTIONS_SERVICE, salesQuestionRequestSchema, salesQuestionListSchema, salesQuestionResponseSchema, type SalesQuestionsService } from '@/modules/agency_operations/lib/salesQuestions/contracts'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../lib/clientCaseStatusBridge'

export const metadata = { GET: { requireAuth: false }, POST: { requireAuth: false } }

export async function GET(request: Request) {
  try {
    const { container, identity } = await resolveOnboardingCustomer(request)
    const result = await container.resolve<SalesQuestionsService>(SALES_QUESTIONS_SERVICE).list(identity)
    return Response.json(result, { headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const { auth, container, identity } = await resolveOnboardingCustomer(request)
    let body: unknown
    try { body = JSON.parse(await readBoundedRequestBody(request, { maxBytes: 20000 })) }
    catch (error) { throw new CrudHttpError(error instanceof WebhookBodyTooLargeError ? 413 : 400, { error: 'api.errors.badRequest' }) }
    const parsed = salesQuestionRequestSchema.safeParse(body)
    if (!parsed.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const guard = await runRouteMutationGuards({
      container, req: request,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: auth.resolvedFeatures },
      input: { resourceKind: 'agency_operations:sales_question', operation: 'create', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const guarded = salesQuestionRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await container.resolve<SalesQuestionsService>(SALES_QUESTIONS_SERVICE).submit(identity, guarded.data)
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

const errors = [{ status: 401, description: 'Customer authentication required' }, { status: 403, description: 'Verified active customer required' }]
export const openApi: OpenApiRouteDoc = { tag: 'Agency', methods: {
  GET: { summary: 'Read this customer account’s saved fixed-offer questions and answers', responses: [{ status: 200, schema: salesQuestionListSchema }], errors },
  POST: { summary: 'Save an original pre-purchase question, or resume its idempotent configured answer',
    requestBody: { contentType: 'application/json', schema: salesQuestionRequestSchema },
    responses: [{ status: 201, schema: salesQuestionResponseSchema }, { status: 200, schema: salesQuestionResponseSchema }],
    errors: [...errors, { status: 400, description: 'Invalid question' }, { status: 404, description: 'Follow-up question not found' }, { status: 413, description: 'Question request exceeds 20 KB' }] },
} }
