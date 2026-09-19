import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerUserService } from '@open-mercato/core/modules/customer_accounts/services/customerUserService'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'

export async function resolveOnboardingCustomer(request: Request) {
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) throw new CrudHttpError(401, { error: 'api.errors.unauthorized' })
  const container = await createRequestContainer()
  const user = await container.resolve<CustomerUserService>('customerUserService').findById(auth.sub, auth.tenantId, auth.orgId)
  if (!user?.isActive || !user.emailVerifiedAt) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  return { auth, container, user, identity: { tenantId: auth.tenantId, organizationId: auth.orgId, customerUserId: auth.sub } }
}
