import type { EntityManager } from '@mikro-orm/postgresql'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { requireCustomerFeature, type CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import { buildPortalTaskConditions, decidePortalTaskAccess, PORTAL_TASKS_VIEW_FEATURE, resolvePortalTaskPrincipal } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CLIENT_CASE_QUERY_SERVICE, type ClientCaseQueryService } from '../contracts/clientCaseQuery'
import { clientCaseTasksSchema, type ClientCaseTasks } from './contracts'

/** Read native case-bound work; this does not authorize a document decision. */
export async function readClientCaseTasks(container: AppContainer, auth: CustomerAuthContext, caseId: string): Promise<ClientCaseTasks> {
  if (!auth.customerEntityId) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
  const rbac = container.resolve<CustomerRbacService>('customerRbacService')
  await requireCustomerFeature(auth, [PORTAL_TASKS_VIEW_FEATURE], rbac)
  const agencyCase = await container.resolve<ClientCaseQueryService>(CLIENT_CASE_QUERY_SERVICE).get({
    ...scope, customerUserId: auth.sub, customerEntityId: auth.customerEntityId,
  }, caseId)
  if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })

  const em = container.resolve<EntityManager>('em')
  const acl = await rbac.loadAcl(auth.sub, scope)
  const resolved = await resolvePortalTaskPrincipal({ auth, em, isPortalAdmin: acl.isPortalAdmin })
  if (!resolved.ok) throw new CrudHttpError(resolved.status, { error: 'api.errors.forbidden' })

  // Same native metadata binding queried by employeeQuestions.list. Invitation
  // and question producers write it when starting their real workflow instance.
  const workflows = await findWithDecryption(em, WorkflowInstance, {
    ...scope, deletedAt: null,
    metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.caseId },
  }, { fields: ['id'] }, scope)
  const nativeTasks = workflows.length ? await findWithDecryption(em, UserTask, {
    ...buildPortalTaskConditions(resolved),
    workflowInstanceId: { $in: workflows.map((workflow) => workflow.id) },
    status: { $in: ['PENDING', 'IN_PROGRESS'] },
  }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope) : []

  const tasks = nativeTasks.flatMap((task) => {
    const access = decidePortalTaskAccess(resolved.principal, task)
    return access.visible ? [{ id: task.id, title: task.taskName, status: task.status,
      assignedToYou: access.actable }] : []
  })
  return clientCaseTasksSchema.parse({ caseId, state: tasks.length ? 'customer_tasks' : 'no_open_customer_task', tasks })
}
