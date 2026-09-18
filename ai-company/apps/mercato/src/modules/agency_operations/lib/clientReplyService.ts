import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { StepInstance, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type * as NativeSignalHandler from '@open-mercato/core/modules/workflows/lib/signal-handler'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { AgencyCase, AgencyClientSubmission } from '../data/entities'
import { AgencyClientReply } from '../data/clientReply'
import type { ClientCaseIdentity } from './contracts/clientCaseQuery'
import { clientMaterialIntakeInputSchema } from './contracts/clientMaterialIntake'
import { clientReplyRequestSchema, type ClientReplyItem, type ClientReplyService } from './contracts/clientReply'
import { clientSubmissionDispositionSchema } from './contracts/clientSubmission'
import { CLIENT_REPLY_SIGNAL, CLIENT_SUBMISSION_WORKFLOW_ID, CLIENT_TRIAGE_RESULT_KEY } from './clientSubmissionWorkflow'

function project(reply: AgencyClientReply): ClientReplyItem {
  return {
    replyId: reply.id, caseId: reply.caseId, submissionId: reply.submissionId,
    channel: 'portal', submittedByCustomerUserId: reply.submittedByCustomerUserId,
    createdAt: reply.createdAt.toISOString(), original: clientReplyRequestSchema.parse(reply.original),
    // Only a transaction that successfully delivered the signal creates an accepted reply.
    outcome: 'clarification_received',
  }
}

export function createClientReplyService(container: AppContainer): ClientReplyService {
  const em = container.resolve<EntityManager>('em')
  const customers = container.resolve<{
    findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null>
  }>('customerUserService')

  async function authorize(rawIdentity: ClientCaseIdentity, caseId: string, submissionId: string) {
    const identity = clientMaterialIntakeInputSchema.shape.identity.parse(rawIdentity)
    z.uuid().parse(caseId)
    z.uuid().parse(submissionId)
    const contact = await customers.findById(identity.customerUserId, identity.tenantId, identity.organizationId)
    if (!contact || contact.isActive === false || contact.customerEntityId !== identity.customerEntityId) {
      throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
    }
    return { tenantId: identity.tenantId, organizationId: identity.organizationId, customerEntityId: identity.customerEntityId }
  }

  return {
    async reply(identity, caseId, submissionId, rawInput) {
      const scope = await authorize(identity, caseId, submissionId)
      const input = clientReplyRequestSchema.parse(rawInput)
      return em.transactional(async (tx) => {
        const agencyCase = await findOneWithDecryption(tx, AgencyCase, { id: caseId, ...scope, deletedAt: null }, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
        }, scope)
        if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
        const submission = await findOneWithDecryption(tx, AgencyClientSubmission, {
          id: submissionId, caseId, ...scope, deletedAt: null,
        }, undefined, scope)
        if (!submission) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
        const previous = await findOneWithDecryption(tx, AgencyClientReply, {
          ...scope, caseId, submissionId, channel: 'portal', eventId: input.eventId,
        }, undefined, scope)
        if (previous) return { item: project(previous), replayed: true }

        const workflowScope = { tenantId: scope.tenantId, organizationId: scope.organizationId }
        const workflow = submission.workflowInstanceId ? await findOneWithDecryption(tx, WorkflowInstance, {
          id: submission.workflowInstanceId, ...workflowScope, deletedAt: null,
        }, { lockMode: LockMode.PESSIMISTIC_WRITE }, workflowScope) : null
        const decision = clientSubmissionDispositionSchema.safeParse(workflow?.context?.[CLIENT_TRIAGE_RESULT_KEY]?.result)
        if (!workflow || workflow.workflowId !== CLIENT_SUBMISSION_WORKFLOW_ID
          || workflow.status !== 'PAUSED' || workflow.currentStepId !== 'client_reply'
          || workflow.context?.caseId !== caseId || workflow.context?.submissionId !== submissionId
          || !decision.success || decision.data.kind !== 'clarify'
          || decision.data.targets.caseId !== caseId || decision.data.targets.submissionId !== submissionId) {
          throw new CrudHttpError(409, { error: 'api.errors.conflict' })
        }
        const step = await findOneWithDecryption(tx, StepInstance, {
          workflowInstanceId: workflow.id, stepId: 'client_reply', status: 'ACTIVE', ...workflowScope,
        }, undefined, workflowScope)
        if (!step) throw new CrudHttpError(409, { error: 'api.errors.conflict' })

        const reply = tx.create(AgencyClientReply, {
          ...scope, caseId, submissionId, channel: 'portal', eventId: input.eventId,
          submittedByCustomerUserId: identity.customerUserId, original: input,
          workflowInstanceId: workflow.id, stepInstanceId: step.id,
        })
        tx.persist(reply)
        await tx.flush()
        // This domain-authorized, fixed signal is not the staff arbitrary-signal endpoint.
        // The native internal service permits a system actor; customer identity is evidence,
        // never a forged staff userId. Its flushes/transition writes share this transaction.
        await container.resolve<Pick<typeof NativeSignalHandler, 'sendSignal'>>('signalHandler').sendSignal(tx, container, {
          ...workflowScope, instanceId: workflow.id, signalName: CLIENT_REPLY_SIGNAL,
          payload: { clientClarificationReply: {
            replyId: reply.id, submissionId, submittedByCustomerUserId: identity.customerUserId,
            receivedAt: reply.createdAt.toISOString(), channel: 'portal',
          } },
        })
        return { item: project(reply), replayed: false }
      })
    },
    async list(identity, caseId, submissionId) {
      const scope = await authorize(identity, caseId, submissionId)
      const agencyCase = await findOneWithDecryption(em, AgencyCase, { id: caseId, ...scope, deletedAt: null }, undefined, scope)
      if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
      const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
        id: submissionId, caseId, ...scope, deletedAt: null,
      }, undefined, scope)
      if (!submission) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
      const replies = await findWithDecryption(em, AgencyClientReply, { ...scope, caseId, submissionId, deletedAt: null }, {
        limit: 100, orderBy: { createdAt: 'desc', id: 'desc' },
      }, scope)
      return { items: replies.map(project) }
    },
  }
}
