import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { AgencyCase, AgencyClientSubmission } from '../data/entities'
import type { ClientCaseIdentity } from './contracts/clientCaseQuery'
import { clientMaterialIntakeInputSchema } from './contracts/clientMaterialIntake'
import { clientSubmissionDispositionSchema, clientSubmissionRequestSchema, type ClientSubmissionItem, type ClientSubmissionService } from './contracts/clientSubmission'
import { CLIENT_SUBMISSION_WORKFLOW_ID, CLIENT_TRIAGE_RESULT_KEY } from './clientSubmissionWorkflow'

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

  async function project(manager: EntityManager, submission: AgencyClientSubmission): Promise<ClientSubmissionItem> {
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
    }
  }

  return {
    async submit(identity, caseId, rawInput) {
      const scope = await authorize(identity, caseId)
      const input = clientSubmissionRequestSchema.parse(rawInput)
      return em.transactional(async (tx) => {
        // Serializes this case's submissions through commit, including workflow creation.
        const agencyCase = await findOneWithDecryption(tx, AgencyCase, { id: caseId, ...scope, deletedAt: null }, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
        }, scope)
        if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
        const existing = await findOneWithDecryption(tx, AgencyClientSubmission, {
          ...scope, caseId, channel: 'portal', eventId: input.eventId,
        }, undefined, scope)
        if (existing) {
          // Replaying the key always returns its immutable original; it never reclassifies.
          return { item: await project(tx, existing), replayed: true }
        }
        if (input.materialAttachmentId && input.materialAttachmentId !== agencyCase.materialAttachmentId) {
          throw new CrudHttpError(404, { error: 'api.errors.notFound' })
        }
        const submission = tx.create(AgencyClientSubmission, {
          ...scope, caseId, submittedByCustomerUserId: identity.customerUserId,
          channel: 'portal', eventId: input.eventId, original: input,
        })
        tx.persist(submission)
        await tx.flush()
        const executor = container.resolve<Executor>('workflowExecutor')
        const workflow = await executor.startWorkflow(tx, {
          workflowId: CLIENT_SUBMISSION_WORKFLOW_ID, ...scope,
          correlationKey: `agency-submission:${submission.id}`,
          metadata: { entityType: 'agency_operations:agency_client_submission', entityId: submission.id },
          // Never impersonate the customer contact as a staff execution user.
          // The deterministic activity needs no staff principal or external capability.
          initialContext: { ...scope, caseId, submissionId: submission.id, scaffoldScenario: input.scaffoldScenario },
        })
        submission.workflowInstanceId = workflow.id
        await tx.flush()
        await executor.executeWorkflow(tx, container, workflow.id)
        return { item: await project(tx, submission), replayed: false }
      })
    },
    async list(identity, caseId) {
      const scope = await authorize(identity, caseId)
      const agencyCase = await findOneWithDecryption(em, AgencyCase, { id: caseId, ...scope, deletedAt: null }, undefined, scope)
      if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
      const submissions = await findWithDecryption(em, AgencyClientSubmission, {
        ...scope, caseId, deletedAt: null,
      }, { limit: 100, orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
      return { items: await Promise.all(submissions.map((submission) => project(em, submission))) }
    },
  }
}
