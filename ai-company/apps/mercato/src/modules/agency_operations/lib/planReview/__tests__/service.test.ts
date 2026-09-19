import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { decidePortalTaskAccess, resolvePortalTaskPrincipal } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { createPlanReviewService, planReviewEventId } from '../service'
import { PLAN_REVIEW_CONTEXT_KEY as INVITATION, PLAN_RESPONSE_CONTEXT_KEY as RESPONSE, PLAN_REVIEW_WORKFLOW_ID as WORKFLOW, planReviewRequestSchema } from '../contracts'
import { renderPlanReview } from '../review'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/portal-task-access', () => ({ resolvePortalTaskPrincipal: jest.fn(), decidePortalTaskAccess: jest.fn() }))
jest.mock('../review', () => ({ ...jest.requireActual('../review'), renderPlanReview: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenantId, organizationId, caseId, customerEntityId, customerUserId, taskId, workflowId, documentId, planVersionId, submissionId] = Array.from({ length: 10 }, (_, i) => uuid(i + 1))
const scope = { tenantId, organizationId }
const auth = { sub: customerUserId, tenantId, orgId: organizationId, customerEntityId } as never
const topics = [{ topicId: 'topic-a', title: 'Recommended', recommended: true }, { topicId: 'topic-b', title: 'Selected by client', recommended: false }]
const producer = { status: 'ready', orderRef: caseId, plan: { documentId, versionId: planVersionId, version: '1.0', isCurrent: true, clientViewMd: 'Original' }, topics, recommendedTopicId: 'topic-a', receipt: null }
const review = { caseId, plan: { caseId, documentId, versionId: planVersionId, version: '1.0', title: 'Plan', html: '<p>Original</p>', templateId: 'WZR-PLAN', status: 'ready_for_review', isCurrent: true, mode: 'content' }, topics, recommendedTopicId: 'topic-a' }
const request = planReviewRequestSchema.parse({ channel: 'portal', kind: 'approval', plan: { documentId, versionId: planVersionId }, approvePlan: true, selectedTopicId: 'topic-b', externalEventId: 'plan-event' })
let instance: WorkflowInstance | null
let task: UserTask
let submission: AgencyClientSubmission | null
const getPlanReview = jest.fn(), submit = jest.fn(), completeUserTask = jest.fn(), startWorkflow = jest.fn(), executeWorkflow = jest.fn()
const em = { transactional: async (fn: (manager: unknown) => unknown) => fn(em) }
const services: Record<string, unknown> = {
  em, agencyResearchService: { getPlanReview }, agencyClientSubmissionService: { submit },
  customerUserService: { findById: async () => ({ customerEntityId, isActive: true }) }, customerRbacService: { loadAcl: async () => ({ isPortalAdmin: false }) },
  taskHandler: { completeUserTask }, rbacService: { userHasAllFeatures: async () => true }, workflowExecutor: { startWorkflow, executeWorkflow },
  workflowDefinitionAuthoring: { findOwnedDefinition: async () => ({ enabled: true, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'plan_review' } } }) },
}
const container = { resolve: (key: string) => services[key] } as unknown as AppContainer
beforeEach(() => {
  jest.clearAllMocks()
  instance = Object.assign(new WorkflowInstance(), { id: workflowId, workflowId: WORKFLOW, ...scope, status: 'PAUSED', currentStepId: 'client_review', correlationKey: `agency-plan:${caseId}:${planVersionId}`, context: { [INVITATION]: { caseId, customerEntityId, customerUserId, review } } })
  task = Object.assign(new UserTask(), { id: taskId, workflowInstanceId: workflowId, assignedTo: customerUserId, assigneeKind: 'customer', status: 'PENDING', ...scope })
  submission = null
  getPlanReview.mockResolvedValue(producer)
  jest.mocked(renderPlanReview).mockImplementation(async () => structuredClone(review) as never)
  jest.mocked(resolvePortalTaskPrincipal).mockResolvedValue({ ok: true, principal: {} } as never)
  jest.mocked(decidePortalTaskAccess).mockImplementation(() => ({ visible: true, actable: task.status === 'PENDING' } as never))
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, rawWhere) => {
    const where = rawWhere as Record<string, unknown>
    if (where.tenantId !== tenantId || where.organizationId !== organizationId) return null
    if (entity === AgencyCase) return where.id === caseId ? { id: caseId, customerEntityId, submittedByCustomerUserId: customerUserId } as never : null
    if (entity === WorkflowInstance) return instance && (!where.id || where.id === instance.id) && (!where.correlationKey || where.correlationKey === instance.correlationKey) ? instance as never : null
    if (entity === UserTask) return (!where.id || where.id === task.id) && (!where.status || where.status === task.status) ? task as never : null
    if (entity === AgencyClientSubmission) return submission as never
    return null
  })
  completeUserTask.mockImplementation(async (_em, _container, options) => {
    task.status = 'COMPLETED'; task.completedBy = options.userId; task.formData = options.formData
    await createPlanReviewService(container).receiveResponse({ response: options.formData[RESPONSE] }, { workflowInstance: instance })
  })
  submit.mockImplementation(async (_identity, _caseId, original) => {
    submission = Object.assign(new AgencyClientSubmission(), { id: submissionId, submittedByCustomerUserId: customerUserId, original })
    return { item: { submissionId }, replayed: false }
  })
})

test('saves two explicit response elements in one G submission and replays without another completion', async () => {
  const service = createPlanReviewService(container)
  await expect(service.respond(auth, taskId, request)).resolves.toEqual({ requestId: submissionId, status: 'response_received', replayed: false })
  await expect(service.respond(auth, taskId, request)).resolves.toMatchObject({ replayed: true })
  expect(submit).toHaveBeenCalledTimes(1)
  expect(completeUserTask).toHaveBeenCalledTimes(1)
  expect(submit).toHaveBeenCalledWith({ ...scope, customerEntityId, customerUserId }, caseId, expect.objectContaining({
    eventId: planReviewEventId(taskId, request.externalEventId), documentVersionReference: planVersionId,
    planReviewResponse: { taskId, ...request },
  }))
  await expect(service.respond(auth, taskId, { ...request, selectedTopicId: 'topic-a' })).rejects.toMatchObject({ status: 409 })
})

test('native task visibility refusal and a foreign topic cannot mutate', async () => {
  const service = createPlanReviewService(container)
  await expect(service.respond(auth, taskId, { ...request, selectedTopicId: 'foreign' })).rejects.toMatchObject({ status: 409 })
  jest.mocked(decidePortalTaskAccess).mockReturnValue({ visible: false, actable: false } as never)
  await expect(service.read(auth, taskId)).rejects.toMatchObject({ status: 404 })
  expect(completeUserTask).not.toHaveBeenCalled()
})

test('stale or QA-blocked plan preserves the displayed snapshot but cannot receive approval', async () => {
  getPlanReview.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'plan_qa_not_ready' })
  const service = createPlanReviewService(container)
  await expect(service.read(auth, taskId)).resolves.toMatchObject({ canRespond: false, review: { plan: { html: '<p>Original</p>', status: 'blocked' } } })
  await expect(service.respond(auth, taskId, request)).rejects.toMatchObject({ status: 409 })
  expect(completeUserTask).not.toHaveBeenCalled()
})

test('completed review displays only authoritative saved acceptance and selected topic', async () => {
  task.status = 'COMPLETED'
  const acceptedAt = '2026-09-19T12:30:00.000Z'
  getPlanReview.mockResolvedValue({ ...producer, receipt: { at: acceptedAt, selectedTopicId: 'topic-b' } })
  await expect(createPlanReviewService(container).read(auth, taskId)).resolves.toMatchObject({
    canRespond: false, review: { selectedTopicId: 'topic-b', plan: { status: 'approved', acceptanceReceipt: { acceptedAt } } },
  })
  expect(startWorkflow).not.toHaveBeenCalled()
})

test('invitation replay reuses the native customer task and original messages remain unchanged', async () => {
  const service = createPlanReviewService(container)
  await expect(service.invite({ ...scope, userId: uuid(99), caseId, planVersionId })).resolves.toEqual({ taskId, workflowInstanceId: workflowId, replayed: true })
  expect(startWorkflow).not.toHaveBeenCalled()
  const body = '  Hold work.\\nPlease explain the recommendation.  '
  const message = planReviewRequestSchema.parse({ channel: 'portal', kind: 'message', plan: request.plan, externalEventId: 'message-event', body })
  await service.respond(auth, taskId, message)
  expect(submit).toHaveBeenCalledWith(expect.anything(), caseId, expect.objectContaining({ text: body, planReviewResponse: { taskId, ...message } }))
})

