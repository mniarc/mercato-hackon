/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AgencyClientSubmission } from '../../../data/entities'
import { inputSchema, type ClientTriageInterpretation } from '../../../agents/client-triage/contract'
import { briefResponseEventId } from '../../briefStrategyProcess/service'
import { createBriefRevisionBinding } from '../binding'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, customerEntityId, customerUserId, invitationId, taskId, versionId, documentId, submissionId, workflowId, stepId, runId] = Array.from({ length: 13 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const response = { channel: 'portal', kind: 'message', documentId, versionId, externalEventId: 'answer-1', body: 'Our intended audience is agency owners.' }
const interpretation: ClientTriageInterpretation = { parts: [{ intent: 'change', summary: 'Answers the audience question', rationale: 'Client supplies their intention', needsClarification: false, recommendedDisposition: 'change' }], rationale: 'Update the brief', recommendedDisposition: 'change', responseMessage: 'The brief will be revised.' }
const findById = jest.fn()
const container = { resolve: (name: string) => name === 'customerUserService' ? { findById } : {} }
let submission: AgencyClientSubmission
let task: Record<string, unknown>
let run: Record<string, unknown>

beforeEach(() => {
  jest.clearAllMocks()
  submission = Object.assign(new AgencyClientSubmission(), { id: submissionId, ...scope, caseId, customerEntityId,
    submittedByCustomerUserId: customerUserId, workflowInstanceId: workflowId, eventId: briefResponseEventId(taskId, response.externalEventId),
    original: { eventId: briefResponseEventId(taskId, response.externalEventId), text: response.body, documentVersionReference: versionId, reviewResponse: { taskId, ...response } },
  })
  task = { id: taskId, ...scope, workflowInstanceId: invitationId, status: 'COMPLETED', assigneeKind: 'customer', assignedTo: customerUserId, completedBy: customerUserId, formData: { briefReviewResponse: response } }
  const invitation = { id: invitationId, ...scope, workflowId: 'agency_operations.brief-review.v1', deletedAt: null, context: { briefReviewInvitation: {
    caseId, customerEntityId, customerUserId, review: { caseId, documentId, versionId, version: '1.0', templateId: 'WZR-BRIEF', title: 'Brief', html: '<p>Brief</p>', status: 'needs_review', isCurrent: true, mode: 'content' },
  } } }
  run = { id: runId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', invocationId: stepId, agentId: 'agency_operations.client_triage', status: 'ok', runtime: 'native', deletedAt: null,
    input: inputSchema.parse({ original: submission.original }), output: { kind: 'research', data: interpretation } }
  findById.mockResolvedValue({ customerEntityId, isActive: true })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const candidate: Record<string, unknown> | null = entity === UserTask ? task : entity === AgentRun ? run : entity === WorkflowInstance ? invitation
      : entity === StepInstance ? { id: stepId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', status: 'COMPLETED' } : null
    return candidate && Object.entries(where as Record<string, unknown>).every(([key, value]) => candidate[key] === value) ? candidate as never : null
  })
})

test('binds only the original native invitation text and saved G change to revision source IDs', async () => {
  await expect(createBriefRevisionBinding(container as never).load(submission, interpretation)).resolves.toEqual({
    orderRef: caseId, briefVersionId: versionId, originalText: response.body,
    source: { submissionId, eventId: submission.eventId, customerUserId, workflowInstanceId: workflowId, invitationTaskId: taskId },
  })
  expect(findById).toHaveBeenCalledWith(customerUserId, tenantId, organizationId)
})

test('does not convert a question or mixed G decision into a revision', async () => {
  const question = { ...interpretation, recommendedDisposition: 'answer', parts: [{ ...interpretation.parts[0], intent: 'question', recommendedDisposition: 'answer' }] }
  await expect(createBriefRevisionBinding(container as never).load(submission, question)).resolves.toBeNull()
  await expect(createBriefRevisionBinding(container as never).load(submission, { ...interpretation, parts: [...interpretation.parts, question.parts[0]] })).resolves.toBeNull()
  expect(findOneWithDecryption).not.toHaveBeenCalled()
})

test('rejects forged response text, completed actor, and a replaced native interpretation', async () => {
  submission.original.text = 'Injected answer'
  await expect(createBriefRevisionBinding(container as never).load(submission, interpretation)).resolves.toBeNull()
  submission.original.text = response.body
  task.completedBy = uuid(90)
  await expect(createBriefRevisionBinding(container as never).load(submission, interpretation)).resolves.toBeNull()
  task.completedBy = customerUserId
  run.output = { kind: 'research', data: { ...interpretation, recommendedDisposition: 'clarify' } }
  await expect(createBriefRevisionBinding(container as never).load(submission, interpretation)).resolves.toBeNull()
})
