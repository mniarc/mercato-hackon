/** @jest-environment node */

import { CustomerUser } from '@open-mercato/core/modules/customer_accounts/data/entities'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'

const getAuth = jest.fn()
const getCase = jest.fn()
const find = jest.fn()
const hasFeatures = jest.fn()
const loadAcl = jest.fn()
const em = {}
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({
  ...jest.requireActual('@open-mercato/core/modules/customer_accounts/lib/customerAuth'),
  getCustomerAuthFromRequest: (...args: unknown[]) => getAuth(...args),
}))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: (...args: unknown[]) => find(...args),
}))
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: async () => ({ resolve: (name: string) => {
    if (name === 'em') return em
    if (name === 'clientCaseQueryService') return { get: getCase }
    if (name === 'customerRbacService') return { loadAcl, userHasAllFeatures: hasFeatures }
    throw new Error(`Unexpected dependency ${name}`)
  } }),
}))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (key: string) => key }),
}))

import { GET } from '../route'

const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const auth = { sub: id(1), tenantId: id(2), orgId: id(3), customerEntityId: id(4) }
const caseId = id(5)
const workflowId = id(6)
const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
const request = () => new Request(`http://localhost/api/agency/portal/cases/${caseId}/tasks?tenantId=attacker&customerEntityId=attacker`)
const read = () => GET(request(), { params: { id: caseId } })
function task(overrides: Partial<UserTask> = {}) {
  return Object.assign(new UserTask(), {
    id: id(7), ...scope, workflowInstanceId: workflowId, taskName: 'Review the invited brief',
    status: 'PENDING', assignedTo: auth.sub, assigneeKind: 'customer',
    entityBindings: [{ entityType: 'customers:customer', entityId: auth.customerEntityId }],
    entityTypes: ['customers:customer'], context: { employeeOnly: 'Never serialize this' },
  }, overrides)
}

beforeEach(() => {
  jest.clearAllMocks()
  getAuth.mockResolvedValue(auth)
  hasFeatures.mockResolvedValue(true)
  loadAcl.mockResolvedValue({ isPortalAdmin: false })
  getCase.mockResolvedValue({ caseId })
  find.mockImplementation(async (_em: unknown, entity: unknown) => {
    if (entity === WorkflowInstance) return [{ id: workflowId }]
    if (entity === UserTask) return [task()]
    if (entity === CustomerUser) return [{ id: id(8), customerEntityId: auth.customerEntityId }]
    throw new Error('Unexpected query')
  })
})

it('reads only exact case workflow bindings in session scope and returns safe native task links', async () => {
  const response = await read()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ caseId, state: 'customer_tasks', tasks: [
    { id: id(7), title: 'Review the invited brief', status: 'PENDING', assignedToYou: true },
  ] })
  expect(getCase).toHaveBeenCalledWith({ ...scope, customerUserId: auth.sub, customerEntityId: auth.customerEntityId }, caseId)
  expect(hasFeatures).toHaveBeenCalledWith(auth.sub, ['portal.tasks.view'], scope)
  expect(find).toHaveBeenCalledWith(em, WorkflowInstance, {
    ...scope, deletedAt: null, metadata: { entityType: 'agency_operations:agency_case', entityId: caseId },
  }, { fields: ['id'] }, scope)
  expect(find).toHaveBeenCalledWith(em, UserTask, {
    ...scope, assigneeKind: 'customer', assignedTo: { $in: [auth.sub] }, entityTypes: { $ne: null },
    workflowInstanceId: { $in: [workflowId] }, status: { $in: ['PENDING', 'IN_PROGRESS'] },
  }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
})

it('retains native company-admin visibility without granting another assignee completion', async () => {
  loadAcl.mockResolvedValue({ isPortalAdmin: true })
  find.mockImplementation(async (_em: unknown, entity: unknown) => {
    if (entity === WorkflowInstance) return [{ id: workflowId }]
    if (entity === CustomerUser) return [{ id: id(8), customerEntityId: auth.customerEntityId }]
    return [task({ assignedTo: id(8) }), task({ id: id(9), entityBindings: [{ entityType: 'customers:customer', entityId: id(99) }] }),
      task({ id: id(10), assigneeKind: 'user' }), task({ id: id(11), entityBindings: null })]
  })
  const response = await read()
  expect(await response.json()).toEqual({ caseId, state: 'customer_tasks', tasks: [
    { id: id(7), title: 'Review the invited brief', status: 'PENDING', assignedToYou: false },
  ] })
})

it('does not equate absent customer tasks with case completion', async () => {
  find.mockResolvedValue([])
  expect(await (await read()).json()).toEqual({ caseId, state: 'no_open_customer_task', tasks: [] })
  expect(find).toHaveBeenCalledTimes(1)
})

it('does not query tasks for an absent or foreign scoped case', async () => {
  getCase.mockResolvedValue(null)
  expect((await read()).status).toBe(404)
  expect(find).not.toHaveBeenCalled()
})

it('requires the customer session, company link and native task feature', async () => {
  getAuth.mockResolvedValueOnce(null)
  expect((await read()).status).toBe(401)
  getAuth.mockResolvedValueOnce({ ...auth, customerEntityId: null })
  expect((await read()).status).toBe(403)
  hasFeatures.mockResolvedValue(false)
  expect((await read()).status).toBe(403)
  expect(getCase).not.toHaveBeenCalled()
  expect(find).not.toHaveBeenCalled()
})
