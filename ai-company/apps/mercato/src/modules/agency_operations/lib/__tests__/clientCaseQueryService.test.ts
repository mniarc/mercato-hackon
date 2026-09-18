/** @jest-environment node */

import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AgencyCase } from '../../data/entities'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'

const findOne = jest.fn()
const findAndCount = jest.fn()
const findMany = jest.fn()
const findCustomer = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: (...args: unknown[]) => findOne(...args),
  findAndCountWithDecryption: (...args: unknown[]) => findAndCount(...args),
  findWithDecryption: (...args: unknown[]) => findMany(...args),
}))

import { createClientCaseQueryService } from '../clientCaseQueryService'

const identity = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  customerEntityId: '00000000-0000-4000-8000-000000000003',
  customerUserId: '00000000-0000-4000-8000-000000000004',
}
const caseId = '00000000-0000-4000-8000-000000000005'
const workflowId = '00000000-0000-4000-8000-000000000006'
const foreignId = '00000000-0000-4000-8000-000000000007'
const timestamp = new Date('2026-09-18T09:00:00.000Z')
const em = {}
const container = {
  resolve: (key: string) => key === 'em' ? em : { findById: findCustomer },
} as unknown as AppContainer

function storedCase() {
  return {
    id: caseId, ...identity, deletedAt: null, title: 'Client brief',
    materialFileName: 'brief.json', materialMimeType: 'application/json', materialFileSize: 200,
    workflowInstanceId: workflowId, createdAt: timestamp, updatedAt: timestamp,
    materialAttachmentId: 'private-attachment-id', agentWorkerId: 'internal-worker',
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  findCustomer.mockResolvedValue({ customerEntityId: identity.customerEntityId, isActive: true })
  findAndCount.mockResolvedValue([[storedCase()], 1])
  findOne.mockResolvedValue(storedCase())
  findMany.mockResolvedValue([{
    id: workflowId, status: 'WAITING_FOR_ACTIVITIES', updatedAt: timestamp, completedAt: null,
    context: { private: 'provider output' }, errorMessage: 'private error', metadata: { private: 'trace' },
  }])
})

it('lists customer-owned cases with live native status and no private execution data', async () => {
  const result = await createClientCaseQueryService(container).list(identity, { page: 2, pageSize: 20 })
  expect(findCustomer).toHaveBeenCalledWith(identity.customerUserId, identity.tenantId, identity.organizationId)
  expect(findAndCount).toHaveBeenCalledWith(em, AgencyCase, {
    tenantId: identity.tenantId, organizationId: identity.organizationId,
    customerEntityId: identity.customerEntityId, deletedAt: null,
  }, { limit: 20, offset: 20, orderBy: { createdAt: 'desc', id: 'desc' } }, {
    tenantId: identity.tenantId, organizationId: identity.organizationId,
  })
  expect(findMany).toHaveBeenCalledWith(em, WorkflowInstance, {
    id: { $in: [workflowId] }, tenantId: identity.tenantId, organizationId: identity.organizationId, deletedAt: null,
  }, { fields: ['id', 'status', 'updatedAt', 'completedAt'] }, {
    tenantId: identity.tenantId, organizationId: identity.organizationId,
  })
  expect(result).toEqual({
    items: [{
      caseId, title: 'Client brief', materialFileName: 'brief.json', materialMimeType: 'application/json',
      materialFileSize: 200, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString(),
      workflow: { status: 'WAITING_FOR_ACTIVITIES', updatedAt: timestamp.toISOString(), completedAt: null },
    }],
    total: 1, page: 2, pageSize: 20, totalPages: 1,
  })
})

it.each(['customerEntityId', 'tenantId', 'organizationId'] as const)(
  'does not resolve a case belonging to another %s', async (scopeField) => {
    const foreignCase = { ...storedCase(), [scopeField]: foreignId }
    findOne.mockImplementation((_manager: unknown, _entity: unknown, where: Record<string, unknown>) =>
      Object.entries(where).every(([key, value]) => foreignCase[key as keyof typeof foreignCase] === value) ? foreignCase : null)
    expect(await createClientCaseQueryService(container).get(identity, caseId)).toBeNull()
    expect(findMany).not.toHaveBeenCalled()
  },
)

it('denies stale customer linkage before reading any cases', async () => {
  findCustomer.mockResolvedValue({ customerEntityId: foreignId, isActive: true })
  await expect(createClientCaseQueryService(container).list(identity, { page: 1, pageSize: 20 }))
    .rejects.toMatchObject({ status: 403 })
  expect(findAndCount).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

it('does not invent a workflow state when the scoped run is unavailable', async () => {
  findMany.mockResolvedValue([])
  expect(await createClientCaseQueryService(container).get(identity, caseId))
    .toMatchObject({ caseId, workflow: null })
})
