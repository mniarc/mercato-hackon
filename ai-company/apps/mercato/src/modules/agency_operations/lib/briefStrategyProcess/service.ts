import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { TaskHandlerService } from '@open-mercato/core/modules/workflows/lib/task-handler'
import { decidePortalTaskAccess, resolvePortalTaskPrincipal } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_RESEARCH_SERVICE, briefRevisionOutcomeSchema, materialRevisionOutcomeSchema, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { CLIENT_SUBMISSION_SERVICE, type ClientSubmissionService } from '../contracts/clientSubmission'
import {
  BRIEF_REVIEW_CONTEXT_KEY, BRIEF_REVIEW_STEP_ID, BRIEF_REVIEW_WORKFLOW_ID, BRIEF_RESPONSE_CONTEXT_KEY,
  briefReviewInvitationSchema, briefReviewRequestSchema, type BriefReviewService, type BriefReviewRequest,
} from './contracts'
import { briefReviewStatus, renderBriefReview } from './review'
import { BRIEF_REVISION_RESULT_KEY } from '../briefRevision/contracts'
import { MATERIAL_REVISION_RESULT_KEY } from '../materialRevision/contracts'

type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow'>
type Scope = { tenantId: string; organizationId: string }
type ContactService = { findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }
const inviteSchema = z.object({ caseId: z.uuid(), versionId: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), sourceSubmissionId: z.uuid().optional() })
const executionContextSchema = z.object({ workflowInstance: z.object({ id: z.uuid(), workflowId: z.literal(BRIEF_REVIEW_WORKFLOW_ID), tenantId: z.uuid(), organizationId: z.uuid() }) })

function notFound(): never { throw new CrudHttpError(404, { error: 'api.errors.notFound' }) }
function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
export function briefResponseEventId(taskId: string, externalEventId: string): string {
  return `brief:${taskId}:${createHash('sha256').update(externalEventId).digest('hex')}`
}

export function createBriefReviewService(container: AppContainer): BriefReviewService & { receiveResponse(input: unknown, context: unknown): Promise<{ requestId: string; status: 'response_received'; replayed: boolean }> } {
  const em = container.resolve<EntityManager>('em')
  const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
  const contacts = container.resolve<ContactService>('customerUserService')

  async function contact(userId: string, customerEntityId: string, scope: Scope) {
    const current = await contacts.findById(userId, scope.tenantId, scope.organizationId)
    if (!current || current.isActive === false || current.customerEntityId !== customerEntityId) notFound()
  }

  async function loadTask(taskId: string, scope: Scope) {
    const task = await findOneWithDecryption(em, UserTask, { id: taskId, ...scope }, undefined, scope)
    if (!task) notFound()
    const instance = await findOneWithDecryption(em, WorkflowInstance, { id: task.workflowInstanceId, workflowId: BRIEF_REVIEW_WORKFLOW_ID, ...scope, deletedAt: null }, undefined, scope)
    if (!instance) notFound()
    const parsed = briefReviewInvitationSchema.safeParse(instance.context[BRIEF_REVIEW_CONTEXT_KEY])
    if (!parsed.success) notFound()
    const invitation = parsed.data
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { id: invitation.caseId, customerEntityId: invitation.customerEntityId, ...scope, deletedAt: null }, undefined, scope)
    if (!agencyCase || invitation.review.caseId !== agencyCase.id || task.assignedTo !== invitation.customerUserId || task.assigneeKind !== 'customer') notFound()
    await contact(invitation.customerUserId, invitation.customerEntityId, scope)
    return { task, instance, invitation, agencyCase }
  }

  async function accessible(auth: CustomerAuthContext, taskId: string) {
    const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
    if (!auth.customerEntityId) notFound()
    await contact(auth.sub, auth.customerEntityId, scope)
    const loaded = await loadTask(taskId, scope)
    const acl = await container.resolve<CustomerRbacService>('customerRbacService').loadAcl(auth.sub, scope)
    const resolved = await resolvePortalTaskPrincipal({ auth, em, isPortalAdmin: acl.isPortalAdmin })
    if (!resolved.ok) notFound()
    const access = decidePortalTaskAccess(resolved.principal, loaded.task)
    if (!access.visible) notFound()
    return { ...loaded, access, scope }
  }

  async function currentReview(loaded: Awaited<ReturnType<typeof loadTask>>, scope: Scope) {
    const projection = await research.getBriefReview(scope, loaded.agencyCase.id, loaded.invitation.review.versionId)
    const matches = projection?.documentId === loaded.invitation.review.documentId && projection.versionId === loaded.invitation.review.versionId
    const { acceptanceReceipt: _snapshotReceipt, ...snapshot } = loaded.invitation.review
    const acceptance = projection && matches && projection.versionStatus === 'approved'
      ? await research.getBriefAcceptance(scope, loaded.agencyCase.id, snapshot.versionId) : null
    if (acceptance && acceptance.orderRef === loaded.agencyCase.id && acceptance.documentId === snapshot.documentId
      && acceptance.versionId === snapshot.versionId && acceptance.version === snapshot.version) {
      return { ...snapshot, isCurrent: Boolean(projection?.isCurrent), status: 'approved' as const,
        acceptanceReceipt: { acceptedAt: acceptance.acceptedAt } }
    }
    const status = projection && matches ? briefReviewStatus(projection) : null
    return { ...snapshot, isCurrent: Boolean(matches && projection?.isCurrent), status: status ?? 'blocked' as const }
  }

  async function existingReceipt(task: UserTask, caseId: string, response: BriefReviewRequest, scope: Scope) {
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, caseId, channel: 'portal', eventId: briefResponseEventId(task.id, response.externalEventId), deletedAt: null,
    }, undefined, scope)
    const stored = record(submission?.original.reviewResponse)
    return submission && submission.submittedByCustomerUserId === task.assignedTo && stored.taskId === task.id
      && stored.versionId === response.versionId && stored.documentId === response.documentId ? submission : null
  }

  async function receiveResponse(rawInput: unknown, rawContext: unknown) {
    const { workflowInstance } = executionContextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const task = await findOneWithDecryption(em, UserTask, { workflowInstanceId: workflowInstance.id, status: 'COMPLETED', assigneeKind: 'customer', ...scope }, undefined, scope)
    if (!task) notFound()
    const loaded = await loadTask(task.id, scope)
    const response = briefReviewRequestSchema.parse(record(rawInput).response)
    const original = briefReviewRequestSchema.parse(record(task.formData)[BRIEF_RESPONSE_CONTEXT_KEY])
    if (task.completedBy !== loaded.invitation.customerUserId || !isDeepStrictEqual(response, original)) notFound()
    if (response.versionId !== loaded.invitation.review.versionId || response.documentId !== loaded.invitation.review.documentId) notFound()
    const previous = await existingReceipt(task, loaded.agencyCase.id, response, scope)
    if (previous) return { requestId: previous.id, status: 'response_received' as const, replayed: true }
    const review = await currentReview(loaded, scope)
    if (!review.isCurrent || (review.status !== 'ready_for_review' && !(review.status === 'needs_review' && response.kind === 'message'))) conflict()
    const result = await container.resolve<ClientSubmissionService>(CLIENT_SUBMISSION_SERVICE).submit({
      ...scope, customerUserId: loaded.invitation.customerUserId, customerEntityId: loaded.invitation.customerEntityId,
    }, loaded.agencyCase.id, {
      eventId: briefResponseEventId(task.id, response.externalEventId),
      text: response.kind === 'approval' ? `Client requests approval of brief version ${response.versionId}.` : response.body,
      documentVersionReference: response.versionId,
      reviewResponse: { taskId: task.id, ...response },
    })
    return { requestId: result.item.submissionId, status: 'response_received' as const, replayed: result.replayed }
  }

  return {
    receiveResponse,
    async read(auth, taskId) {
      z.uuid().parse(taskId)
      const loaded = await accessible(auth, taskId)
      const review = await currentReview(loaded, loaded.scope)
      return { ok: true, review, canRespond: loaded.access.actable && review.isCurrent && (review.status === 'ready_for_review' || review.status === 'needs_review') }
    },
    async invite(rawInput) {
      const input = inviteSchema.parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['agency_research.manage'], scope)) {
        throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      }
      const executor = container.resolve<Executor>('workflowExecutor')
      const started = await em.transactional(async (tx) => {
        const agencyCase = await findOneWithDecryption(tx, AgencyCase, { id: input.caseId, ...scope, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
        if (!agencyCase) notFound()
        await contact(agencyCase.submittedByCustomerUserId, agencyCase.customerEntityId, scope)
        let materialQuestions: Array<{ questionId: string; question: string }> | undefined
        if (input.sourceSubmissionId) {
          const source = await findOneWithDecryption(tx, AgencyClientSubmission, {
            ...scope, id: input.sourceSubmissionId, caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId,
            submittedByCustomerUserId: agencyCase.submittedByCustomerUserId, deletedAt: null,
          }, undefined, scope)
          const sourceWorkflow = source?.workflowInstanceId ? await findOneWithDecryption(tx, WorkflowInstance, {
            ...scope, id: source.workflowInstanceId, workflowId: 'agency_operations.client-submission.native.v1', deletedAt: null,
          }, undefined, scope) : null
          const outcome = z.object({ result: briefRevisionOutcomeSchema }).safeParse(sourceWorkflow?.context[BRIEF_REVISION_RESULT_KEY])
          const original = record(record(source?.original).reviewResponse)
          const briefFollowUp = source && outcome.success && outcome.data.result.status === 'needs_client_data'
            && outcome.data.result.orderRef === agencyCase.id && outcome.data.result.submissionId === source.id
            && outcome.data.result.previousBriefVersionId === input.versionId && outcome.data.result.briefVersionId === null
            && original.kind === 'message' && original.versionId === input.versionId
          if (!briefFollowUp) {
            const material = z.object({ result: materialRevisionOutcomeSchema }).safeParse(sourceWorkflow?.context[MATERIAL_REVISION_RESULT_KEY])
            if (!source || !material.success || material.data.result.status !== 'needs_client_data'
              || material.data.result.orderRef !== agencyCase.id || material.data.result.submissionId !== source.id
              || material.data.result.previousBriefVersionId !== input.versionId || material.data.result.briefVersionId !== null
              || material.data.result.sourcesVersionId !== null || material.data.result.findingsVersionId !== null
              || material.data.result.documentVersionIds.length || material.data.result.escalationVersionId
              || !material.data.result.questions.length || !z.uuid().safeParse(source.original.materialAttachmentId).success) conflict()
            materialQuestions = material.data.result.questions
          }
        }
        const projection = await research.getBriefReview(scope, agencyCase.id, input.versionId)
        const review = projection ? await renderBriefReview(projection, agencyCase.id) : null
        if (!review) conflict()
        if (materialQuestions && (review.status !== 'needs_review' || !isDeepStrictEqual(materialQuestions,
          projection?.questions.map((question) => ({ questionId: question.question_id, question: question.question }))))) conflict()
        const correlationKey = `agency-brief:${agencyCase.id}:${input.versionId}${input.sourceSubmissionId ? `:reply:${input.sourceSubmissionId}` : ''}`
        const existing = await findOneWithDecryption(tx, WorkflowInstance, { workflowId: BRIEF_REVIEW_WORKFLOW_ID, correlationKey, ...scope, deletedAt: null }, undefined, scope)
        if (existing) return { workflowInstanceId: existing.id, replayed: true }
        const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
        const definition = await authoring.findOwnedDefinition(tx, { workflowId: BRIEF_REVIEW_WORKFLOW_ID, ...scope })
        if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'brief_review') conflict()
        const instance = await executor.startWorkflow(tx, {
          ...scope, workflowId: BRIEF_REVIEW_WORKFLOW_ID, correlationKey,
          metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id, initiatedBy: input.userId },
          initialContext: { [BRIEF_REVIEW_CONTEXT_KEY]: {
            caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId, customerUserId: agencyCase.submittedByCustomerUserId, review,
          } },
        })
        return { workflowInstanceId: instance.id, replayed: false }
      })
      if (!started.replayed) await executor.executeWorkflow(em, container, started.workflowInstanceId, { userId: input.userId })
      const task = await findOneWithDecryption(em, UserTask, { workflowInstanceId: started.workflowInstanceId, assigneeKind: 'customer', ...scope }, undefined, scope)
      if (!task) conflict()
      return { ...started, taskId: task.id }
    },
    async respond(auth, caseId, rawInput) {
      z.uuid().parse(caseId)
      const input = briefReviewRequestSchema.parse(rawInput)
      const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
      const replayTask = await findOneWithDecryption(em, UserTask, {
        ...scope, assigneeKind: 'customer', assignedTo: auth.sub, completedBy: auth.sub, status: 'COMPLETED',
        formData: { [BRIEF_RESPONSE_CONTEXT_KEY]: { externalEventId: input.externalEventId, documentId: input.documentId, versionId: input.versionId } },
      }, undefined, scope)
      const correlationKey = `agency-brief:${caseId}:${input.versionId}`
      const instance = await findOneWithDecryption(em, WorkflowInstance, {
        workflowId: BRIEF_REVIEW_WORKFLOW_ID, ...scope, deletedAt: null,
        ...(replayTask ? { id: replayTask.workflowInstanceId } : { $or: [{ correlationKey }, { correlationKey: { $like: `${correlationKey}:reply:%` } }] }),
      }, { orderBy: { createdAt: 'DESC' } }, scope)
      if (!instance) notFound()
      const task = replayTask ?? await findOneWithDecryption(em, UserTask, { workflowInstanceId: instance.id, assignedTo: auth.sub, assigneeKind: 'customer', ...scope }, undefined, scope)
      if (!task) notFound()
      const loaded = await accessible(auth, task.id)
      if (loaded.agencyCase.id !== caseId || input.documentId !== loaded.invitation.review.documentId || input.versionId !== loaded.invitation.review.versionId) notFound()
      if (task.status === 'COMPLETED') {
        const original = briefReviewRequestSchema.safeParse(record(task.formData)[BRIEF_RESPONSE_CONTEXT_KEY])
        if (!original.success || original.data.externalEventId !== input.externalEventId || task.completedBy !== auth.sub) conflict()
        const previous = await existingReceipt(task, caseId, original.data, scope)
        if (!previous) conflict()
        return { requestId: previous.id, status: 'response_received', replayed: true }
      }
      if (!loaded.access.actable || instance.status !== 'PAUSED' || instance.currentStepId !== BRIEF_REVIEW_STEP_ID) conflict()
      const review = await currentReview(loaded, scope)
      if (!review.isCurrent || (review.status !== 'ready_for_review' && !(review.status === 'needs_review' && input.kind === 'message'))) conflict()
      try {
        await container.resolve<TaskHandlerService>('taskHandler').completeUserTask(em, container, {
          taskId: task.id, userId: auth.sub, scope, formData: { [BRIEF_RESPONSE_CONTEXT_KEY]: input },
        })
      } catch (error) {
        if (record(error).code === 'TASK_NOT_FOUND' || record(error).code === 'TASK_ASSIGNED_TO_ANOTHER_USER') conflict()
        throw error
      }
      const previous = await existingReceipt(task, caseId, input, scope)
      if (!previous) conflict()
      return { requestId: previous.id, status: 'response_received', replayed: false }
    },
  }
}
