import { createHash } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { StepInstance, UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import { collectTaskEntityTypesFromTasks, decideTaskAccess, gateTaskAction, resolveTaskVisibilityForRequest } from '@open-mercato/core/modules/workflows/lib/task-visibility-request'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { CLIENT_SUBMISSION_SERVICE, type ClientSubmissionService } from '../contracts/clientSubmission'
import {
  EMPLOYEE_QUESTION_ANSWER_KEY, EMPLOYEE_QUESTION_METADATA_KEY, EMPLOYEE_QUESTION_WORKFLOW_ID,
  employeeQuestionBindingSchema, employeeQuestionRequestSchema,
  type EmployeeQuestionActor, type EmployeeQuestionBinding, type EmployeeQuestionService,
} from './contracts'

type Scope = { tenantId: string; organizationId: string }
type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow'>
const actorSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), caseId: z.uuid(), roleNames: z.array(z.string()) })
const contextSchema = z.object({ workflowInstance: z.object({ id: z.uuid(), workflowId: z.literal(EMPLOYEE_QUESTION_WORKFLOW_ID), tenantId: z.uuid(), organizationId: z.uuid() }) })
const answerSchema = z.string().min(1).max(12000).refine((text) => text.trim().length > 0)
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function notFound(): never { throw new CrudHttpError(404, { error: 'api.errors.notFound' }) }
function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }
export function employeeQuestionAnswerEventId(customerTaskId: string) { return `employee-question:${customerTaskId}` }
function bindingOf(instance: WorkflowInstance): EmployeeQuestionBinding | null {
  const serialized = record(record(instance.metadata).labels)[EMPLOYEE_QUESTION_METADATA_KEY]
  if (typeof serialized !== 'string') return null
  let value: unknown
  try { value = JSON.parse(serialized) } catch { return null }
  const parsed = employeeQuestionBindingSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function createEmployeeQuestionService(container: AppContainer): EmployeeQuestionService {
  const em = container.resolve<EntityManager>('em')

  async function authorize(input: EmployeeQuestionActor, write = false) {
    const actor = actorSchema.parse(input)
    const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId }
    const features = ['agency_operations.cases.view', 'customers.companies.view', ...(write ? ['agency_operations.cases.escalate'] : [])]
    if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(actor.userId, features, scope)) {
      throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { id: actor.caseId, ...scope, deletedAt: null }, undefined, scope)
    if (!agencyCase) notFound()
    return { actor, scope, agencyCase }
  }

  async function assertParentCase(manager: EntityManager, task: UserTask, agencyCase: AgencyCase, scope: Scope) {
    if (task.assigneeKind === 'customer') notFound()
    const instance = await findOneWithDecryption(manager, WorkflowInstance, { id: task.workflowInstanceId, ...scope, deletedAt: null }, undefined, scope)
    if (!instance) notFound()
    const metadata = record(instance.metadata)
    if (instance.id === agencyCase.workflowInstanceId || (metadata.entityType === 'agency_operations:agency_case' && metadata.entityId === agencyCase.id)) return instance
    const submission = await findOneWithDecryption(manager, AgencyClientSubmission, {
      workflowInstanceId: instance.id, caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId, ...scope, deletedAt: null,
    }, undefined, scope)
    if (!submission) notFound()
    return instance
  }

  async function existingSubmission(task: UserTask, binding: EmployeeQuestionBinding, scope: Scope) {
    return findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, caseId: binding.caseId, customerEntityId: binding.customerEntityId,
      submittedByCustomerUserId: binding.customerUserId, channel: 'portal',
      eventId: employeeQuestionAnswerEventId(task.id), deletedAt: null,
    }, undefined, scope)
  }

  return {
    async ask(rawInput) {
      const { actor, scope, agencyCase } = await authorize(rawInput, true)
      const request = employeeQuestionRequestSchema.parse({
        parentTaskId: rawInput.parentTaskId, question: rawInput.question, eventId: rawInput.eventId,
        ...(rawInput.documentVersionId ? { documentVersionId: rawInput.documentVersionId } : {}),
      })
      const executor = container.resolve<Executor>('workflowExecutor')
      const started = await em.transactional(async (tx) => {
        const parent = await findOneWithDecryption(tx, UserTask, { id: request.parentTaskId, ...scope }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
        if (!parent) notFound()
        const parentWorkflow = await assertParentCase(tx, parent, agencyCase, scope)
        const gate = await gateTaskAction({ container, em: tx, auth: { userId: actor.userId, tenantId: actor.tenantId, roleNames: actor.roleNames }, taskId: parent.id, organizationId: actor.organizationId, requireOwnership: true })
        if (!gate.allowed) throw new CrudHttpError(gate.refusal.status, gate.refusal.body)
        if (!['PENDING', 'IN_PROGRESS'].includes(parent.status)) conflict()
        const parentStep = await findOneWithDecryption(tx, StepInstance, { id: parent.stepInstanceId, workflowInstanceId: parentWorkflow.id, ...scope }, undefined, scope)
        if (!parentStep || parentWorkflow.status !== 'PAUSED' || parentWorkflow.currentStepId !== parentStep.stepId) conflict()
        const contacts = container.resolve<{ findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }>('customerUserService')
        const customer = await contacts.findById(agencyCase.submittedByCustomerUserId, scope.tenantId, scope.organizationId)
        if (!customer || customer.isActive === false || customer.customerEntityId !== agencyCase.customerEntityId) conflict()
        if (request.documentVersionId) {
          if (!container.hasRegistration(AGENCY_RESEARCH_SERVICE)) conflict()
          const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
          const document = await research.getBriefReview(scope, agencyCase.id, request.documentVersionId)
            ?? await research.getPostReview(scope, agencyCase.id, request.documentVersionId)
          if (!document || document.orderRef !== agencyCase.id || document.versionId !== request.documentVersionId) notFound()
        }
        const correlationKey = `agency-question:${parent.id}:${createHash('sha256').update(request.eventId).digest('hex')}`
        const previous = await findOneWithDecryption(tx, WorkflowInstance, { workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID, correlationKey, ...scope, deletedAt: null }, undefined, scope)
        if (previous) {
          const binding = bindingOf(previous)
          if (!binding || binding.question !== request.question || binding.documentVersionId !== request.documentVersionId || binding.employeeUserId !== actor.userId) conflict()
          return { workflowInstanceId: previous.id, replayed: true }
        }
        const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
        const definition = await authoring.findOwnedDefinition(tx, { workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID, ...scope })
        if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'employee_question') conflict()
        const binding: EmployeeQuestionBinding = {
          ...request, caseId: agencyCase.id, parentWorkflowInstanceId: parentWorkflow.id,
          employeeUserId: actor.userId, customerUserId: agencyCase.submittedByCustomerUserId, customerEntityId: agencyCase.customerEntityId,
        }
        const instance = await executor.startWorkflow(tx, {
          ...scope, workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID, correlationKey,
          metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id, initiatedBy: actor.userId, labels: { [EMPLOYEE_QUESTION_METADATA_KEY]: JSON.stringify(binding) } },
          initialContext: { question: binding },
        })
        return { workflowInstanceId: instance.id, replayed: false }
      })
      if (!started.replayed) await executor.executeWorkflow(em, container, started.workflowInstanceId, { userId: actor.userId })
      const customerTask = await findOneWithDecryption(em, UserTask, { workflowInstanceId: started.workflowInstanceId, ...scope, assigneeKind: 'customer' }, undefined, scope)
      if (!customerTask) conflict()
      return { ...started, customerTaskId: customerTask.id }
    },

    async receiveResponse(_input, rawContext) {
      const { workflowInstance } = contextSchema.parse(rawContext)
      const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
      const instance = await findOneWithDecryption(em, WorkflowInstance, { id: workflowInstance.id, workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID, ...scope, deletedAt: null }, undefined, scope)
      const binding = instance && bindingOf(instance)
      if (!instance || !binding) notFound()
      const task = await findOneWithDecryption(em, UserTask, { workflowInstanceId: instance.id, assigneeKind: 'customer', status: 'COMPLETED', ...scope }, undefined, scope)
      if (!task || task.assignedTo !== binding.customerUserId || task.completedBy !== binding.customerUserId) notFound()
      const answer = answerSchema.parse(record(task.formData)[EMPLOYEE_QUESTION_ANSWER_KEY])
      const previous = await existingSubmission(task, binding, scope)
      if (previous) return { submissionId: previous.id, replayed: true }
      const result = await container.resolve<ClientSubmissionService>(CLIENT_SUBMISSION_SERVICE).submit({
        ...scope, customerUserId: binding.customerUserId, customerEntityId: binding.customerEntityId,
      }, binding.caseId, {
        eventId: employeeQuestionAnswerEventId(task.id), text: answer,
        ...(binding.documentVersionId ? { documentVersionReference: binding.documentVersionId } : {}),
      })
      return { submissionId: result.item.submissionId, replayed: result.replayed }
    },

    async list(input) {
      const { actor, scope, agencyCase } = await authorize(input)
      const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring').findOwnedDefinition(em, { workflowId: EMPLOYEE_QUESTION_WORKFLOW_ID, ...scope })
      const configured = Boolean(definition?.enabled && definition.metadata?.generatedBy?.module === 'agency_operations' && definition.metadata.generatedBy.ownerId === 'employee_question')
      const mayAsk = await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(actor.userId, ['agency_operations.cases.escalate'], scope)
      const submissions = await findWithDecryption(em, AgencyClientSubmission, { caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId, ...scope, deletedAt: null }, undefined, scope)
      const ids = [...new Set([agencyCase.workflowInstanceId, ...submissions.map((submission) => submission.workflowInstanceId)].filter((id): id is string => Boolean(id)))]
      const workflows = await findWithDecryption(em, WorkflowInstance, { ...scope, deletedAt: null, $or: [
        { metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id } },
        ...(ids.length ? [{ id: { $in: ids } }] : []),
      ] }, { orderBy: { createdAt: 'desc' }, limit: 100 }, scope)
      const tasks = workflows.length ? await findWithDecryption(em, UserTask, { ...scope, workflowInstanceId: { $in: workflows.map((item) => item.id) } }, undefined, scope) : []
      const employeeTasks = tasks.filter((task) => task.assigneeKind !== 'customer')
      const visibility = employeeTasks.length ? await resolveTaskVisibilityForRequest({
        container, em, auth: { userId: actor.userId, tenantId: actor.tenantId, roleNames: actor.roleNames },
        organizationIds: [actor.organizationId], aclOrganizationId: actor.organizationId, entityTypes: collectTaskEntityTypesFromTasks(employeeTasks),
      }) : null
      const visible = visibility ? employeeTasks.filter((task) => decideTaskAccess(visibility, task).visible) : []
      const steps = visible.length ? await findWithDecryption(em, StepInstance, { id: { $in: visible.map((task) => task.stepInstanceId) }, ...scope }, undefined, scope) : []
      const parents = visible.map((task) => ({ taskId: task.id, taskName: task.taskName, status: task.status, canAsk: Boolean(
        configured && mayAsk && visibility && decideTaskAccess(visibility, task).actable && (task.claimedBy ?? task.assignedTo) === actor.userId
        && workflows.some((instance) => instance.id === task.workflowInstanceId && instance.status === 'PAUSED' && instance.currentStepId === steps.find((step) => step.id === task.stepInstanceId)?.stepId),
      ) }))
      const questions = await Promise.all(workflows.filter((instance) => instance.workflowId === EMPLOYEE_QUESTION_WORKFLOW_ID).map(async (instance) => {
        const binding = bindingOf(instance)
        if (!binding || binding.caseId !== agencyCase.id || !visible.some((task) => task.id === binding.parentTaskId)) return null
        const task = tasks.find((task) => task.workflowInstanceId === instance.id && task.assigneeKind === 'customer')
        const submission = task ? await existingSubmission(task, binding, scope) : null
        const storedAnswer = task?.status === 'COMPLETED' && task.completedBy === binding.customerUserId
          ? answerSchema.safeParse(record(task.formData)[EMPLOYEE_QUESTION_ANSWER_KEY]) : null
        return {
          workflowInstanceId: instance.id, parentTaskId: binding.parentTaskId, question: binding.question,
          documentVersionId: binding.documentVersionId ?? null, employeeUserId: binding.employeeUserId,
          createdAt: instance.createdAt.toISOString(), workflowStatus: instance.status,
          customerTaskId: task?.id ?? null, customerTaskStatus: task?.status ?? null,
          answer: submission && typeof submission.original.text === 'string' ? submission.original.text : storedAnswer?.success ? storedAnswer.data : null,
          submissionId: submission?.id ?? null,
        }
      }))
      return { configured, parents, questions: questions.filter((item): item is NonNullable<typeof item> => item !== null) }
    },
  }
}
