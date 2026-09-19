/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { PLAN_REVIEW_CONTEXT_KEY, PLAN_REVIEW_WORKFLOW_ID, PLAN_RESPONSE_CONTEXT_KEY } from '../../planReview/contracts'
import { planReviewEventId } from '../../planReview/service'
import { CLIENT_TRIAGE_AGENT_ID, inputSchema, type ClientTriageInterpretation } from '../../../agents/client-triage/contract'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../../../agents/client-triage/workflow'
import { createPlanApproval } from '../service'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const caseId = uuid(3), customerEntityId = uuid(4), customerUserId = uuid(5), invitationId = uuid(6), taskId = uuid(7)
const documentId = uuid(8), versionId = uuid(9), submissionId = uuid(10), workflowId = uuid(11), stepId = uuid(12), runId = uuid(13), principalId = uuid(14)
const response = { channel: 'portal' as const, kind: 'approval' as const, plan: { documentId, versionId }, approvePlan: true, selectedTopicId: 'topic-2', externalEventId: 'plan-approval' }
const interpretation: ClientTriageInterpretation = {
  parts: [{ intent: 'approval', summary: 'Approves plan and chooses topic 2', rationale: 'Explicit choice', needsClarification: false, recommendedDisposition: 'approve' }],
  rationale: 'Pure approval', recommendedDisposition: 'approve', responseMessage: null,
}
let submission: AgencyClientSubmission
let task: Record<string, unknown>, run: Record<string, unknown>, invitation: Record<string, unknown>, agencyCase: Record<string, unknown>
const acceptPlan = jest.fn(), findById = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { acceptPlan }, customerUserService: { findById } }
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  const eventId = planReviewEventId(taskId, response.externalEventId)
  submission = Object.assign(new AgencyClientSubmission(), {
    id: submissionId, ...scope, caseId, customerEntityId, submittedByCustomerUserId: customerUserId, workflowInstanceId: workflowId, eventId,
    original: { eventId, text: 'I approve the plan and select topic 2.', documentVersionReference: versionId, planReviewResponse: { ...response, taskId } },
  })
  agencyCase = { id: caseId, ...scope, customerEntityId, deletedAt: null }
  task = { id: taskId, ...scope, workflowInstanceId: invitationId, status: 'COMPLETED', assigneeKind: 'customer', assignedTo: customerUserId, completedBy: customerUserId, formData: { [PLAN_RESPONSE_CONTEXT_KEY]: response } }
  invitation = { id: invitationId, ...scope, workflowId: PLAN_REVIEW_WORKFLOW_ID, deletedAt: null, context: { [PLAN_REVIEW_CONTEXT_KEY]: {
    caseId, customerEntityId, customerUserId, review: { caseId,
      plan: { caseId, documentId, versionId, version: '1.0', templateId: 'WZR-PLAN', title: 'Plan', html: '<p>Plan</p>', status: 'ready_for_review', isCurrent: true, mode: 'topic_choice' },
      topics: [{ topicId: 'topic-1', title: 'One', recommended: true }, { topicId: 'topic-2', title: 'Two', recommended: false }], recommendedTopicId: 'topic-1',
    },
  } } }
  run = { id: runId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', invocationId: stepId, agentId: CLIENT_TRIAGE_AGENT_ID, status: 'ok', runtime: 'native', deletedAt: null,
    input: inputSchema.parse({ original: submission.original }), output: { kind: 'research', data: interpretation } }
  findById.mockResolvedValue({ customerEntityId, isActive: true })
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  acceptPlan.mockResolvedValue({ status: 'plan_accepted', replayed: false })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const filter = where as Record<string, unknown>
    const candidate: Record<string, unknown> | null = entity === AgencyCase ? agencyCase : entity === UserTask ? task : entity === AgentRun ? run : entity === StepInstance
      ? { id: stepId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', status: 'COMPLETED' }
      : entity === WorkflowInstance ? filter.id === invitationId ? invitation : { id: workflowId, ...scope, workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, deletedAt: null } : null
    return candidate && Object.entries(filter).every(([key, value]) => candidate[key] === value) ? candidate as never : null
  })
})

test('passes the explicitly selected topic, not the recommendation, under the native principal', async () => {
  await expect(createPlanApproval(container).accept(submission, interpretation)).resolves.toMatchObject({ status: 'plan_accepted' })
  expect(acceptPlan).toHaveBeenCalledWith({ context: { ...scope, userId: principalId }, request: {
    orderRef: caseId, documentId, versionId, approvePlan: true, selectedTopicId: 'topic-2', customerUserId,
    source: { submissionId, eventId: submission.eventId, workflowInstanceId: workflowId, agentRunId: runId, invitationTaskId: taskId },
  } })
})

test('a changed topic cannot replace the task original', async () => {
  submission.original.planReviewResponse = { ...response, taskId, selectedTopicId: 'topic-1' }
  await expect(createPlanApproval(container).load(submission, interpretation)).resolves.toBeNull()
  expect(acceptPlan).not.toHaveBeenCalled()
})

test('mixed changes or a message never become plan approval', async () => {
  const mixed = { ...interpretation, parts: [...interpretation.parts, { ...interpretation.parts[0], intent: 'change', recommendedDisposition: 'change' }] }
  await expect(createPlanApproval(container).load(submission, mixed)).resolves.toBeNull()
  submission.original.planReviewResponse = { channel: 'portal', kind: 'message', plan: response.plan, body: 'Please change topic 2', taskId, externalEventId: response.externalEventId }
  await expect(createPlanApproval(container).load(submission, interpretation)).resolves.toBeNull()
})

test('requires scoped case ownership, active customer and completed exact task', async () => {
  const approval = createPlanApproval(container)
  agencyCase.customerEntityId = uuid(90)
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
  agencyCase.customerEntityId = customerEntityId
  findById.mockResolvedValueOnce({ customerEntityId, isActive: false })
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
  task.completedBy = uuid(90)
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
})

test('requires the saved native interpretation and original input', async () => {
  run.output = { kind: 'research', data: { ...interpretation, recommendedDisposition: 'hold' } }
  await expect(createPlanApproval(container).load(submission, interpretation)).resolves.toBeNull()
  run.output = { kind: 'research', data: interpretation }
  run.input = { original: { eventId: 'other', text: 'Other original' } }
  await expect(createPlanApproval(container).load(submission, interpretation)).resolves.toBeNull()
})

test('preserves producer replay or stale rejection without substituting a current version', async () => {
  acceptPlan.mockResolvedValueOnce({ status: 'plan_accepted', replayed: true })
  await expect(createPlanApproval(container).accept(submission, interpretation)).resolves.toMatchObject({ replayed: true })
  acceptPlan.mockRejectedValueOnce(new Error('Plan is stale'))
  await expect(createPlanApproval(container).accept(submission, interpretation)).rejects.toThrow('Plan is stale')
  expect(acceptPlan.mock.calls[1][0].request.versionId).toBe(versionId)
})
