import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { demoPurchaseReceiptSchema } from '@/modules/agency_operations/lib/orderBootstrap/contracts'
import { resolveDemoPurchase, readPurchaseOrderId, purchasePathParams, type PurchaseRouteContext } from '../../../../lib/demoPurchaseBridge'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../../lib/clientCaseStatusBridge'

export const metadata = { GET: { requireAuth: false } }
export async function GET(request: Request, context: PurchaseRouteContext) {
  try {
    const { identity, service } = await resolveDemoPurchase(request)
    const orderId = await readPurchaseOrderId(context)
    return Response.json(await service.read(identity, orderId), { headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}
export const openApi: OpenApiRouteDoc = { tag: 'Agency', pathParams: purchasePathParams, methods: {
  GET: { summary: 'Read authoritative status of this customer-owned demo purchase', responses: [{ status: 200, schema: demoPurchaseReceiptSchema }],
    errors: [{ status: 400, description: 'Invalid order identifier' }, { status: 401, description: 'Customer session required' }, { status: 403, description: 'Linked active customer required' }, { status: 404, description: 'Purchase not found in customer scope' }] },
} }
