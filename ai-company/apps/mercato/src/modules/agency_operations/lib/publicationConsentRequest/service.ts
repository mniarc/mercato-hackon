import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { TaskHandlerService } from '@open-mercato/core/modules/workflows/lib/task-handler'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { decidePortalTaskAccess, resolvePortalTaskPrincipal } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts/agencyResearch'
import { recordPublicationConsentInputSchema, samePublicationDestination, publicationDestinationKey } from '@/modules/agency_research/lib/publicationConsent/contracts'
import { AgencyCase } from '../../data/entities'
import { ensurePublicationConsentDefinition } from './configure'
import { PUBLICATION_CONSENT_WORKFLOW_ID as WORKFLOW, publicationConsentInviteSchema,
  publicationConsentSnapshotSchema, publicationConsentResponseSchema, publicationConsentResponseReceiptSchema,
  type PublicationConsentRequestService } from './contracts'

type Scope = { tenantId: string; organizationId: string }
type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow'>
type Contacts = { findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }
const INVITATION = 'publicationConsentInvitation', RESPONSE = 'publicationConsentResponse'
function missing(): never { throw new CrudHttpError(404, { error: 'api.errors.notFound' }) }
function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function createPublicationConsentRequestService(container: AppContainer): PublicationConsentRequestService {
  const em = container.resolve<EntityManager>('em')
  const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
  async function contact(userId: string, customerEntityId: string, scope: Scope) {
    const current = await container.resolve<Contacts>('customerUserService').findById(userId, scope.tenantId, scope.organizationId)
    if (!current || current.isActive === false || current.customerEntityId !== customerEntityId) missing()
  }
  async function load(taskId: string, scope: Scope) {
    const task = await findOneWithDecryption(em, UserTask, { ...scope, id: taskId }, undefined, scope)
    const instance = task && await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: task.workflowInstanceId, workflowId: WORKFLOW, deletedAt: null }, undefined, scope)
    if (!task || !instance) missing()
    const snapshot = publicationConsentSnapshotSchema.parse(instance.context[INVITATION])
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: snapshot.caseId, customerEntityId: snapshot.customerEntityId, deletedAt: null }, undefined, scope)
    if (!agencyCase || task.assigneeKind !== 'customer' || task.assignedTo !== snapshot.customerUserId) missing()
    await contact(snapshot.customerUserId, snapshot.customerEntityId, scope)
    return { task, instance, snapshot, scope }
  }
  async function accessible(auth: CustomerAuthContext, taskId: string) {
    if (!auth.customerEntityId) missing()
    const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
    await contact(auth.sub, auth.customerEntityId, scope)
    const loaded = await load(taskId, scope)
    const acl = await container.resolve<CustomerRbacService>('customerRbacService').loadAcl(auth.sub, scope)
    const principal = await resolvePortalTaskPrincipal({ auth, em, isPortalAdmin: acl.isPortalAdmin })
    if (!principal.ok) missing()
    const access = decidePortalTaskAccess(principal.principal, loaded.task)
    if (!access.visible) missing()
    return { ...loaded, access }
  }
  async function current(loaded: Awaited<ReturnType<typeof load>>) {
    const { snapshot, scope } = loaded
    const input = { orderRef: snapshot.caseId, postVersionId: snapshot.postVersionId }
    const accepted = await research.getPostAcceptance(scope, input)
    const consent = await research.getPublicationConsent(scope, input)
    const hash = z.object({ contentHash: z.string() }).safeParse(consent)
    const eligible = accepted.status === 'ready' && accepted.post.isCurrent && accepted.receipt !== null
      && accepted.post.documentStatus === 'approved' && accepted.post.versionStatus === 'approved'
      && accepted.post.documentId === snapshot.documentId && accepted.receipt.person === snapshot.customerUserId
      && accepted.receipt.at === snapshot.acceptedAt && consent.target
      && samePublicationDestination(consent.target, snapshot.target) && hash.success && hash.data.contentHash === snapshot.contentHash
    return { accepted, consent, eligible: Boolean(eligible) }
  }
  function matches(input: z.infer<typeof publicationConsentResponseSchema>, loaded: Awaited<ReturnType<typeof load>>) {
    return input.postVersionId === loaded.snapshot.postVersionId && input.configVersionId === loaded.snapshot.target.configVersionId
  }
  async function receive(loaded: Awaited<ReturnType<typeof load>>, rawInput: unknown) {
    const input = publicationConsentResponseSchema.parse(object(rawInput).response)
    const original = publicationConsentResponseSchema.parse(object(loaded.task.formData)[RESPONSE])
    if (loaded.task.status !== 'COMPLETED' || loaded.task.completedBy !== loaded.snapshot.customerUserId || !loaded.task.completedAt
      || !matches(original, loaded) || !isDeepStrictEqual(input, original)) conflict()
    const userId = await resolveWorkflowPrincipalUserId(em, loaded.instance)
    if (!userId) throw new Error('[internal] Publication consent requires the native workflow execution principal')
    const context = { ...loaded.scope, userId }
    const result = await research.recordPublicationConsent(recordPublicationConsentInputSchema.parse({ context, request: {
      orderRef: loaded.snapshot.caseId, documentId: loaded.snapshot.documentId, versionId: loaded.snapshot.postVersionId,
      customerUserId: loaded.snapshot.customerUserId, destination: loaded.snapshot.target, consent: true,
      decidedAt: loaded.task.completedAt.toISOString(), expectedContentHash: loaded.snapshot.contentHash,
      source: { kind: 'native_publication_consent_task', workflowInstanceId: loaded.instance.id,
        invitationTaskId: loaded.task.id, eventId: original.externalEventId },
    } }))
    if (result.status !== 'recorded') conflict()
    const accepted = await research.getPostAcceptance(loaded.scope, { orderRef: loaded.snapshot.caseId, postVersionId: loaded.snapshot.postVersionId })
    if (accepted.status !== 'ready' || !accepted.receipt) conflict()
    const preparation = await research.preparePublication({ context, request: { orderRef: loaded.snapshot.caseId,
      postVersionId: loaded.snapshot.postVersionId, acceptanceSubmissionId: accepted.receipt.source.submissionId } })
    return publicationConsentResponseReceiptSchema.parse({ taskId: loaded.task.id, status: 'consent_recorded',
      consentedAt: result.record.at, replayed: result.replayed, preparation, canSend: false })
  }
  return {
    async invite(rawInput) {
      const input = publicationConsentInviteSchema.parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId,
        ['agency_operations.cases.view', 'customers.companies.view', 'agency_research.manage'], scope)) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
      const executor = container.resolve<Executor>('workflowExecutor')
      const started = await em.transactional(async (tx) => {
        const agencyCase = await findOneWithDecryption(tx, AgencyCase, { ...scope, id: input.caseId, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
        if (!agencyCase) missing()
        await contact(agencyCase.submittedByCustomerUserId, agencyCase.customerEntityId, scope)
        const lookup = { orderRef: agencyCase.id, postVersionId: input.postVersionId }
        const accepted = await research.getPostAcceptance(scope, lookup)
        const consent = await research.getPublicationConsent(scope, lookup)
        const hash = z.object({ contentHash: z.string().min(1) }).safeParse(consent)
        if (accepted.status !== 'ready' || !accepted.receipt || !accepted.post.isCurrent || !accepted.post.clientViewMd
          || accepted.post.documentStatus !== 'approved' || accepted.post.versionStatus !== 'approved'
          || accepted.receipt.person !== agencyCase.submittedByCustomerUserId || !consent.target || !hash.success) conflict()
        const destinationKey = createHash('sha256').update(publicationDestinationKey(consent.target)).digest('hex')
        const correlationKey = `agency-publication-consent:${agencyCase.id}:${input.postVersionId}:${destinationKey}`
        const previous = await findOneWithDecryption(tx, WorkflowInstance, { ...scope, workflowId: WORKFLOW, correlationKey, deletedAt: null }, undefined, scope)
        if (previous) return { workflowInstanceId: previous.id, replayed: true }
        if (consent.state === 'valid') conflict()
        await ensurePublicationConsentDefinition(container, tx, input)
        const snapshot = publicationConsentSnapshotSchema.parse({ caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId,
          customerUserId: agencyCase.submittedByCustomerUserId, documentId: accepted.post.documentId, postVersionId: input.postVersionId,
          version: accepted.post.version, contentHash: hash.data.contentHash, clientViewMd: accepted.post.clientViewMd,
          acceptedAt: accepted.receipt.at, target: consent.target })
        const instance = await executor.startWorkflow(tx, { ...scope, workflowId: WORKFLOW, correlationKey,
          metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id, initiatedBy: input.userId },
          initialContext: { [INVITATION]: snapshot } })
        return { workflowInstanceId: instance.id, replayed: false }
      })
      if (!started.replayed) await executor.executeWorkflow(em, container, started.workflowInstanceId, { userId: input.userId })
      const task = await findOneWithDecryption(em, UserTask, { ...scope, workflowInstanceId: started.workflowInstanceId, assigneeKind: 'customer' }, undefined, scope)
      if (!task) conflict()
      return { ...started, taskId: task.id, canSend: false }
    },
    async read(auth, taskId) {
      z.uuid().parse(taskId)
      const loaded = await accessible(auth, taskId)
      const state = await current(loaded)
      const { customerUserId: _user, customerEntityId: _entity, ...request } = loaded.snapshot
      return { ok: true, request, canSend: false,
        canRespond: loaded.access.actable && loaded.task.assignedTo === auth.sub && loaded.instance.status === 'PAUSED'
          && loaded.instance.currentStepId === 'client_consent' && state.eligible && state.consent.state !== 'valid',
        consentedAt: state.eligible && state.consent.state === 'valid' ? state.consent.record?.at ?? null : null }
    },
    async respond(auth, taskId, rawInput) {
      const input = publicationConsentResponseSchema.parse(rawInput)
      const loaded = await accessible(auth, z.uuid().parse(taskId))
      if (loaded.task.assignedTo !== auth.sub || !matches(input, loaded)) missing()
      if (loaded.task.status === 'COMPLETED') return receive(loaded, { response: input })
      const state = await current(loaded)
      if (!loaded.access.actable || loaded.instance.status !== 'PAUSED' || loaded.instance.currentStepId !== 'client_consent' || !state.eligible) conflict()
      await container.resolve<TaskHandlerService>('taskHandler').completeUserTask(em, container, {
        taskId, userId: auth.sub, scope: loaded.scope, formData: { [RESPONSE]: input },
      })
      const receipt = publicationConsentResponseReceiptSchema.safeParse(object(loaded.instance.context.publicationConsentReceipt).result)
      if (!receipt.success) conflict()
      return receipt.data
    },
    async receiveResponse(rawInput, rawContext) {
      const { workflowInstance } = z.object({ workflowInstance: z.object({ id: z.uuid(), workflowId: z.literal(WORKFLOW), tenantId: z.uuid(), organizationId: z.uuid() }) }).parse(rawContext)
      const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
      const task = await findOneWithDecryption(em, UserTask, { ...scope, workflowInstanceId: workflowInstance.id, assigneeKind: 'customer', status: 'COMPLETED' }, undefined, scope)
      if (!task) missing()
      return receive(await load(task.id, scope), rawInput)
    },
  }
}
