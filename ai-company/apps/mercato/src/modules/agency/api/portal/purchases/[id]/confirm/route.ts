import { z } from 'zod'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { demoPurchaseReceiptSchema } from '@/modules/agency_operations/lib/orderBootstrap/contracts'
import { resolveDemoPurchase, readPurchaseOrderId, readPurchaseBody, purchasePathParams, type PurchaseRouteContext } from '../../../../../lib/demoPurchaseBridge'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../../../lib/clientCaseStatusBridge'

const requestSchema = z.object({}).strict()
export const metadata = { POST: { requireAuth: false } }
export async function POST(request: Request, context: PurchaseRouteContext) {
  try {
    const { auth, identity, container, service } = await resolveDemoPurchase(request)
    const orderId = await readPurchaseOrderId(context)
    if (!requestSchema.safeParse(await readPurchaseBody(request, true)).success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    await service.read(identity, orderId)
    const guard = await runRouteMutationGuards({
      container, req: request,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: auth.resolvedFeatures },
      input: { resourceKind: 'sales:sales_order', resourceId: orderId, operation: 'update', mutationPayload: {} },
    })
    if (!guard.ok) return guard.response
    if (!requestSchema.safeParse(guard.modifiedPayload ?? {}).success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await service.confirm(identity, orderId)
    await guard.runAfterSuccess()
    return Response.json(result, { headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}
export const openApi: OpenApiRouteDoc = { tag: 'Agency', pathParams: purchasePathParams, methods: {
  POST: { summary: 'Confirm or retry this customer-owned zero-charge test payment', requestBody: { contentType: 'application/json', schema: requestSchema },
    responses: [{ status: 200, schema: demoPurchaseReceiptSchema }], errors: [{ status: 400, description: 'Invalid order identifier or confirmation payload' }, { status: 401, description: 'Customer session required' }, { status: 403, description: 'Linked active customer required or demo disabled' }, { status: 404, description: 'Purchase not found in customer scope' }, { status: 409, description: 'Payment cannot be confirmed' }, { status: 413, description: 'Request exceeds 20 KB' }] },
} }
