import { z } from 'zod'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { readBoundedRequestBody, WebhookBodyTooLargeError } from '@open-mercato/shared/lib/webhooks/body'
import { DEMO_PURCHASE_SERVICE, type DemoPurchaseService } from '@/modules/agency_operations/lib/orderBootstrap/contracts'

export const purchasePathParams = z.object({ id: z.uuid() })
export type PurchaseRouteContext = { params: Promise<{ id: string }> | { id: string } }

export async function resolveDemoPurchase(request: Request) {
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
  if (!auth.customerEntityId) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  const container = await createRequestContainer()
  return {
    auth, container,
    identity: { tenantId: auth.tenantId, organizationId: auth.orgId, customerEntityId: auth.customerEntityId, customerUserId: auth.sub },
    service: container.resolve<DemoPurchaseService>(DEMO_PURCHASE_SERVICE),
  }
}

export async function readPurchaseOrderId(context: PurchaseRouteContext) {
  const parsed = purchasePathParams.safeParse(await context.params)
  if (!parsed.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
  return parsed.data.id
}

export async function readPurchaseBody(request: Request, allowEmpty = false): Promise<unknown> {
  try {
    const text = await readBoundedRequestBody(request, { maxBytes: 20000 })
    return allowEmpty && !text.trim() ? {} : JSON.parse(text)
  }
  catch (error) { throw new CrudHttpError(error instanceof WebhookBodyTooLargeError ? 413 : 400, { error: 'api.errors.badRequest' }) }
}
