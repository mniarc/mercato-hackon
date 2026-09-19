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
import { STRATEGY_PAIR_REVIEW_CONTEXT_KEY as INVITATION, STRATEGY_PAIR_RESPONSE_CONTEXT_KEY as RESPONSE,
  STRATEGY_PAIR_REVIEW_WORKFLOW_ID as WORKFLOW, strategyPairInvitationSchema, strategyPairRequestSchema, strategyPairReviewSchema, type StrategyPairReviewService, type StrategyPairRequest } from './contracts'
import { pairReviewEligible, renderStrategyPair } from './review'

type Scope = { tenantId: string; organizationId: string }
type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow'>
type Contacts = { findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }
function missing(): never { throw new CrudHttpError(404, { error: 'api.errors.notFound' }) }
function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const strategyPairEventId = (taskId: string, eventId: string) => `strategy-pair:${taskId}:${createHash('sha256').update(eventId).digest('hex')}`
function responseAvailable(review: z.infer<typeof strategyPairReviewSchema>, input?: StrategyPairRequest) {
  const kinds = ['strategy', 'tov'] as const
  if (!kinds.every((kind) => review[kind].isCurrent && ['approved', 'ready_for_review'].includes(review[kind].status))) return false
  if (!kinds.some((kind) => review[kind].status === 'ready_for_review')) return false
  return input?.kind !== 'approval' || input.approvedDocuments!.every((kind) => review[kind].status === 'ready_for_review')
}

export function createStrategyPairReviewService(container: AppContainer): StrategyPairReviewService {
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
    const parsed = strategyPairInvitationSchema.safeParse(instance.context[INVITATION])
    if (!parsed.success) missing()
    const invitation = parsed.data
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: invitation.caseId, customerEntityId: invitation.customerEntityId, deletedAt: null }, undefined, scope)
    if (!agencyCase || invitation.review.caseId !== agencyCase.id || invitation.review.strategy.caseId !== agencyCase.id || invitation.review.tov.caseId !== agencyCase.id
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
  async function currentPair(caseId: string, strategyVersionId: string, tovVersionId: string, scope: Scope) {
    const pair = await research.getStrategyReview(scope, caseId, strategyVersionId, tovVersionId)
    const acceptance = await research.getStrategyPairAcceptance(scope, { orderRef: caseId, strategyVersionId, tovVersionId })
    return { pair, acceptance, eligible: pairReviewEligible(pair, acceptance, caseId) }
  }
  async function currentReview(loaded: Awaited<ReturnType<typeof loadTask>>, scope: Scope) {
    const snapshot = loaded.invitation.review
    const { pair, acceptance, eligible } = await currentPair(loaded.agencyCase.id, snapshot.strategy.versionId, snapshot.tov.versionId, scope)
    const matches = pair?.strategy.documentId === snapshot.strategy.documentId && pair.tov.documentId === snapshot.tov.documentId
    const project = (kind: 'strategy' | 'tov') => {
      const { acceptanceReceipt: _untrustedReceipt, ...document } = snapshot[kind]
      const saved = acceptance.status === 'not_ready' ? null : acceptance.acceptances[kind]
      return { ...document, isCurrent: Boolean(matches && pair?.[kind].isCurrent),
        status: eligible && matches ? saved ? 'approved' as const : 'ready_for_review' as const : 'blocked' as const,
        ...(eligible && matches && saved ? { acceptanceReceipt: { acceptedAt: saved.at } } : {}),
      }
    }
    return { caseId: snapshot.caseId, strategy: project('strategy'), tov: project('tov') }
  }
  function matchesPair(input: StrategyPairRequest, loaded: Awaited<ReturnType<typeof loadTask>>) {
    return (['strategy', 'tov'] as const).every((kind) => input[kind].documentId === loaded.invitation.review[kind].documentId && input[kind].versionId === loaded.invitation.review[kind].versionId)
  }
  async function existingReceipt(task: UserTask, loaded: Awaited<ReturnType<typeof loadTask>>, response: StrategyPairRequest, scope: Scope) {
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, caseId: loaded.agencyCase.id, customerEntityId: loaded.invitation.customerEntityId, channel: 'portal',
      eventId: strategyPairEventId(task.id, response.externalEventId), deletedAt: null,
    }, undefined, scope)
    return submission && submission.submittedByCustomerUserId === task.assignedTo
      && isDeepStrictEqual(submission.original.strategyReviewResponse, { taskId: task.id, ...response }) ? submission : null
  }
  return {
    async invite(rawInput) {
      const input = z.object({ caseId: z.uuid(), strategyVersionId: z.uuid(), tovVersionId: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['agency_research.manage'], scope)) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      const executor = container.resolve<Executor>('workflowExecutor')
      const started = await em.transactional(async (tx) => {
        const agencyCase = await findOneWithDecryption(tx, AgencyCase, { ...scope, id: input.caseId, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
        if (!agencyCase) missing()
        await contact(agencyCase.submittedByCustomerUserId, agencyCase.customerEntityId, scope)
        const { pair, acceptance, eligible } = await currentPair(agencyCase.id, input.strategyVersionId, input.tovVersionId, scope)
        if (!pair || !eligible || acceptance.status !== 'partial' || !acceptance.remainingDocuments.length) conflict()
        const lineage = (['strategy', 'tov'] as const).flatMap((kind) => {
          const saved = acceptance.acceptances[kind]
          return saved ? [`${kind}:${saved.source.submissionId}`] : []
        })
        const suffix = lineage.length ? `:after:${createHash('sha256').update(lineage.join('|')).digest('hex')}` : ''
        const correlationKey = `agency-strategy-pair:${agencyCase.id}:${input.strategyVersionId}:${input.tovVersionId}${suffix}`
        const previous = await findOneWithDecryption(tx, WorkflowInstance, { ...scope, workflowId: WORKFLOW, correlationKey, deletedAt: null }, undefined, scope)
        if (previous) return { workflowInstanceId: previous.id, replayed: true }
        const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring').findOwnedDefinition(tx, { ...scope, workflowId: WORKFLOW })
        if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'strategy_pair_review') conflict()
        const review = await renderStrategyPair(pair, agencyCase.id)
        for (const kind of ['strategy', 'tov'] as const) {
          const saved = acceptance.acceptances[kind]
          if (saved) review[kind] = { ...review[kind], status: 'approved', acceptanceReceipt: { acceptedAt: saved.at } }
        }
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
      const input = strategyPairRequestSchema.parse(rawInput)
      const loaded = await accessible(auth, taskId)
      const { task, instance, scope } = loaded
      if (task.assignedTo !== auth.sub || !matchesPair(input, loaded)) missing()
      if (task.status === 'COMPLETED') {
        const original = strategyPairRequestSchema.safeParse(record(task.formData)[RESPONSE])
        if (!original.success || !isDeepStrictEqual(original.data, input) || task.completedBy !== auth.sub) conflict()
        const stored = await existingReceipt(task, loaded, original.data, scope)
        if (!stored) conflict()
        return { requestId: stored.id, status: 'response_received', replayed: true }
      }
      const review = await currentReview(loaded, scope)
      if (!loaded.access.actable || instance.status !== 'PAUSED' || instance.currentStepId !== 'client_review'
        || !responseAvailable(review, input)) conflict()
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
      const input = strategyPairRequestSchema.parse(record(rawInput).response)
      const original = strategyPairRequestSchema.parse(record(task.formData)[RESPONSE])
      if (task.completedBy !== loaded.invitation.customerUserId || !isDeepStrictEqual(input, original) || !matchesPair(original, loaded)) missing()
      const previous = await existingReceipt(task, loaded, original, scope)
      if (previous) return { requestId: previous.id, status: 'response_received', replayed: true }
      const review = await currentReview(loaded, scope)
      if (!responseAvailable(review, original)) conflict()
      const result = await container.resolve<ClientSubmissionService>(CLIENT_SUBMISSION_SERVICE).submit({
        ...scope, customerUserId: loaded.invitation.customerUserId, customerEntityId: loaded.invitation.customerEntityId,
      }, loaded.agencyCase.id, {
        eventId: strategyPairEventId(task.id, original.externalEventId),
        text: original.kind === 'message' ? original.body : `Client requests approval of ${original.approvedDocuments!.join(', ')} from strategy ${original.strategy.versionId} and tone-of-voice ${original.tov.versionId}.`,
        documentVersionReference: original.strategy.versionId,
        strategyReviewResponse: { taskId: task.id, ...original },
      })
      return { requestId: result.item.submissionId, status: 'response_received', replayed: result.replayed }
    },
  }
}
