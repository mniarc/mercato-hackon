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
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { CLIENT_SUBMISSION_SERVICE, type ClientSubmissionService } from '../contracts/clientSubmission'
import { POST_REVIEW_CONTEXT_KEY as INVITATION, POST_RESPONSE_CONTEXT_KEY as RESPONSE,
  POST_REVIEW_WORKFLOW_ID as WORKFLOW, postReviewInvitationSchema, postReviewRequestSchema, postReviewSchema, type PostReviewService, type PostReviewRequest } from './contracts'
import { postReviewEligible, renderPostReview } from './review'

type Scope = { tenantId: string; organizationId: string }
type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow'>
type Contacts = { findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }
function missing(): never { throw new CrudHttpError(404, { error: 'api.errors.notFound' }) }
function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const postReviewEventId = (taskId: string, eventId: string) => `post-review:${taskId}:${createHash('sha256').update(eventId).digest('hex')}`
function responseAvailable(review: z.infer<typeof postReviewSchema>) {
  return review.post.isCurrent && review.post.status === 'ready_for_review'
}

export function createPostReviewService(container: AppContainer): PostReviewService {
  const em = container.resolve<EntityManager>('em')
  const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
  async function contact(userId: string, customerEntityId: string, scope: Scope) {
    const current = await container.resolve<Contacts>('customerUserService').findById(userId, scope.tenantId, scope.organizationId)
    if (!current || current.isActive === false || current.customerEntityId !== customerEntityId) missing()
  }
  async function loadTask(taskId: string, scope: Scope) {
    const task = await findOneWithDecryption(em, UserTask, { ...scope, id: taskId }, undefined, scope)
    if (!task) missing()
    const instance = await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: task.workflowInstanceId, workflowId: WORKFLOW, deletedAt: null }, undefined, scope)
    if (!instance) missing()
    const parsed = postReviewInvitationSchema.safeParse(instance.context[INVITATION])
    if (!parsed.success) missing()
    const invitation = parsed.data
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: invitation.caseId, customerEntityId: invitation.customerEntityId, deletedAt: null }, undefined, scope)
    if (!agencyCase || invitation.review.caseId !== agencyCase.id || invitation.review.post.caseId !== agencyCase.id
      || task.assignedTo !== invitation.customerUserId || task.assigneeKind !== 'customer') missing()
    await contact(invitation.customerUserId, invitation.customerEntityId, scope)
    return { task, instance, invitation, agencyCase }
  }
  async function accessible(auth: CustomerAuthContext, taskId: string) {
    const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
    if (!auth.customerEntityId) missing()
    await contact(auth.sub, auth.customerEntityId, scope)
    const loaded = await loadTask(taskId, scope)
    const acl = await container.resolve<CustomerRbacService>('customerRbacService').loadAcl(auth.sub, scope)
    const principal = await resolvePortalTaskPrincipal({ auth, em, isPortalAdmin: acl.isPortalAdmin })
    if (!principal.ok) missing()
    const access = decidePortalTaskAccess(principal.principal, loaded.task)
    if (!access.visible) missing()
    return { ...loaded, scope, access }
  }
  async function currentReview(loaded: Awaited<ReturnType<typeof loadTask>>, scope: Scope) {
    const snapshot = loaded.invitation.review
    const current = await research.getPostAcceptance(scope, { orderRef: loaded.agencyCase.id, postVersionId: snapshot.post.versionId })
    const eligible = postReviewEligible(current, loaded.agencyCase.id)
    const matches = eligible && current.post.documentId === snapshot.post.documentId && current.post.versionId === snapshot.post.versionId
    const { acceptanceReceipt: _snapshotReceipt, ...document } = snapshot.post
    return { ...snapshot, post: { ...document, isCurrent: Boolean(matches),
      status: matches ? current.receipt ? 'approved' as const : 'ready_for_review' as const : 'blocked' as const,
      ...(matches && current.receipt ? { acceptanceReceipt: { acceptedAt: current.receipt.at } } : {}),
    } }
  }
  function matchesPost(input: PostReviewRequest, loaded: Awaited<ReturnType<typeof loadTask>>) {
    return input.post.documentId === loaded.invitation.review.post.documentId && input.post.versionId === loaded.invitation.review.post.versionId
  }
  async function existingReceipt(task: UserTask, loaded: Awaited<ReturnType<typeof loadTask>>, response: PostReviewRequest, scope: Scope) {
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, caseId: loaded.agencyCase.id, customerEntityId: loaded.invitation.customerEntityId, channel: 'portal',
      eventId: postReviewEventId(task.id, response.externalEventId), deletedAt: null,
    }, undefined, scope)
    return submission && submission.submittedByCustomerUserId === task.assignedTo
      && isDeepStrictEqual(submission.original.postReviewResponse, { taskId: task.id, ...response }) ? submission : null
  }
  return {
    async invite(rawInput) {
      const input = z.object({ caseId: z.uuid(), postVersionId: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['agency_research.manage'], scope)) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      const executor = container.resolve<Executor>('workflowExecutor')
      const started = await em.transactional(async (tx) => {
        const agencyCase = await findOneWithDecryption(tx, AgencyCase, { ...scope, id: input.caseId, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
        if (!agencyCase) missing()
        await contact(agencyCase.submittedByCustomerUserId, agencyCase.customerEntityId, scope)
        const current = await research.getPostAcceptance(scope, { orderRef: agencyCase.id, postVersionId: input.postVersionId })
        if (!postReviewEligible(current, agencyCase.id)) conflict()
        const correlationKey = `agency-post:${agencyCase.id}:${input.postVersionId}`
        const previous = await findOneWithDecryption(tx, WorkflowInstance, { ...scope, workflowId: WORKFLOW, correlationKey, deletedAt: null }, undefined, scope)
        if (previous) return { workflowInstanceId: previous.id, replayed: true }
        if (current.receipt) conflict()
        const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring').findOwnedDefinition(tx, { ...scope, workflowId: WORKFLOW })
        if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'post_review') conflict()
        const review = await renderPostReview(current, agencyCase.id)
        const instance = await executor.startWorkflow(tx, {
          ...scope, workflowId: WORKFLOW, correlationKey,
          metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id, initiatedBy: input.userId },
          initialContext: { [INVITATION]: { caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId, customerUserId: agencyCase.submittedByCustomerUserId, review } },
        })
        return { workflowInstanceId: instance.id, replayed: false }
      })
      if (!started.replayed) await executor.executeWorkflow(em, container, started.workflowInstanceId, { userId: input.userId })
      const task = await findOneWithDecryption(em, UserTask, { ...scope, workflowInstanceId: started.workflowInstanceId, assigneeKind: 'customer' }, undefined, scope)
      if (!task) conflict()
      return { ...started, taskId: task.id }
    },
    async read(auth, taskId) {
      z.uuid().parse(taskId)
      const loaded = await accessible(auth, taskId)
      const review = await currentReview(loaded, loaded.scope)
      return { ok: true, review, canRespond: loaded.access.actable && loaded.task.assignedTo === auth.sub
        && loaded.instance.status === 'PAUSED' && loaded.instance.currentStepId === 'client_review'
        && responseAvailable(review) }
    },
    async respond(auth, taskId, rawInput) {
      z.uuid().parse(taskId)
      const input = postReviewRequestSchema.parse(rawInput)
      const loaded = await accessible(auth, taskId)
      const { task, instance, scope } = loaded
      if (task.assignedTo !== auth.sub || !matchesPost(input, loaded)) missing()
      if (task.status === 'COMPLETED') {
        const original = postReviewRequestSchema.safeParse(record(task.formData)[RESPONSE])
        if (!original.success || !isDeepStrictEqual(original.data, input) || task.completedBy !== auth.sub) conflict()
        const stored = await existingReceipt(task, loaded, original.data, scope)
        if (!stored) conflict()
        return { requestId: stored.id, status: 'response_received', replayed: true }
      }
      const review = await currentReview(loaded, scope)
      if (!loaded.access.actable || instance.status !== 'PAUSED' || instance.currentStepId !== 'client_review'
        || !responseAvailable(review)) conflict()
      try {
        await container.resolve<TaskHandlerService>('taskHandler').completeUserTask(em, container, {
          taskId, userId: auth.sub, scope, formData: { [RESPONSE]: input },
        })
      } catch (error) {
        if (record(error).code === 'TASK_NOT_FOUND' || record(error).code === 'TASK_ASSIGNED_TO_ANOTHER_USER') conflict()
        throw error
      }
      const stored = await existingReceipt(task, loaded, input, scope)
      if (!stored) conflict()
      return { requestId: stored.id, status: 'response_received', replayed: false }
    },
    async receiveResponse(rawInput, rawContext) {
      const { workflowInstance } = z.object({ workflowInstance: z.object({ id: z.uuid(), workflowId: z.literal(WORKFLOW), tenantId: z.uuid(), organizationId: z.uuid() }) }).parse(rawContext)
      const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
      const task = await findOneWithDecryption(em, UserTask, { ...scope, workflowInstanceId: workflowInstance.id, status: 'COMPLETED', assigneeKind: 'customer' }, undefined, scope)
      if (!task) missing()
      const loaded = await loadTask(task.id, scope)
      const input = postReviewRequestSchema.parse(record(rawInput).response)
      const original = postReviewRequestSchema.parse(record(task.formData)[RESPONSE])
      if (task.completedBy !== loaded.invitation.customerUserId || !isDeepStrictEqual(input, original) || !matchesPost(original, loaded)) missing()
      const previous = await existingReceipt(task, loaded, original, scope)
      if (previous) return { requestId: previous.id, status: 'response_received', replayed: true }
      const review = await currentReview(loaded, scope)
      if (!responseAvailable(review)) conflict()
      const result = await container.resolve<ClientSubmissionService>(CLIENT_SUBMISSION_SERVICE).submit({
        ...scope, customerUserId: loaded.invitation.customerUserId, customerEntityId: loaded.invitation.customerEntityId,
      }, loaded.agencyCase.id, {
        eventId: postReviewEventId(task.id, original.externalEventId),
        text: original.kind === 'message' ? original.body : `Client explicitly approves the content of post ${original.post.versionId}. This is not publication permission.`,
        documentVersionReference: original.post.versionId,
        postReviewResponse: { taskId: task.id, ...original },
      })
      return { requestId: result.item.submissionId, status: 'response_received', replayed: result.replayed }
    },
  }
}




