/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { decidePortalTaskAccess, resolvePortalTaskPrincipal } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { createBriefReviewService, briefResponseEventId } from '../service'
import { BRIEF_REVIEW_CONTEXT_KEY, BRIEF_REVIEW_WORKFLOW_ID, BRIEF_RESPONSE_CONTEXT_KEY } from '../contracts'
import { briefReviewStatus, renderBriefReview } from '../review'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/portal-task-access', () => ({ resolvePortalTaskPrincipal: jest.fn(), decidePortalTaskAccess: jest.fn() }))
jest.mock('../review', () => ({ ...jest.requireActual('../review'), renderBriefReview: jest.fn() }))

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const tenantId = uuid(1), organizationId = uuid(2), caseId = uuid(3), customerEntityId = uuid(4), customerUserId = uuid(5), workflowId = uuid(6), taskId = uuid(7), versionId = uuid(8), documentId = uuid(9), submissionId = uuid(10)
const scope = { tenantId, organizationId }
const auth = { sub: customerUserId, tenantId, orgId: organizationId, customerEntityId, resolvedFeatures: [] } as unknown as CustomerAuthContext
const review = { caseId, documentId, versionId, version: '1.0', templateId: 'WZR-BRIEF' as const, title: 'Brief', html: '<p>Original brief</p>', status: 'ready_for_review' as const, isCurrent: true, mode: 'content' as const }
const projection = { orderRef: caseId, documentId, versionId, version: '1.0', templateId: 'WZR-BRIEF' as const, isCurrent: true, documentStatus: 'draft', versionStatus: 'draft', clientViewMd: 'Original brief', questions: [], qa: { state: 'assessed' as const, taskRunId: 'qa-run', status: 'done' as const, verdict: 'ready_for_approval' as const } }
const request = { channel: 'portal' as const, kind: 'approval' as const, documentId, versionId, externalEventId: 'event-one' }
let instance: WorkflowInstance | null
let task: UserTask
let submission: AgencyClientSubmission | null
const getBriefReview = jest.fn()
const getBriefAcceptance = jest.fn()
const submit = jest.fn()
const completeUserTask = jest.fn()
const executeWorkflow = jest.fn()
const startWorkflow = jest.fn()
const allowed = jest.fn()
const findById = jest.fn()
const authoring = { findOwnedDefinition: jest.fn(), upsertOwnedDefinition: jest.fn() }
const em: { transactional: jest.Mock } = { transactional: jest.fn(async (fn: (manager: unknown) => Promise<unknown>) => fn(em)) }
const services: Record<string, unknown> = {
  em, agencyResearchService: { getBriefReview, getBriefAcceptance }, customerUserService: { findById }, customerRbacService: { loadAcl: async () => ({ isPortalAdmin: false }) },
  agencyClientSubmissionService: { submit }, taskHandler: { completeUserTask }, workflowExecutor: { executeWorkflow, startWorkflow }, rbacService: { userHasAllFeatures: allowed }, workflowDefinitionAuthoring: authoring,
}
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  instance = Object.assign(new WorkflowInstance(), { id: workflowId, workflowId: BRIEF_REVIEW_WORKFLOW_ID, ...scope, status: 'PAUSED', currentStepId: 'client_review', context: { [BRIEF_REVIEW_CONTEXT_KEY]: { caseId, customerEntityId, customerUserId, review } } })
  task = Object.assign(new UserTask(), { id: taskId, workflowInstanceId: workflowId, assignedTo: customerUserId, assigneeKind: 'customer', status: 'PENDING', ...scope })
  submission = null
  getBriefReview.mockResolvedValue(projection)
  getBriefAcceptance.mockResolvedValue(null)
  findById.mockResolvedValue({ customerEntityId, isActive: true })
  allowed.mockResolvedValue(true)
  jest.mocked(renderBriefReview).mockResolvedValue(review)
  jest.mocked(resolvePortalTaskPrincipal).mockResolvedValue({ ok: true, principal: {} } as never)
  jest.mocked(decidePortalTaskAccess).mockImplementation(() => ({ visible: true, actable: task.status === 'PENDING' } as never))
  jest.mocked(findOneWithDecryption).mockImplementation(async (_manager, entity, rawWhere) => {
    const where = rawWhere as Record<string, unknown>
    if (where.tenantId !== tenantId || where.organizationId !== organizationId) return null
    if (entity === AgencyCase) return where.id === caseId ? { id: caseId, customerEntityId, submittedByCustomerUserId: customerUserId } as never : null
    if (entity === WorkflowInstance) return instance && (!where.id || where.id === workflowId) && (!where.correlationKey || where.correlationKey === `agency-brief:${caseId}:${versionId}`) ? instance as never : null
    if (entity === UserTask) return (!where.id || where.id === taskId) && (!where.assignedTo || where.assignedTo === task.assignedTo) && (!where.status || where.status === task.status) ? task as never : null
    if (entity === AgencyClientSubmission) return submission as never
    return null
  })
  authoring.findOwnedDefinition.mockResolvedValue({ enabled: true, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'brief_review' } } })
  completeUserTask.mockImplementation(async (_em, _container, options) => {
    task.status = 'COMPLETED'; task.completedBy = options.userId; task.formData = options.formData
    await createBriefReviewService(container).receiveResponse({ response: options.formData[BRIEF_RESPONSE_CONTEXT_KEY] }, { workflowInstance: instance })
  })
  submit.mockImplementation(async (_identity, _caseId, original) => {
    submission = Object.assign(new AgencyClientSubmission(), { id: submissionId, submittedByCustomerUserId: customerUserId, original })
    return { item: { submissionId }, replayed: false }
  })
})

test('reads immutable invited content while fresh QA/currentness controls actionability', async () => {
  getBriefReview.mockResolvedValue({ ...projection, isCurrent: false, clientViewMd: 'Changed content' })
  const result = await createBriefReviewService(container).read(auth, taskId)
  expect(result).toMatchObject({ canRespond: false, review: { html: review.html, isCurrent: false, status: 'blocked' } })
  expect(getBriefReview).toHaveBeenCalledWith(scope, caseId, versionId)
  expect(decidePortalTaskAccess).toHaveBeenCalled()
})

test('exposes only saved acceptance time for the exact approved version, including history', async () => {
  const acceptedAt = '2026-09-19T10:00:00.000Z'
  getBriefReview.mockResolvedValue({ ...projection, versionStatus: 'approved', isCurrent: false })
  getBriefAcceptance.mockResolvedValue({ status: 'accepted', orderRef: caseId, documentId, versionId, version: '1.0', acceptedAt, customerUserId, source: { agentRunId: uuid(90) } })
  const result = await createBriefReviewService(container).read(auth, taskId)
  expect(result).toEqual({ ok: true, canRespond: false, review: { ...review, isCurrent: false, status: 'approved', acceptanceReceipt: { acceptedAt } } })
  expect(getBriefAcceptance).toHaveBeenCalledWith(scope, caseId, versionId)
  expect(JSON.stringify(result)).not.toContain(uuid(90))
  expect(JSON.stringify(result)).not.toContain(customerUserId)
})

test('approved status alone or a receipt from another version cannot imply acceptance', async () => {
  getBriefReview.mockResolvedValue({ ...projection, versionStatus: 'approved' })
  expect((await createBriefReviewService(container).read(auth, taskId)).review).toMatchObject({ status: 'blocked' })
  getBriefAcceptance.mockResolvedValue({ orderRef: caseId, documentId, versionId: uuid(91), version: '2.0', acceptedAt: '2026-09-19T10:00:00.000Z' })
  const result = await createBriefReviewService(container).read(auth, taskId)
  expect(result.review).toMatchObject({ status: 'blocked' })
  expect(result.review).not.toHaveProperty('acceptanceReceipt')
})

test('invitation snapshot cannot supply an acceptance receipt', async () => {
  const invitation = instance!.context[BRIEF_REVIEW_CONTEXT_KEY] as { review: Record<string, unknown> }
  invitation.review = { ...review, acceptanceReceipt: { acceptedAt: '2026-09-19T10:00:00.000Z' } }
  const result = await createBriefReviewService(container).read(auth, taskId)
  expect(result.review).not.toHaveProperty('acceptanceReceipt')
  expect(result.review.status).toBe('ready_for_review')
})

test('native task ownership refusal hides the review and prevents shared intake', async () => {
  jest.mocked(decidePortalTaskAccess).mockReturnValue({ visible: false, actable: false } as never)
  await expect(createBriefReviewService(container).respond(auth, caseId, request)).rejects.toMatchObject({ status: 404 })
  expect(completeUserTask).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled()
})

test('one native response persists exact original and actor through shared G intake; replay does not classify twice', async () => {
  const service = createBriefReviewService(container)
  await expect(service.respond(auth, caseId, request)).resolves.toEqual({ requestId: submissionId, status: 'response_received', replayed: false })
  await expect(service.respond(auth, caseId, { ...request, kind: 'message', body: 'Changed replay payload' })).resolves.toEqual({ requestId: submissionId, status: 'response_received', replayed: true })
  expect(completeUserTask).toHaveBeenCalledTimes(1)
  expect(submit).toHaveBeenCalledTimes(1)
  expect(submit).toHaveBeenCalledWith({ ...scope, customerEntityId, customerUserId }, caseId, expect.objectContaining({
    eventId: briefResponseEventId(taskId, request.externalEventId), documentVersionReference: versionId, reviewResponse: { ...request, taskId },
  }))
})

test('client-data-needed permits comments but never an approval request', async () => {
  getBriefReview.mockResolvedValue({ ...projection, qa: { ...projection.qa, status: 'done', verdict: 'needs_client_data' } })
  await expect(createBriefReviewService(container).respond(auth, caseId, request)).rejects.toMatchObject({ status: 409 })
  expect(completeUserTask).not.toHaveBeenCalled()
  await expect(createBriefReviewService(container).respond(auth, caseId, { ...request, kind: 'message', body: 'Audience is agencies' })).resolves.toMatchObject({ status: 'response_received' })
})

test('stale and uninvited versions never complete the native task', async () => {
  getBriefReview.mockResolvedValue({ ...projection, isCurrent: false })
  await expect(createBriefReviewService(container).respond(auth, caseId, request)).rejects.toMatchObject({ status: 409 })
  await expect(createBriefReviewService(container).respond(auth, caseId, { ...request, versionId: uuid(20) })).rejects.toMatchObject({ status: 404 })
  expect(completeUserTask).not.toHaveBeenCalled()
})

test('native continuation rechecks persisted actor before invoking G even if generic task completion was used', async () => {
  task.status = 'COMPLETED'; task.completedBy = uuid(30); task.formData = { [BRIEF_RESPONSE_CONTEXT_KEY]: request }
  await expect(createBriefReviewService(container).receiveResponse({ response: request }, { workflowInstance: instance })).rejects.toMatchObject({ status: 404 })
  expect(submit).not.toHaveBeenCalled()
})

test('a completed native task without a G receipt requires recovery, not a false received acknowledgement', async () => {
  task.status = 'COMPLETED'; task.completedBy = customerUserId; task.formData = { [BRIEF_RESPONSE_CONTEXT_KEY]: request }
  await expect(createBriefReviewService(container).respond(auth, caseId, request)).rejects.toMatchObject({ status: 409 })
  expect(submit).not.toHaveBeenCalled()
})

test('readiness comes from current exact QA, not draft or generated status alone', () => {
  expect(briefReviewStatus(projection)).toBe('ready_for_review')
  expect(briefReviewStatus({ ...projection, qa: { state: 'missing' } })).toBeNull()
  expect(briefReviewStatus({ ...projection, qa: { ...projection.qa, verdict: 'needs_agent_fix' } })).toBeNull()
})

test('invitation reuses one configured native definition and the actual case contact', async () => {
  instance = null
  startWorkflow.mockImplementation(async (_manager, options) => {
    instance = Object.assign(new WorkflowInstance(), { id: workflowId, ...options, context: options.initialContext })
    return instance
  })
  const service = createBriefReviewService(container)
  const input = { ...scope, caseId, versionId, userId: uuid(40) }
  await expect(service.invite(input)).resolves.toEqual({ workflowInstanceId: workflowId, taskId, replayed: false })
  await expect(service.invite(input)).resolves.toMatchObject({ taskId, replayed: true })
  expect(startWorkflow).toHaveBeenCalledTimes(1)
  expect(executeWorkflow).toHaveBeenCalledTimes(1)
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({
    ...scope, workflowId: BRIEF_REVIEW_WORKFLOW_ID, correlationKey: `agency-brief:${caseId}:${versionId}`,
    initialContext: { [BRIEF_REVIEW_CONTEXT_KEY]: { caseId, customerEntityId, customerUserId, review } },
  }))
  expect(authoring.upsertOwnedDefinition).not.toHaveBeenCalled()
})

test('invitation cannot be created by an unprivileged caller', async () => {
  allowed.mockResolvedValue(false)
  await expect(createBriefReviewService(container).invite({ ...scope, caseId, versionId, userId: uuid(40) })).rejects.toMatchObject({ status: 403 })
  expect(startWorkflow).not.toHaveBeenCalled()
})
