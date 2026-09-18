import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import {
  CLIENT_CASE_QUERY_SERVICE,
  type ClientCaseIdentity,
  type ClientCaseQueryService,
} from '@/modules/agency_operations/lib/contracts/clientCaseQuery'

export async function resolveClientCaseQuery(request: Request) {
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
  if (!auth.customerEntityId) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  const container = await createRequestContainer()
  const identity: ClientCaseIdentity = {
    customerUserId: auth.sub,
    customerEntityId: auth.customerEntityId,
    tenantId: auth.tenantId,
    organizationId: auth.orgId,
  }
  return { identity, service: container.resolve<ClientCaseQueryService>(CLIENT_CASE_QUERY_SERVICE) }
}

export const clientCaseResponseHeaders = { 'Cache-Control': 'private, no-store' }

export async function clientCaseErrorResponse(error: unknown): Promise<Response> {
  if (!isCrudHttpError(error)) throw error
  const { translate } = await resolveTranslations()
  return Response.json({ error: translate(error.body.error) }, {
    status: error.status, headers: clientCaseResponseHeaders,
  })
}
