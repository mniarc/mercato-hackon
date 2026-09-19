/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { StepInstance, UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { gateTaskAction, decideTaskAccess, resolveTaskVisibilityForRequest } from '@open-mercato/core/modules/workflows/lib/task-visibility-request'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { createEmployeeQuestionService, employeeQuestionAnswerEventId } from '../service'
import { EMPLOYEE_QUESTION_ANSWER_KEY, EMPLOYEE_QUESTION_METADATA_KEY, EMPLOYEE_QUESTION_WORKFLOW_ID } from '../contracts'
import { employeeQuestionWorkflowDefinition } from '../workflow'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/task-visibility-request', () => ({ gateTaskAction: jest.fn(), decideTaskAccess: jest.fn(), resolveTaskVisibilityForRequest: jest.fn(), collectTaskEntityTypesFromTasks: () => [] }))

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const actor = { ...scope, caseId: uuid(3), userId: uuid(4), roleNames: ['employee'] }
const customerUserId = uuid(5), customerEntityId = uuid(6), parentId = uuid(7), parentWorkflowId = uuid(8), parentStepId = uuid(9), questionId = uuid(10), customerTaskId = uuid(11), submissionId = uuid(12), versionId = uuid(13)
const request = { parentTaskId: parentId, eventId: 'question-1', question: 'What evidence can you provide?', documentVersionId: versionId }
const binding = { ...request, caseId: actor.caseId, parentWorkflowInstanceId: parentWorkflowId, employeeUserId: actor.userId, customerUserId, customerEntityId }
const executeWorkflow = jest.fn(), startWorkflow = jest.fn(), submit = jest.fn(), userHasAllFeatures = jest.fn(), getBriefReview = jest.fn(), getPostReview = jest.fn(), researchStatus = jest.fn(), findById = jest.fn()
const authoring = { findOwnedDefinition: jest.fn() }
const em = { transactional: jest.fn(async (fn: (manager: unknown) => Promise<unknown>) => fn(em)) }
const services: Record<string, unknown> = { em, rbacService: { userHasAllFeatures }, workflowExecutor: { startWorkflow, executeWorkflow }, workflowDefinitionAuthoring: authoring,
  agencyClientSubmissionService: { submit }, agencyResearchService: { getBriefReview, getPostReview, status: researchStatus }, customerUserService: { findById } }
const container = { resolve: (name: string) => services[name], hasRegistration: (name: string) => name in services } as unknown as AppContainer
let parent: UserTask, parentWorkflow: WorkflowInstance, customerTask: UserTask, question: WorkflowInstance | null, submission: AgencyClientSubmission | null
const workflowContext = { workflowInstance: { id: questionId, workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID, ...scope } }

function savedQuestion() {
  return Object.assign(new WorkflowInstance(), { id: questionId, workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID, ...scope, createdAt: new Date(), status: 'PAUSED',
    metadata: { entityType: 'agency_operations:agency_case', entityId: actor.caseId, labels: { [EMPLOYEE_QUESTION_METADATA_KEY]: JSON.stringify(binding) } },
    context: { question: { ...binding, customerUserId: uuid(90), caseId: uuid(91) } },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  parent = Object.assign(new UserTask(), { id: parentId, workflowInstanceId: parentWorkflowId, stepInstanceId: parentStepId, assigneeKind: 'user', assignedTo: actor.userId, status: 'PENDING', taskName: 'Missing evidence', ...scope })
  parentWorkflow = Object.assign(new WorkflowInstance(), { id: parentWorkflowId, workflowId: 'agency_operations.analysis.v1', status: 'PAUSED', currentStepId: 'exception', ...scope,
    metadata: { entityType: 'agency_operations:agency_case', entityId: actor.caseId } })
  customerTask = Object.assign(new UserTask(), { id: customerTaskId, workflowInstanceId: questionId, assigneeKind: 'customer', assignedTo: customerUserId, status: 'PENDING', ...scope })
  question = null
  submission = null
  userHasAllFeatures.mockResolvedValue(true)
  getBriefReview.mockResolvedValue({ orderRef: actor.caseId, versionId })
  getPostReview.mockResolvedValue(null)
  researchStatus.mockResolvedValue({ documents: [] })
  findById.mockResolvedValue({ isActive: true, customerEntityId })
  authoring.findOwnedDefinition.mockResolvedValue({ enabled: true, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'employee_question' } } })
  jest.mocked(gateTaskAction).mockResolvedValue({ allowed: true, task: parent, visibility: {} } as never)
  jest.mocked(resolveTaskVisibilityForRequest).mockResolvedValue({} as never)
  jest.mocked(decideTaskAccess).mockReturnValue({ visible: true, actable: true } as never)
  startWorkflow.mockImplementation(async (_manager, options) => { question = savedQuestion(); question.metadata = options.metadata; return { id: questionId } })
  submit.mockImplementation(async (_identity, _caseId, input) => {
    submission = Object.assign(new AgencyClientSubmission(), { id: submissionId, original: input })
    return { item: { submissionId }, replayed: false }
  })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_manager, entity, rawWhere) => {
    const where = rawWhere as Record<string, unknown>
    if (where.tenantId !== scope.tenantId || where.organizationId !== scope.organizationId) return null
    if (entity === AgencyCase) return where.id === actor.caseId ? { id: actor.caseId, workflowInstanceId: parentWorkflowId, customerEntityId, submittedByCustomerUserId: customerUserId } as never : null
    if (entity === WorkflowInstance) return (where.id === parentWorkflowId ? parentWorkflow : question) as never
    if (entity === StepInstance) return { id: parentStepId, stepId: 'exception' } as never
    if (entity === UserTask) return (where.id === parentId ? parent : where.status && where.status !== customerTask.status ? null : customerTask) as never
    if (entity === AgencyClientSubmission) return submission as never
    return null
  })
  jest.mocked(findWithDecryption).mockImplementation(async (_manager, entity) => {
    if (entity === AgencyClientSubmission) return []
    if (entity === WorkflowInstance) return [parentWorkflow, ...(question ? [question] : [])] as never
    if (entity === UserTask) return [parent, customerTask] as never
    if (entity === StepInstance) return [{ id: parentStepId, stepId: 'exception' }] as never
    return []
  })
})

test('staff question starts a native customer task and never submits staff text or resolves the exception', async () => {
  const service = createEmployeeQuestionService(container)
  const result = await service.ask({ ...actor, ...request })
  expect(result).toEqual({ workflowInstanceId: questionId, customerTaskId, replayed: false })
  expect(parent.status).toBe('PENDING')
  expect(parentWorkflow.status).toBe('PAUSED')
  expect(submit).not.toHaveBeenCalled()
  expect(executeWorkflow).toHaveBeenCalledWith(em, container, questionId, { userId: actor.userId })
  expect(JSON.parse(startWorkflow.mock.calls[0][1].metadata.labels[EMPLOYEE_QUESTION_METADATA_KEY])).toEqual(binding)
  expect(jest.mocked(gateTaskAction)).toHaveBeenCalledWith(expect.objectContaining({ requireOwnership: true, taskId: parentId }))
  await expect(service.ask({ ...actor, ...request })).resolves.toMatchObject({ replayed: true })
  expect(startWorkflow).toHaveBeenCalledTimes(1)
})

test('native task authority and exact case-owned version are required before asking', async () => {
  jest.mocked(gateTaskAction).mockResolvedValueOnce({ allowed: false, refusal: { status: 403, body: { error: 'denied' } } } as never)
  await expect(createEmployeeQuestionService(container).ask({ ...actor, ...request })).rejects.toMatchObject({ status: 403 })
  getBriefReview.mockResolvedValue(null)
  await expect(createEmployeeQuestionService(container).ask({ ...actor, ...request })).rejects.toMatchObject({ status: 404 })
  getPostReview.mockResolvedValue({ orderRef: uuid(99), versionId })
  await expect(createEmployeeQuestionService(container).ask({ ...actor, ...request })).rejects.toMatchObject({ status: 404 })
  await expect(createEmployeeQuestionService(container).ask({ ...actor, ...request, caseId: uuid(99) })).rejects.toMatchObject({ status: 404 })
  expect(startWorkflow).not.toHaveBeenCalled()
})

test('exact post questions preserve version binding into the original client answer without resolving the exception', async () => {
  getBriefReview.mockResolvedValue(null)
  getPostReview.mockResolvedValue({ orderRef: actor.caseId, versionId, templateId: 'WZR-POST', isCurrent: false, qa: { state: 'missing' } })
  const service = createEmployeeQuestionService(container)
  await service.ask({ ...actor, ...request })
  expect(getPostReview).toHaveBeenCalledWith(scope, actor.caseId, versionId)
  expect(JSON.parse(startWorkflow.mock.calls[0][1].metadata.labels[EMPLOYEE_QUESTION_METADATA_KEY])).toEqual(binding)
  await expect(service.ask({ ...actor, ...request, question: 'A different question' })).rejects.toMatchObject({ status: 409 })
  customerTask.status = 'COMPLETED'
  customerTask.completedBy = customerUserId
  customerTask.formData = { [EMPLOYEE_QUESTION_ANSWER_KEY]: 'The cited post needs the original source.' }
  await service.receiveResponse({}, workflowContext)
  expect(submit).toHaveBeenCalledWith({ ...scope, customerUserId, customerEntityId }, actor.caseId, {
    eventId: employeeQuestionAnswerEventId(customerTaskId), text: 'The cited post needs the original source.', documentVersionReference: versionId,
  })
  expect(parent.status).toBe('PENDING')
  expect(parentWorkflow.status).toBe('PAUSED')
  expect(executeWorkflow).toHaveBeenCalledTimes(1)
})

test('only persisted assigned-customer answer enters G, using immutable binding despite forged context', async () => {
  question = savedQuestion()
  customerTask.status = 'COMPLETED'
  customerTask.completedBy = customerUserId
  customerTask.formData = { [EMPLOYEE_QUESTION_ANSWER_KEY]: '  Here is my actual answer.  ', question: { caseId: uuid(99) } }
  const service = createEmployeeQuestionService(container)
  await expect(service.receiveResponse({ answer: 'Employee impersonation' }, workflowContext)).resolves.toEqual({ submissionId, replayed: false })
  expect(submit).toHaveBeenCalledWith({ ...scope, customerUserId, customerEntityId }, actor.caseId, {
    eventId: employeeQuestionAnswerEventId(customerTaskId), text: '  Here is my actual answer.  ', documentVersionReference: versionId,
  })
  await expect(service.receiveResponse({}, workflowContext)).resolves.toEqual({ submissionId, replayed: true })
  expect(submit).toHaveBeenCalledTimes(1)
  expect(parent.status).toBe('PENDING')
  expect(executeWorkflow).not.toHaveBeenCalled()
})

test.each(['WZR-STRATEGIA', 'WZR-TOV', 'WZR-PLAN'])('binds a current %s and preserves replay and client answer after its version advances', async (templateId) => {
  getBriefReview.mockResolvedValue(null)
  researchStatus.mockResolvedValue({ documents: [{ templateId, versionId, versionNo: 1, status: 'blocked' }] })
  const service = createEmployeeQuestionService(container)
  await service.ask({ ...actor, ...request })
  expect(researchStatus).toHaveBeenCalledWith(scope, actor.caseId)
  researchStatus.mockResolvedValue({ documents: [{ templateId, versionId: uuid(14), versionNo: 2, status: 'draft' }] })
  await expect(service.ask({ ...actor, ...request })).resolves.toMatchObject({ replayed: true })
  expect(researchStatus).toHaveBeenCalledTimes(1)
  await expect(service.ask({ ...actor, ...request, documentVersionId: uuid(14) })).rejects.toMatchObject({ status: 409 })
  customerTask.status = 'COMPLETED'
  customerTask.completedBy = customerUserId
  customerTask.formData = { [EMPLOYEE_QUESTION_ANSWER_KEY]: 'This answer concerns the original version.' }
  await service.receiveResponse({}, workflowContext)
  expect(submit).toHaveBeenCalledWith({ ...scope, customerUserId, customerEntityId }, actor.caseId, expect.objectContaining({ documentVersionReference: versionId }))
  expect(parent.status).toBe('PENDING')
  expect(parentWorkflow.status).toBe('PAUSED')
  expect(startWorkflow).toHaveBeenCalledTimes(1)
  question = null
  await expect(service.ask({ ...actor, ...request, eventId: 'new-question' })).rejects.toMatchObject({ status: 404 })
})

test('offers only supported current case documents, without requiring QA approval', async () => {
  const documents = ['BRIEF', 'POST', 'STRATEGIA', 'TOV', 'PLAN'].map((name, index) => ({
    templateId: `WZR-${name}`, outputId: `KLI-${name}`, versionId: uuid(20 + index), versionNo: index + 1, status: index % 2 ? 'draft' : 'blocked',
  }))
  researchStatus.mockResolvedValue({ documents: [...documents,
    { templateId: 'WZR-ZRODLA', outputId: 'WEW-ZRODLA', versionId, versionNo: 1, status: 'approved' },
    { templateId: 'WZR-PLAN', outputId: 'KLI-PLAN', versionId: null, versionNo: null, status: 'draft' },
  ] })
  const service = createEmployeeQuestionService(container)
  expect((await service.list(actor)).documents).toEqual(documents.map((document) => ({
    versionId: document.versionId, documentCode: document.outputId, versionLabel: `${document.versionNo}.0`,
  })))
  expect(researchStatus).toHaveBeenCalledWith(scope, actor.caseId)
  getBriefReview.mockResolvedValue(null)
  await expect(service.ask({ ...actor, ...request })).rejects.toMatchObject({ status: 404 })
  expect(startWorkflow).not.toHaveBeenCalled()
})

test('pending task or completion by another principal cannot manufacture a client response', async () => {
  question = savedQuestion()
  await expect(createEmployeeQuestionService(container).receiveResponse({}, workflowContext)).rejects.toMatchObject({ status: 404 })
  customerTask.status = 'COMPLETED'
  customerTask.completedBy = actor.userId
  customerTask.formData = { [EMPLOYEE_QUESTION_ANSWER_KEY]: 'Staff answer' }
  await expect(createEmployeeQuestionService(container).receiveResponse({}, workflowContext)).rejects.toMatchObject({ status: 404 })
  expect(submit).not.toHaveBeenCalled()
})

test('saved customer answer remains visible when G receipt failed; invisible exceptions do not leak questions', async () => {
  question = savedQuestion()
  question.status = 'FAILED'
  customerTask.status = 'COMPLETED'
  customerTask.completedBy = customerUserId
  customerTask.formData = { [EMPLOYEE_QUESTION_ANSWER_KEY]: 'Customer answer preserved' }
  const result = await createEmployeeQuestionService(container).list(actor)
  expect(result.questions[0]).toMatchObject({ answer: 'Customer answer preserved', submissionId: null, workflowStatus: 'FAILED', parentTaskId: parentId })
  jest.mocked(decideTaskAccess).mockReturnValue({ visible: false, actable: false } as never)
  expect(await createEmployeeQuestionService(container).list(actor)).toEqual({ configured: true, documents: [], parents: [], questions: [] })
})

test('unconfigured questions have no enabled ask action and never create workflow definitions on demand', async () => {
  authoring.findOwnedDefinition.mockResolvedValue(null)
  const service = createEmployeeQuestionService(container)
  expect(await service.list(actor)).toMatchObject({ configured: false, parents: [{ canAsk: false }] })
  await expect(service.ask({ ...actor, ...request })).rejects.toMatchObject({ status: 409 })
  expect(startWorkflow).not.toHaveBeenCalled()
})

test('customer question workflow has no transition that completes or signals its employee parent', () => {
  const task = employeeQuestionWorkflowDefinition.steps.find((step) => step.stepId === 'client_answer')
  expect(task?.userTaskConfig?.assigneeKind).toBe('customer')
  expect(task?.userTaskConfig?.formKey).toBeUndefined()
  expect(JSON.stringify(employeeQuestionWorkflowDefinition)).not.toContain('dueDate')
  expect(employeeQuestionWorkflowDefinition.transitions.flatMap((transition) => transition.activities ?? []).map((activity) => activity.activityType)).toEqual(['EXECUTE_FUNCTION'])
})
