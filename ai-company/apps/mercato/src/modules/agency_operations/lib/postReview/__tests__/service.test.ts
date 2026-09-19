import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { decidePortalTaskAccess, resolvePortalTaskPrincipal } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { createPostReviewService, postReviewEventId } from '../service'
import { POST_REVIEW_CONTEXT_KEY as INVITATION, POST_RESPONSE_CONTEXT_KEY as RESPONSE, POST_REVIEW_WORKFLOW_ID as WORKFLOW, postReviewRequestSchema } from '../contracts'
import { renderPostReview } from '../review'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/portal-task-access', () => ({ resolvePortalTaskPrincipal: jest.fn(), decidePortalTaskAccess: jest.fn() }))
jest.mock('../review', () => ({ ...jest.requireActual('../review'), renderPostReview: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenantId, organizationId, caseId, customerEntityId, customerUserId, taskId, workflowId, documentId, postVersionId, submissionId] = Array.from({ length: 10 }, (_, i) => uuid(i + 1))
const scope = { tenantId, organizationId }
const auth = { sub: customerUserId, tenantId, orgId: organizationId, customerEntityId } as never
const producer = { status: 'ready', orderRef: caseId, post: { documentId, versionId: postVersionId, version: '1.0', isCurrent: true, clientViewMd: 'Original' }, receipt: null }
const review = { caseId, post: { caseId, documentId, versionId: postVersionId, version: '1.0', title: 'Post', html: '<p>Original</p>', templateId: 'WZR-POST', status: 'ready_for_review', isCurrent: true, mode: 'content' } }
const request = postReviewRequestSchema.parse({ channel: 'portal', kind: 'approval', post: { documentId, versionId: postVersionId }, approveContent: true, externalEventId: 'post-event' })
let instance: WorkflowInstance | null
let task: UserTask
let submission: AgencyClientSubmission | null
const getPostAcceptance = jest.fn(), submit = jest.fn(), completeUserTask = jest.fn(), startWorkflow = jest.fn(), executeWorkflow = jest.fn()
const em = { transactional: async (fn: (manager: unknown) => unknown) => fn(em) }
const services: Record<string, unknown> = {
  em, agencyResearchService: { getPostAcceptance }, agencyClientSubmissionService: { submit },
  customerUserService: { findById: async () => ({ customerEntityId, isActive: true }) }, customerRbacService: { loadAcl: async () => ({ isPortalAdmin: false }) },
  taskHandler: { completeUserTask }, rbacService: { userHasAllFeatures: async () => true }, workflowExecutor: { startWorkflow, executeWorkflow },
  workflowDefinitionAuthoring: { findOwnedDefinition: async () => ({ enabled: true, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'post_review' } } }) },
}
const container = { resolve: (key: string) => services[key] } as unknown as AppContainer
beforeEach(() => {
  jest.clearAllMocks()
  instance = Object.assign(new WorkflowInstance(), { id: workflowId, workflowId: WORKFLOW, ...scope, status: 'PAUSED', currentStepId: 'client_review', correlationKey: `agency-post:${caseId}:${postVersionId}`, context: { [INVITATION]: { caseId, customerEntityId, customerUserId, review } } })
  task = Object.assign(new UserTask(), { id: taskId, workflowInstanceId: workflowId, assignedTo: customerUserId, assigneeKind: 'customer', status: 'PENDING', ...scope })
  submission = null
  getPostAcceptance.mockResolvedValue(producer)
  jest.mocked(renderPostReview).mockImplementation(async () => structuredClone(review) as never)
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
    await createPostReviewService(container).receiveResponse({ response: options.formData[RESPONSE] }, { workflowInstance: instance })
  })
  submit.mockImplementation(async (_identity, _caseId, original) => {
    submission = Object.assign(new AgencyClientSubmission(), { id: submissionId, submittedByCustomerUserId: customerUserId, original })
    return { item: { submissionId }, replayed: false }
  })
})

test('content-only approval enters G once; replay cannot approve a different version', async () => {
  const service = createPostReviewService(container)
  await expect(service.respond(auth, taskId, request)).resolves.toEqual({ requestId: submissionId, status: 'response_received', replayed: false })
  await expect(service.respond(auth, taskId, request)).resolves.toMatchObject({ replayed: true })
  expect(submit).toHaveBeenCalledTimes(1)
  expect(completeUserTask).toHaveBeenCalledTimes(1)
  expect(submit).toHaveBeenCalledWith({ ...scope, customerEntityId, customerUserId }, caseId, expect.objectContaining({
    eventId: postReviewEventId(taskId, request.externalEventId), documentVersionReference: postVersionId,
    postReviewResponse: { taskId, ...request },
  }))
  await expect(service.respond(auth, taskId, { ...request, post: { ...request.post, versionId: uuid(99) } })).rejects.toMatchObject({ status: 404 })
})

test('conditional approval remains an original message and cannot be submitted as approval with body or publication fields', async () => {
  const body = '  I approve, but change the ending.\\nPlease hold this work.  '
  expect(postReviewRequestSchema.safeParse({ ...request, body }).success).toBe(false)
  expect(postReviewRequestSchema.safeParse({ ...request, publicationConsent: true }).success).toBe(false)
  const message = postReviewRequestSchema.parse({ channel: 'portal', kind: 'message', post: request.post, body, externalEventId: 'message-event' })
  await createPostReviewService(container).respond(auth, taskId, message)
  expect(submit).toHaveBeenCalledWith(expect.anything(), caseId, expect.objectContaining({ text: body, postReviewResponse: { taskId, ...message } }))
  expect(message).not.toHaveProperty('approveContent')
})

test('producer refusal keeps the invited text immutable and blocks response; native access remains required', async () => {
  getPostAcceptance.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'post_qa_not_ready' })
  const service = createPostReviewService(container)
  await expect(service.read(auth, taskId)).resolves.toMatchObject({ canRespond: false, review: { post: { html: '<p>Original</p>', status: 'blocked' } } })
  await expect(service.respond(auth, taskId, request)).rejects.toMatchObject({ status: 409 })
  jest.mocked(decidePortalTaskAccess).mockReturnValue({ visible: false, actable: false } as never)
  await expect(service.read(auth, taskId)).rejects.toMatchObject({ status: 404 })
  expect(completeUserTask).not.toHaveBeenCalled()
})

test('completed review exposes the saved content receipt and invitation replay never reopens it', async () => {
  task.status = 'COMPLETED'
  const acceptedAt = '2026-09-19T12:30:00.000Z'
  getPostAcceptance.mockResolvedValue({ ...producer, receipt: { at: acceptedAt } })
  const service = createPostReviewService(container)
  const result = await service.read(auth, taskId)
  expect(result).toMatchObject({ canRespond: false, review: { post: { status: 'approved', mode: 'content', acceptanceReceipt: { acceptedAt } } } })
  expect(result.review.post).not.toHaveProperty('target')
  expect(result.review.post).not.toHaveProperty('contentApproved')
  await expect(service.invite({ ...scope, userId: uuid(99), caseId, postVersionId })).resolves.toEqual({ taskId, workflowInstanceId: workflowId, replayed: true })
  expect(startWorkflow).not.toHaveBeenCalled()
})

