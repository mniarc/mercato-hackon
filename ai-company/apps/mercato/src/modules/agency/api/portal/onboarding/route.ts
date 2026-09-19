import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { customerOnboardingRequestSchema, customerOnboardingResultSchema } from '@/modules/agency_operations/lib/customerOnboarding/contracts'
import { resolveOnboardingCustomer } from '@/modules/agency_operations/lib/customerOnboarding/identity'
import { ensureCustomerOnboarding } from '@/modules/agency_operations/lib/customerOnboarding/service'
import { readPurchaseBody } from '../../../lib/demoPurchaseBridge'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../lib/clientCaseStatusBridge'

export const metadata = { POST: { requireAuth: false } }

export async function POST(request: Request) {
  try {
    const { auth, container, identity, user } = await resolveOnboardingCustomer(request)
    const parsed = customerOnboardingRequestSchema.safeParse(await readPurchaseBody(request))
    if (!parsed.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    if (user.customerEntityId) return Response.json({ customerEntityId: user.customerEntityId, replayed: true }, { headers: clientCaseResponseHeaders })
    const guard = await runRouteMutationGuards({
      container, req: request,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: auth.resolvedFeatures },
      input: { resourceKind: 'customer_accounts:customer_user', resourceId: auth.sub, operation: 'update', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const guarded = customerOnboardingRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await ensureCustomerOnboarding(container, identity, guarded.data)
    await guard.runAfterSuccess()
    return Response.json(result, { headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', methods: { POST: {
    summary: 'Link a verified new customer to their own new demo company',
    requestBody: { contentType: 'application/json', schema: customerOnboardingRequestSchema },
    responses: [{ status: 200, schema: customerOnboardingResultSchema }],
    errors: [{ status: 400, description: 'Invalid company inputs' }, { status: 401, description: 'Customer session required' },
      { status: 403, description: 'Verified active account required' }, { status: 409, description: 'Demo onboarding unavailable' },
      { status: 413, description: 'Request exceeds 20 KB' }],
  } },
}
