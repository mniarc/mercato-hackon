import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase, AgencyClientSubmission } from '../data/entities'
import {
  AGENCY_CASE_ATTACHMENT_ENTITY_ID,
  AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
  clientMaterialIntakeInputSchema,
  type ClientMaterialIntakeService,
  supplementaryMaterialInputSchema,
  type SupplementaryMaterialResult,
} from './contracts'
import { CLIENT_SUBMISSION_SERVICE, clientSubmissionRequestSchema, type ClientSubmissionService } from './contracts/clientSubmission'
import {
  AGENCY_CASE_WORKFLOW_SERVICE,
  type AgencyCaseWorkflowService,
} from './agencyCaseWorkflowService'
import { AGENCY_AGENT_WORKER_ID } from '../workflows'
import { AGENCY_TOV_WORKER_ID, assertTovProcessConfigured, parseTovMaterial } from './tovProcess'
import { AGENCY_ANALYSIS_WORKER_ID, assertAnalysisProcessConfigured, parseAnalysisMaterial } from './analysisProcess'

const logger = createLogger('agency_operations:material_intake')

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
    async submitSupplement(rawInput): Promise<SupplementaryMaterialResult> {
      const input = supplementaryMaterialInputSchema.parse(rawInput)
      const { tenantId, organizationId, customerEntityId, customerUserId } = input.identity
      const scope = { tenantId, organizationId }
      const em = container.resolve<EntityManager>('em')
      const customer = await customerUserService.findById(customerUserId, tenantId, organizationId)
      if (!customer?.isActive || customer.customerEntityId !== customerEntityId) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      const caseWhere = { ...scope, id: input.caseId, customerEntityId, deletedAt: null }
      if (!await findOneWithDecryption(em, AgencyCase, caseWhere, undefined, scope)) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
      const where = { ...scope, customerEntityId, caseId: input.caseId, channel: 'portal', eventId: input.eventId, deletedAt: null }
      const load = () => findOneWithDecryption(em, AgencyClientSubmission, where, undefined, scope)
      let saved = await load()
      let replayed = Boolean(saved)
      if (!saved) {
        try {
          await attachmentService.createScoped({
            ...scope, entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: input.caseId,
            partitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
            fileName: input.file.fileName, declaredMimeType: input.file.mimeType, buffer: input.file.buffer,
            assignments: [{ type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: input.caseId }],
            persistLink: async (tx, attachmentId) => {
              const agencyCase = await findOneWithDecryption(tx, AgencyCase, caseWhere, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
              if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
              if (await findOneWithDecryption(tx, AgencyClientSubmission, where, undefined, scope)) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
              tx.persist(tx.create(AgencyClientSubmission, {
                ...scope, customerEntityId, caseId: input.caseId, channel: 'portal', eventId: input.eventId,
                submittedByCustomerUserId: customerUserId,
                original: { eventId: input.eventId, ...(input.text !== undefined ? { text: input.text } : {}), materialAttachmentId: attachmentId },
              }))
              // Never replace the case's original material (including a purchase receipt).
            },
          })
        } catch (error) {
          // A concurrent same-event upload rolls its new attachment back through
          // the native service; return the already committed immutable original.
          saved = await load()
          if (!saved) throw error
          replayed = true
        }
        saved ??= await load()
      }
      if (!saved) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
      const original = clientSubmissionRequestSchema.parse(saved.original)
      if (!original.materialAttachmentId) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
      if (saved.submittedByCustomerUserId !== customerUserId) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      const result = { caseId: input.caseId, attachmentId: original.materialAttachmentId, submissionId: saved.id, replayed }
      try {
        const dispatched = await container.resolve<ClientSubmissionService>(CLIENT_SUBMISSION_SERVICE).submit(
          input.identity, input.caseId, original, { requireNative: true, startPending: true },
        )
        return { ...result, state: !dispatched.item.workflow ? 'saved_waiting_for_triage'
          : dispatched.item.workflow.status === 'FAILED' ? 'saved_dispatch_failed' : 'submitted_to_native_triage' }
      } catch (error) {
        // Upload and original submission already committed. Do not present a
        // dispatch/configuration fault as lost material or successful analysis.
        logger.error('Saved material could not be dispatched to native triage', { err: error, caseId: input.caseId, submissionId: saved.id })
        return { ...result, state: 'saved_dispatch_failed' }
      }
    },
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

      if (input.process?.kind === 'tone_of_voice') {
        await assertTovProcessConfigured(container, input.identity)
        await parseTovMaterial(input.file.buffer)
      }
      if (input.process?.kind === 'analysis') {
        await assertAnalysisProcessConfigured(container, input.identity)
        parseAnalysisMaterial(input.file.buffer)
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
            agentWorkerId: input.process?.kind === 'analysis' ? AGENCY_ANALYSIS_WORKER_ID : input.process?.kind === 'tone_of_voice' ? AGENCY_TOV_WORKER_ID : AGENCY_AGENT_WORKER_ID,
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
        ...(input.process ? { process: input.process } : {}),
      })

      return {
        caseId,
        workflowInstanceId: workflow.workflowInstanceId,
        status: workflow.status,
      }
    },
  }
}
