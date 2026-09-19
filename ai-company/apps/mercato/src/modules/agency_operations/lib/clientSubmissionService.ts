import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { AgencyCase, AgencyClientSubmission } from '../data/entities'
import type { ClientCaseIdentity } from './contracts/clientCaseQuery'
import { clientMaterialIntakeInputSchema, AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from './contracts/clientMaterialIntake'
import { clientSubmissionDispositionSchema, clientSubmissionRequestSchema, type ClientSubmissionItem, type ClientSubmissionService } from './contracts/clientSubmission'
import { CLIENT_SUBMISSION_WORKFLOW_ID, CLIENT_TRIAGE_RESULT_KEY } from './clientSubmissionWorkflow'
import { ClientTriageConfigurationError, isClientTriageEnabled } from '../agents/client-triage/configuration'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../agents/client-triage/workflow'

type Executor = {
  startWorkflow(em: EntityManager, options: {
    workflowId: string; tenantId: string; organizationId: string; initialContext: Record<string, unknown>;
    correlationKey: string; metadata: { entityType: string; entityId: string };
  }): Promise<{ id: string }>
  executeWorkflow(em: EntityManager, container: AppContainer, id: string): Promise<unknown>
}

export function createClientSubmissionService(container: AppContainer): ClientSubmissionService {
  const em = container.resolve<EntityManager>('em')
  const customerUsers = container.resolve<{
    findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null>
  }>('customerUserService')

  async function authorize(rawIdentity: ClientCaseIdentity, caseId: string) {
    const identity = clientMaterialIntakeInputSchema.shape.identity.parse(rawIdentity)
    z.uuid().parse(caseId)
    const user = await customerUsers.findById(identity.customerUserId, identity.tenantId, identity.organizationId)
    if (!user || user.isActive === false || user.customerEntityId !== identity.customerEntityId) {
      throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
    }
    return { tenantId: identity.tenantId, organizationId: identity.organizationId, customerEntityId: identity.customerEntityId }
  }

  async function nativeReady(scope: { tenantId: string; organizationId: string }): Promise<boolean> {
    try {
      if (!isClientTriageEnabled()) return false
    } catch (error) {
      // Invalid native provider configuration must not discard the customer's
      // original or turn it into a fabricated interpretation.
      if (error instanceof ClientTriageConfigurationError) return false
      throw error
    }
    if (!container.hasRegistration('agentWorkflowBridge') || !container.hasRegistration('workflowDefinitionAuthoring')) return false
    const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring').findOwnedDefinition(em, {
      workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, ...scope,
    })
    return Boolean(definition?.enabled && definition.metadata?.generatedBy?.module === 'agency_operations'
      && definition.metadata.generatedBy.ownerId === 'client_triage')
  }

  async function project(manager: EntityManager, submission: AgencyClientSubmission, nativeAvailable: boolean): Promise<ClientSubmissionItem> {
    const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
    const workflow = submission.workflowInstanceId ? await findOneWithDecryption(manager, WorkflowInstance, {
      id: submission.workflowInstanceId, ...scope, deletedAt: null,
    }, undefined, scope) : null
    const result = clientSubmissionDispositionSchema.safeParse(workflow?.context?.[CLIENT_TRIAGE_RESULT_KEY]?.result)
    return {
      submissionId: submission.id, caseId: submission.caseId, eventId: submission.eventId,
      channel: 'portal', submittedByCustomerUserId: submission.submittedByCustomerUserId,
      createdAt: submission.createdAt.toISOString(), original: clientSubmissionRequestSchema.parse(submission.original),
      workflow: workflow ? { status: workflow.status, currentStep: workflow.currentStepId } : null,
      disposition: result.success ? result.data : null,
      processing: { state: workflow ? result.success ? 'processed' : 'processing'
        : nativeAvailable ? 'pending_dispatch' : 'waiting_configuration' },
    }
  }

  return {
    async submit(identity, caseId, rawInput, options) {
      const scope = await authorize(identity, caseId)
      const input = clientSubmissionRequestSchema.parse(rawInput)
      const deterministicFixture = options?.deterministicTestFixture === true
      if (deterministicFixture && (process.env.NODE_ENV !== 'test' || options?.requireNative)) {
        throw new CrudHttpError(400, { error: 'Deterministic submission fixtures are available only to explicit test callers.' })
      }
      const native = await nativeReady({ tenantId: scope.tenantId, organizationId: scope.organizationId })
      const accepted = await em.transactional(async (tx) => {
        // Serializes this case's submissions through commit, including workflow creation.
        const agencyCase = await findOneWithDecryption(tx, AgencyCase, { id: caseId, ...scope, deletedAt: null }, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
        }, scope)
        if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
        const existing = await findOneWithDecryption(tx, AgencyClientSubmission, {
          ...scope, caseId, channel: 'portal', eventId: input.eventId,
        }, undefined, scope)
        if (existing && (!options?.startPending || existing.workflowInstanceId || !native)) {
          // Replaying the key always returns its immutable original; it never reclassifies.
          return { submission: existing, replayed: true }
        }
        if (!existing && input.materialAttachmentId && input.materialAttachmentId !== agencyCase.materialAttachmentId) {
          await container.resolve<AttachmentService>('attachmentService').readScoped({
            attachmentId: input.materialAttachmentId,
            auth: { sub: identity.customerUserId, tenantId: scope.tenantId, orgId: scope.organizationId },
            expectedOwner: { entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: caseId },
            expectedAssignment: { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: caseId },
            expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, requirePrivatePartition: true,
          })
        }
        const submission = existing ?? tx.create(AgencyClientSubmission, {
          ...scope, caseId, submittedByCustomerUserId: identity.customerUserId,
          channel: 'portal', eventId: input.eventId, original: input,
        })
        tx.persist(submission)
        await tx.flush()
        if (!native && !deterministicFixture) return { submission, replayed: Boolean(existing) }
        const executor = container.resolve<Executor>('workflowExecutor')
        const workflow = await executor.startWorkflow(tx, {
          workflowId: native ? NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID : CLIENT_SUBMISSION_WORKFLOW_ID, ...scope,
          correlationKey: `agency-submission:${submission.id}`,
          metadata: { entityType: 'agency_operations:agency_client_submission', entityId: submission.id },
          // Never impersonate the customer contact as a staff execution user.
          // Native execution uses the explicitly configured workflow's own principal.
          initialContext: { ...scope, caseId, submissionId: submission.id, scaffoldScenario: submission.original.scaffoldScenario },
        })
        submission.workflowInstanceId = workflow.id
        await tx.flush()
        return { submission, replayed: false }
      })
      if (!accepted.replayed && accepted.submission.workflowInstanceId) {
        await container.resolve<Executor>('workflowExecutor').executeWorkflow(em, container, accepted.submission.workflowInstanceId)
      }
      return { item: await project(em, accepted.submission, native), replayed: accepted.replayed }
    },
    async list(identity, caseId) {
      const scope = await authorize(identity, caseId)
      const agencyCase = await findOneWithDecryption(em, AgencyCase, { id: caseId, ...scope, deletedAt: null }, undefined, scope)
      if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
      const submissions = await findWithDecryption(em, AgencyClientSubmission, {
        ...scope, caseId, deletedAt: null,
      }, { limit: 100, orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
      const native = submissions.some((submission) => !submission.workflowInstanceId)
        ? await nativeReady({ tenantId: scope.tenantId, organizationId: scope.organizationId }) : false
      return { items: await Promise.all(submissions.map((submission) => project(em, submission, native))) }
    },
  }
}
