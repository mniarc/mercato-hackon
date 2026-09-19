/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode } from '@mikro-orm/core'
import { CustomerUser } from '../../data/entities'
import { CustomerUserService } from '../customerUserService'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isOwnedCompanyEntity } from '../../lib/customerEntityOwnership'
import { emitCustomerAccountsEvent } from '../../events'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../lib/customerEntityOwnership', () => ({ isOwnedCompanyEntity: jest.fn() }))
jest.mock('../../events', () => ({ emitCustomerAccountsEvent: jest.fn(async () => undefined) }))

const input = { userId: 'customer', tenantId: 'tenant', organizationId: 'organization', actorUserId: 'configured-staff' }
const scope = { tenantId: input.tenantId, organizationId: input.organizationId }

function setup(overrides: Record<string, unknown> = {}) {
  jest.clearAllMocks()
  const user = { id: input.userId, ...scope, email: 'verified@example.test', emailVerifiedAt: new Date(), customerEntityId: null, ...overrides }
  jest.mocked(findOneWithDecryption).mockResolvedValue(user as never)
  jest.mocked(isOwnedCompanyEntity).mockResolvedValue(true)
  const tx = { nativeUpdate: jest.fn(async () => 1) }
  const em = { fork: () => ({ transactional: async (run: (manager: typeof tx) => Promise<unknown>) => run(tx) }) }
  return { service: new CustomerUserService(em as unknown as EntityManager), tx, create: jest.fn(async () => 'new-company') }
}

test('locks the verified scoped user, links only an owned company and emits the native update', async () => {
  const { service, tx, create } = setup()
  await expect(service.ensureCompanyLink(input, create)).resolves.toEqual({ customerEntityId: 'new-company', replayed: false })
  expect(findOneWithDecryption).toHaveBeenCalledWith(tx, CustomerUser, {
    id: input.userId, ...scope, isActive: true, deletedAt: null,
  }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
  expect(isOwnedCompanyEntity).toHaveBeenCalledWith(tx, 'new-company', scope)
  expect(tx.nativeUpdate).toHaveBeenCalledWith(CustomerUser, { id: input.userId, ...scope, customerEntityId: null, deletedAt: null }, {
    customerEntityId: 'new-company', updatedAt: expect.any(Date),
  })
  expect(emitCustomerAccountsEvent).toHaveBeenCalledWith('customer_accounts.user.updated', expect.objectContaining({ id: input.userId, updatedBy: input.actorUserId, ...scope }))
})

test('keeps an existing owned membership and never creates or relinks a company on replay', async () => {
  const { service, tx, create } = setup({ customerEntityId: 'existing-company' })
  await expect(service.ensureCompanyLink(input, create)).resolves.toEqual({ customerEntityId: 'existing-company', replayed: true })
  expect(create).not.toHaveBeenCalled()
  expect(tx.nativeUpdate).not.toHaveBeenCalled()
  expect(emitCustomerAccountsEvent).not.toHaveBeenCalled()
})

test('does not create for an unverified account or accept a company outside the native scope', async () => {
  const unverified = setup({ emailVerifiedAt: null })
  await expect(unverified.service.ensureCompanyLink(input, unverified.create)).rejects.toMatchObject({ status: 403 })
  expect(unverified.create).not.toHaveBeenCalled()
  const foreign = setup()
  jest.mocked(isOwnedCompanyEntity).mockResolvedValue(false)
  await expect(foreign.service.ensureCompanyLink(input, foreign.create)).rejects.toMatchObject({ status: 403 })
  expect(foreign.tx.nativeUpdate).not.toHaveBeenCalled()
})
