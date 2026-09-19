/** @jest-environment node */
import { ensureCustomerOnboarding } from '../service'
import { customerOnboardingRequestSchema } from '../contracts'
import { readDemoPurchaseConfiguration } from '../../orderBootstrap/configure'
import { isDemoPurchaseEnabled } from '../../orderBootstrap/demoOffer'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'

jest.mock('../../orderBootstrap/configure', () => ({ readDemoPurchaseConfiguration: jest.fn() }))
jest.mock('../../orderBootstrap/demoOffer', () => ({ isDemoPurchaseEnabled: jest.fn() }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findWithDecryption: jest.fn() }))

const identity = { tenantId: 'tenant', organizationId: 'organization', customerUserId: 'customer' }
const buyer = { brandDisplayName: 'Brand', billingLegalName: 'Legal company', brandWebsiteUrl: 'https://example.test' }

function setup() {
  jest.clearAllMocks()
  jest.mocked(isDemoPurchaseEnabled).mockReturnValue(true)
  jest.mocked(readDemoPurchaseConfiguration).mockResolvedValue({ executionUserId: 'configured-staff' } as never)
  jest.mocked(findWithDecryption).mockResolvedValue([])
  const execute = jest.fn(async () => ({ result: { entityId: 'created-company' } }))
  const userHasAllFeatures = jest.fn(async () => true)
  const ensureCompanyLink = jest.fn(async (_input: unknown, create: (user: { id: string; email: string }) => Promise<string>) => ({ customerEntityId: await create({ id: identity.customerUserId, email: 'verified@example.test' }), replayed: false }))
  const services: Record<string, unknown> = { em: { fork: () => ({}) }, commandBus: { execute }, rbacService: { userHasAllFeatures }, customerUserService: { ensureCompanyLink } }
  const container = { resolve: (name: string) => services[name] }
  return { container: container as never, execute, ensureCompanyLink, userHasAllFeatures }
}

test('creates only through the native command using the configured principal and server-generated ownership marker', async () => {
  const { container, execute, ensureCompanyLink } = setup()
  await ensureCustomerOnboarding(container, identity, buyer)
  expect(ensureCompanyLink).toHaveBeenCalledWith({ tenantId: identity.tenantId, organizationId: identity.organizationId, userId: identity.customerUserId, actorUserId: 'configured-staff' }, expect.any(Function))
  expect(execute).toHaveBeenCalledWith('customers.companies.create', expect.objectContaining({
    ctx: expect.objectContaining({ auth: { sub: 'configured-staff', tenantId: identity.tenantId, orgId: identity.organizationId } }),
    input: expect.objectContaining({ source: 'agency_onboarding:customer', primaryEmail: 'verified@example.test', displayName: buyer.brandDisplayName }),
  }))
  expect(customerOnboardingRequestSchema.safeParse({ ...buyer, customerEntityId: 'claimed-existing-company' }).success).toBe(false)
})

test('recovers the exact per-user created company after interrupted linkage without name or email matching', async () => {
  const { container, execute } = setup()
  jest.mocked(findWithDecryption).mockResolvedValue([{ id: 'saved-company' }] as never)
  await expect(ensureCustomerOnboarding(container, identity, buyer)).resolves.toMatchObject({ customerEntityId: 'saved-company' })
  expect(execute).not.toHaveBeenCalled()
  expect(findWithDecryption).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
    tenantId: identity.tenantId, organizationId: identity.organizationId, kind: 'company', source: 'agency_onboarding:customer', deletedAt: null,
  }, { limit: 2 }, { tenantId: identity.tenantId, organizationId: identity.organizationId })
})

test('unconfigured capability blocks creation rather than choosing another staff identity', async () => {
  const { container, execute, ensureCompanyLink, userHasAllFeatures } = setup()
  userHasAllFeatures.mockResolvedValue(false)
  await expect(ensureCustomerOnboarding(container, identity, buyer)).rejects.toMatchObject({ status: 409, body: { error: 'agency.onboarding.unavailable' } })
  expect(execute).not.toHaveBeenCalled()
  expect(ensureCompanyLink).not.toHaveBeenCalled()
})
