import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { decidePortalTaskAccess, resolvePortalTaskPrincipal } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { createStrategyPairReviewService, strategyPairEventId } from '../service'
import { STRATEGY_PAIR_REVIEW_CONTEXT_KEY as INVITATION, STRATEGY_PAIR_RESPONSE_CONTEXT_KEY as RESPONSE, STRATEGY_PAIR_REVIEW_WORKFLOW_ID as WORKFLOW, strategyPairRequestSchema } from '../contracts'
import { pairReviewEligible, renderStrategyPair } from '../review'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/portal-task-access', () => ({ resolvePortalTaskPrincipal: jest.fn(), decidePortalTaskAccess: jest.fn() }))
jest.mock('../review', () => ({ ...jest.requireActual('../review'), renderStrategyPair: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenantId, organizationId, caseId, customerEntityId, customerUserId, taskId, workflowId, strategyId, tovId, strategyVersionId, tovVersionId, briefId, briefVersionId, submissionId] = Array.from({ length: 14 }, (_, i) => uuid(i + 1))
const scope = { tenantId, organizationId }
const auth = { sub: customerUserId, tenantId, orgId: organizationId, customerEntityId } as never
const version = { version: '1.0', isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'ready_for_review', simulationFlag: false, clientViewMd: 'Original' }
const pair = { orderRef: caseId, strategy: { ...version, documentId: strategyId, versionId: strategyVersionId, templateId: 'WZR-STRATEGIA' as const },
  tov: { ...version, documentId: tovId, versionId: tovVersionId, templateId: 'WZR-TOV' as const }, tovUsesStrategy: true,
  qa: { state: 'assessed' as const, taskRunId: 'qa', status: 'done' as const, verdict: 'ready_for_approval' as const },
  brief: { ...version, documentId: briefId, versionId: briefVersionId, documentStatus: 'approved', versionStatus: 'approved' } }
const acceptance = { status: 'partial', orderRef: caseId, pair: { strategy: pair.strategy, tov: pair.tov }, brief: pair.brief,
  qaTaskRunId: pair.qa.taskRunId, acceptances: { strategy: null, tov: null }, remainingDocuments: ['strategy', 'tov'] }
const document = { caseId, version: '1.0', title: 'Document', html: '<p>Original</p>', status: 'ready_for_review', isCurrent: true, mode: 'content' }
const review = { caseId, strategy: { ...document, documentId: strategyId, versionId: strategyVersionId, templateId: 'WZR-STRATEGIA' }, tov: { ...document, documentId: tovId, versionId: tovVersionId, templateId: 'WZR-TOV' } }
const request = strategyPairRequestSchema.parse({ channel: 'portal', kind: 'approval', strategy: { documentId: strategyId, versionId: strategyVersionId }, tov: { documentId: tovId, versionId: tovVersionId }, approvedDocuments: ['strategy'], externalEventId: 'pair-event' })
let instance: WorkflowInstance | null
let task: UserTask
let submission: AgencyClientSubmission | null
const getStrategyReview = jest.fn(), getStrategyPairAcceptance = jest.fn(), submit = jest.fn(), completeUserTask = jest.fn(), startWorkflow = jest.fn(), executeWorkflow = jest.fn()
const em = { transactional: async (fn: (manager: unknown) => unknown) => fn(em) }
const services: Record<string, unknown> = {
  em, agencyResearchService: { getStrategyReview, getStrategyPairAcceptance }, agencyClientSubmissionService: { submit },
  customerUserService: { findById: async () => ({ customerEntityId, isActive: true }) }, customerRbacService: { loadAcl: async () => ({ isPortalAdmin: false }) },
  taskHandler: { completeUserTask }, rbacService: { userHasAllFeatures: async () => true }, workflowExecutor: { startWorkflow, executeWorkflow },
  workflowDefinitionAuthoring: { findOwnedDefinition: async () => ({ enabled: true, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'strategy_pair_review' } } }) },
}
const container = { resolve: (key: string) => services[key] } as unknown as AppContainer
beforeEach(() => {
  jest.clearAllMocks()
  instance = Object.assign(new WorkflowInstance(), { id: workflowId, workflowId: WORKFLOW, ...scope, status: 'PAUSED', currentStepId: 'client_review', correlationKey: `agency-strategy-pair:${caseId}:${strategyVersionId}:${tovVersionId}`, context: { [INVITATION]: { caseId, customerEntityId, customerUserId, review } } })
  task = Object.assign(new UserTask(), { id: taskId, workflowInstanceId: workflowId, assignedTo: customerUserId, assigneeKind: 'customer', status: 'PENDING', ...scope })
  submission = null
  getStrategyReview.mockResolvedValue(pair); getStrategyPairAcceptance.mockResolvedValue(acceptance)
  jest.mocked(renderStrategyPair).mockImplementation(async () => structuredClone(review) as never)
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
    await createStrategyPairReviewService(container).receiveResponse({ response: options.formData[RESPONSE] }, { workflowInstance: instance })
  })
  submit.mockImplementation(async (_identity, _caseId, original) => {
    submission = Object.assign(new AgencyClientSubmission(), { id: submissionId, submittedByCustomerUserId: customerUserId, original })
    return { item: { submissionId }, replayed: false }
  })
})

test('partial selection preserves both exact document references in one original G submission, without acceptance', async () => {
  const service = createStrategyPairReviewService(container)
  await expect(service.respond(auth, taskId, request)).resolves.toEqual({ requestId: submissionId, status: 'response_received', replayed: false })
  await expect(service.respond(auth, taskId, request)).resolves.toMatchObject({ replayed: true })
  expect(submit).toHaveBeenCalledTimes(1); expect(completeUserTask).toHaveBeenCalledTimes(1)
  expect(submit).toHaveBeenCalledWith({ ...scope, customerEntityId, customerUserId }, caseId, expect.objectContaining({
    eventId: strategyPairEventId(taskId, request.externalEventId), documentVersionReference: strategyVersionId,
    strategyReviewResponse: { taskId, ...request },
  }))
})

test('native visibility refusal blocks read and mutation', async () => {
  jest.mocked(decidePortalTaskAccess).mockReturnValue({ visible: false, actable: false } as never)
  await expect(createStrategyPairReviewService(container).read(auth, taskId)).rejects.toMatchObject({ status: 404 })
  await expect(createStrategyPairReviewService(container).respond(auth, taskId, request)).rejects.toMatchObject({ status: 404 })
  expect(submit).not.toHaveBeenCalled()
})

test('stale pair remains visible as immutable snapshot but cannot receive approval', async () => {
  getStrategyReview.mockResolvedValue({ ...pair, tov: { ...pair.tov, isCurrent: false, clientViewMd: 'Changed' } })
  const service = createStrategyPairReviewService(container)
  await expect(service.read(auth, taskId)).resolves.toMatchObject({ canRespond: false, review: { tov: { html: '<p>Original</p>', isCurrent: false, status: 'blocked' } } })
  await expect(service.respond(auth, taskId, request)).rejects.toMatchObject({ status: 409 })
  expect(completeUserTask).not.toHaveBeenCalled()
})

test('mismatched second reference cannot be dropped in favor of legacy strategy reference', async () => {
  await expect(createStrategyPairReviewService(container).respond(auth, taskId, { ...request, tov: { ...request.tov, versionId: uuid(99) } })).rejects.toMatchObject({ status: 404 })
  expect(completeUserTask).not.toHaveBeenCalled()
})

test('reusing a received event id cannot change its selected approvals', async () => {
  const service = createStrategyPairReviewService(container)
  await service.respond(auth, taskId, request)
  await expect(service.respond(auth, taskId, { ...request, approvedDocuments: ['strategy', 'tov'] })).rejects.toMatchObject({ status: 409 })
  expect(submit).toHaveBeenCalledTimes(1)
})

test('invitation replay does not create a second native task', async () => {
  await expect(createStrategyPairReviewService(container).invite({ ...scope, userId: uuid(99), caseId, strategyVersionId, tovVersionId })).resolves.toEqual({ taskId, workflowInstanceId: workflowId, replayed: true })
  expect(startWorkflow).not.toHaveBeenCalled(); expect(executeWorkflow).not.toHaveBeenCalled()
})

test('creates one real native invitation with both rendered snapshots and customer binding', async () => {
  instance = null
  startWorkflow.mockImplementation(async (_em, options) => {
    instance = Object.assign(new WorkflowInstance(), { id: workflowId, workflowId: WORKFLOW, ...scope, correlationKey: options.correlationKey, context: options.initialContext })
    return instance
  })
  await expect(createStrategyPairReviewService(container).invite({ ...scope, userId: uuid(99), caseId, strategyVersionId, tovVersionId })).resolves.toMatchObject({ taskId, replayed: false })
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({
    workflowId: WORKFLOW, correlationKey: `agency-strategy-pair:${caseId}:${strategyVersionId}:${tovVersionId}`,
    initialContext: { [INVITATION]: { caseId, customerEntityId, customerUserId, review } },
  }))
  expect(executeWorkflow).toHaveBeenCalledTimes(1)
})

test('consumer uses producer cumulative readiness bound to the displayed pair', () => {
  expect(pairReviewEligible(pair, acceptance as never, caseId)).toBe(true)
  expect(pairReviewEligible(pair, null, caseId)).toBe(false)
  expect(pairReviewEligible(pair, { status: 'not_ready', orderRef: caseId, reason: 'pair_qa_not_ready' }, caseId)).toBe(false)
  expect(pairReviewEligible({ ...pair, tov: { ...pair.tov, versionId: uuid(99) } }, acceptance as never, caseId)).toBe(false)
})

test('partial acceptance creates a new lineage-bound task and reuses that task on another handoff', async () => {
  const acceptedAt = '2026-09-19T11:00:00.000Z'
  getStrategyPairAcceptance.mockResolvedValue({ ...acceptance, acceptances: { strategy: { at: acceptedAt, source: { submissionId } }, tov: null }, remainingDocuments: ['tov'] })
  task.status = 'COMPLETED'
  instance!.status = 'COMPLETED'
  startWorkflow.mockImplementation(async (_em, options) => {
    instance = Object.assign(new WorkflowInstance(), { id: uuid(50), workflowId: WORKFLOW, ...scope, status: 'PAUSED', currentStepId: 'client_review', correlationKey: options.correlationKey, context: options.initialContext })
    task = Object.assign(new UserTask(), { id: uuid(51), workflowInstanceId: instance.id, assignedTo: customerUserId, assigneeKind: 'customer', status: 'PENDING', ...scope })
    return instance
  })
  const service = createStrategyPairReviewService(container)
  const input = { ...scope, userId: uuid(99), caseId, strategyVersionId, tovVersionId }
  await expect(service.invite(input)).resolves.toEqual({ workflowInstanceId: uuid(50), taskId: uuid(51), replayed: false })
  await expect(service.invite(input)).resolves.toEqual({ workflowInstanceId: uuid(50), taskId: uuid(51), replayed: true })
  expect(startWorkflow).toHaveBeenCalledTimes(1)
  expect(startWorkflow.mock.calls[0][1].correlationKey).toMatch(new RegExp(`^agency-strategy-pair:${caseId}:${strategyVersionId}:${tovVersionId}:after:`))
  await expect(service.read(auth, uuid(51))).resolves.toMatchObject({ canRespond: true, review: { strategy: { status: 'approved', acceptanceReceipt: { acceptedAt } }, tov: { status: 'ready_for_review' } } })
  await expect(service.respond(auth, uuid(51), request)).rejects.toMatchObject({ status: 409 })
  await expect(service.respond(auth, uuid(51), { ...request, approvedDocuments: ['tov'], externalEventId: 'second-decision' })).resolves.toMatchObject({ status: 'response_received' })
  expect(submit.mock.calls[0][2].strategyReviewResponse.approvedDocuments).toEqual(['tov'])
})

test('complete cumulative acceptance cannot create an actionable invitation', async () => {
  getStrategyPairAcceptance.mockResolvedValue({ ...acceptance, status: 'accepted', remainingDocuments: [], acceptances: {
    strategy: { at: '2026-09-19T11:00:00.000Z', source: { submissionId } }, tov: { at: '2026-09-19T11:01:00.000Z', source: { submissionId: uuid(99) } },
  } })
  const service = createStrategyPairReviewService(container)
  await expect(service.read(auth, taskId)).resolves.toMatchObject({ canRespond: false, review: { strategy: { status: 'approved' }, tov: { status: 'approved' } } })
  await expect(service.invite({ ...scope, userId: uuid(99), caseId, strategyVersionId, tovVersionId })).rejects.toMatchObject({ status: 409 })
  expect(startWorkflow).not.toHaveBeenCalled()
})

test.each([
  { approvedDocuments: [] }, { approvedDocuments: ['strategy', 'strategy'] }, { body: 'also change this' },
  { kind: 'message', body: 'Comment', approvedDocuments: ['strategy'] },
])('rejects ambiguous pair response %j', (changes) => {
  expect(strategyPairRequestSchema.safeParse({ ...request, ...changes }).success).toBe(false)
})
