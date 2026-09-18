import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findAndCountWithDecryption, findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase } from '../data/entities'
import { clientMaterialIntakeInputSchema } from './contracts/clientMaterialIntake'
import {
  clientCaseListQuerySchema,
  type ClientCaseIdentity,
  type ClientCaseItem,
  type ClientCaseQueryService,
} from './contracts/clientCaseQuery'

type CustomerUserLookupService = {
  findById: (id: string, tenantId: string, organizationId: string) => Promise<{
    customerEntityId?: string | null
    isActive?: boolean
  } | null>
}

export function createClientCaseQueryService(container: AppContainer): ClientCaseQueryService {
  const em = container.resolve<EntityManager>('em')
  const customerUsers = container.resolve<CustomerUserLookupService>('customerUserService')

  async function caseScope(rawIdentity: ClientCaseIdentity) {
    const identity = clientMaterialIntakeInputSchema.shape.identity.parse(rawIdentity)
    const user = await customerUsers.findById(identity.customerUserId, identity.tenantId, identity.organizationId)
    if (!user || user.isActive === false || user.customerEntityId !== identity.customerEntityId) {
      throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
    }
    return {
      tenantId: identity.tenantId,
      organizationId: identity.organizationId,
      customerEntityId: identity.customerEntityId,
      deletedAt: null,
    }
  }

  async function project(cases: AgencyCase[], identity: ClientCaseIdentity): Promise<ClientCaseItem[]> {
    const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
    const workflowIds = cases.flatMap((agencyCase) => agencyCase.workflowInstanceId ? [agencyCase.workflowInstanceId] : [])
    const workflows = workflowIds.length ? await findWithDecryption(
      em, WorkflowInstance,
      { id: { $in: workflowIds }, ...scope, deletedAt: null },
      { fields: ['id', 'status', 'updatedAt', 'completedAt'] },
      scope,
    ) : []
    const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]))
    return cases.map((agencyCase) => {
      const workflow = agencyCase.workflowInstanceId ? byId.get(agencyCase.workflowInstanceId) : undefined
      return {
        caseId: agencyCase.id,
        title: agencyCase.title,
        materialFileName: agencyCase.materialFileName,
        materialMimeType: agencyCase.materialMimeType,
        materialFileSize: agencyCase.materialFileSize,
        createdAt: agencyCase.createdAt.toISOString(),
        updatedAt: agencyCase.updatedAt?.toISOString() ?? null,
        workflow: workflow ? {
          status: workflow.status,
          updatedAt: workflow.updatedAt.toISOString(),
          completedAt: workflow.completedAt?.toISOString() ?? null,
        } : null,
      }
    })
  }

  return {
    async list(identity, rawQuery) {
      const where = await caseScope(identity)
      const query = clientCaseListQuerySchema.parse(rawQuery)
      const [cases, total] = await findAndCountWithDecryption(
        em, AgencyCase, where,
        { limit: query.pageSize, offset: (query.page - 1) * query.pageSize, orderBy: { createdAt: 'desc', id: 'desc' } },
        { tenantId: where.tenantId, organizationId: where.organizationId },
      )
      return {
        items: await project(cases, identity),
        total, page: query.page, pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      }
    },
    async get(identity, caseId) {
      const where = await caseScope(identity)
      const agencyCase = await findOneWithDecryption(
        em, AgencyCase, { id: caseId, ...where }, undefined,
        { tenantId: where.tenantId, organizationId: where.organizationId },
      )
      if (!agencyCase) return null
      return (await project([agencyCase], identity))[0]
    },
  }
}
