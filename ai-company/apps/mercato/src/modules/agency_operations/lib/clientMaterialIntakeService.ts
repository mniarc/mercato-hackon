import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AgencyCase } from '../data/entities'
import {
  AGENCY_CASE_ATTACHMENT_ENTITY_ID,
  AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
  clientMaterialIntakeInputSchema,
  type ClientMaterialIntakeService,
} from './contracts'
import {
  AGENCY_CASE_WORKFLOW_SERVICE,
  type AgencyCaseWorkflowService,
} from './agencyCaseWorkflowService'
import { AGENCY_AGENT_WORKER_ID } from '../workflows'

type CustomerUserLookupService = {
  findById: (
    id: string,
    tenantId: string,
    organizationId: string,
  ) => Promise<{
    id: string
    customerEntityId?: string | null
    isActive?: boolean
  } | null>
}

export function createClientMaterialIntakeService(
  container: AppContainer,
): ClientMaterialIntakeService {
  const attachmentService = container.resolve<AttachmentService>('attachmentService')
  const customerUserService = container.resolve<CustomerUserLookupService>('customerUserService')
  const workflowService = container.resolve<AgencyCaseWorkflowService>(
    AGENCY_CASE_WORKFLOW_SERVICE,
  )

  return {
    async submitMaterial(rawInput) {
      const input = clientMaterialIntakeInputSchema.parse(rawInput)
      const customerUser = await customerUserService.findById(
        input.identity.customerUserId,
        input.identity.tenantId,
        input.identity.organizationId,
      )
      if (
        !customerUser
        || customerUser.isActive === false
        || customerUser.customerEntityId !== input.identity.customerEntityId
      ) {
        throw new Error('[internal] Customer identity does not own the intake scope')
      }

      const caseId = randomUUID()
      const assignment = { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: caseId }
      let casePersisted = false

      await attachmentService.createScoped({
        tenantId: input.identity.tenantId,
        organizationId: input.identity.organizationId,
        entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID,
        recordId: caseId,
        partitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
        fileName: input.file.fileName,
        declaredMimeType: input.file.mimeType,
        buffer: input.file.buffer,
        assignments: [assignment],
        persistLink: (tx: EntityManager, attachmentId: string) => {
          const agencyCase = tx.create(AgencyCase, {
            id: caseId,
            tenantId: input.identity.tenantId,
            organizationId: input.identity.organizationId,
            customerEntityId: input.identity.customerEntityId,
            submittedByCustomerUserId: input.identity.customerUserId,
            title: input.title,
            agentWorkerId: AGENCY_AGENT_WORKER_ID,
            materialAttachmentId: attachmentId,
            materialFileName: input.file.fileName,
            materialMimeType: input.file.mimeType,
            materialFileSize: input.file.buffer.length,
            workflowInstanceId: null,
          })
          tx.persist(agencyCase)
          casePersisted = true
        },
      })

      if (!casePersisted) {
        throw new Error('[internal] Agency case was not persisted with its attachment')
      }

      const workflow = await workflowService.processCase({
        caseId,
        tenantId: input.identity.tenantId,
        organizationId: input.identity.organizationId,
        customerEntityId: input.identity.customerEntityId,
      })

      return {
        caseId,
        workflowInstanceId: workflow.workflowInstanceId,
        status: workflow.status,
      }
    },
  }
}
