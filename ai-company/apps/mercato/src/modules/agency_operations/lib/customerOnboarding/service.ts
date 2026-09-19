import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands/types'
import type { CustomerUserService } from '@open-mercato/core/modules/customer_accounts/services/customerUserService'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readDemoPurchaseConfiguration, type DemoPurchaseConfiguration } from '../orderBootstrap/configure'
import { isDemoPurchaseEnabled } from '../orderBootstrap/demoOffer'
import { customerOnboardingRequestSchema, type CustomerOnboardingIdentity } from './contracts'

export async function ensureCustomerOnboarding(container: AppContainer, identity: CustomerOnboardingIdentity, rawInput: unknown) {
  const input = customerOnboardingRequestSchema.parse(rawInput)
  const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
  const unavailable = () => new CrudHttpError(409, { error: 'agency.onboarding.unavailable' })
  if (!isDemoPurchaseEnabled() || process.env.NODE_ENV === 'production') throw unavailable()
  let config: DemoPurchaseConfiguration
  try { config = await readDemoPurchaseConfiguration(container, scope) } catch (error) {
    if (isCrudHttpError(error) && error.status === 409) throw unavailable()
    throw error
  }
  const features = ['customers.companies.manage', 'customer_accounts.manage']
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(config.executionUserId, features, scope)) throw unavailable()
  const ctx: CommandRuntimeContext = {
    container, auth: { sub: config.executionUserId, tenantId: scope.tenantId, orgId: scope.organizationId },
    organizationScope: null, selectedOrganizationId: scope.organizationId, organizationIds: [scope.organizationId],
  }
  return container.resolve<CustomerUserService>('customerUserService').ensureCompanyLink({
    ...scope, userId: identity.customerUserId, actorUserId: config.executionUserId,
  }, async (user) => {
    const source = `agency_onboarding:${user.id}`
    const existing = await findWithDecryption(container.resolve<EntityManager>('em').fork(), CustomerEntity, {
      ...scope, kind: 'company', source, deletedAt: null,
    }, { limit: 2 }, scope)
    if (existing.length > 1) throw new CrudHttpError(409, { error: 'agency.onboarding.failed' })
    if (existing[0]) return existing[0].id
    const result = await container.resolve<CommandBus>('commandBus').execute<Record<string, unknown>, { entityId: string; companyId: string }>('customers.companies.create', {
      ctx, input: { ...scope, source, displayName: input.brandDisplayName, legalName: input.billingLegalName,
        brandName: input.brandDisplayName, websiteUrl: input.brandWebsiteUrl, primaryEmail: user.email },
    })
    return result.result.entityId
  })
}
