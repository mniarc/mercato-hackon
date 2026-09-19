/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AgencyClientSubmission } from '../../../data/entities'
import { BRIEF_REVIEW_CONTEXT_KEY, BRIEF_REVIEW_WORKFLOW_ID, BRIEF_RESPONSE_CONTEXT_KEY } from '../../../lib/briefStrategyProcess/contracts'
import { briefResponseEventId } from '../../../lib/briefStrategyProcess/service'
import { createBriefApproval } from '../briefApproval'
import { CLIENT_TRIAGE_AGENT_ID, inputSchema, type ClientTriageInterpretation } from '../contract'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../workflow'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const caseId = uuid(3), customerEntityId = uuid(4), customerUserId = uuid(5), invitationId = uuid(6), taskId = uuid(7)
const versionId = uuid(8), documentId = uuid(9), submissionId = uuid(10), workflowId = uuid(11), stepId = uuid(12), runId = uuid(13), principalId = uuid(14)
const response = { channel: 'portal' as const, kind: 'approval' as const, documentId, versionId, externalEventId: 'approval-event' }
const interpretation: ClientTriageInterpretation = {
  parts: [{ intent: 'approval', summary: 'Accepts the current brief', rationale: 'No requested changes', needsClarification: false, recommendedDisposition: 'approve' }],
  rationale: 'Unambiguous acceptance', recommendedDisposition: 'approve', responseMessage: null,
}
let submission: AgencyClientSubmission
let task: Record<string, unknown>
let run: Record<string, unknown>
let invitation: Record<string, unknown>
const em = {}
const acceptBrief = jest.fn()
const findById = jest.fn()
const services: Record<string, unknown> = { em, agencyResearchService: { acceptBrief }, customerUserService: { findById } }
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  submission = Object.assign(new AgencyClientSubmission(), {
    id: submissionId, ...scope, caseId, customerEntityId, submittedByCustomerUserId: customerUserId, workflowInstanceId: workflowId,
    eventId: briefResponseEventId(taskId, response.externalEventId),
    original: { eventId: briefResponseEventId(taskId, response.externalEventId), text: 'I accept the exact brief.',
      documentVersionReference: versionId, reviewResponse: { taskId, ...response } },
  })
  task = { id: taskId, ...scope, workflowInstanceId: invitationId, status: 'COMPLETED', assigneeKind: 'customer', assignedTo: customerUserId, completedBy: customerUserId, formData: { [BRIEF_RESPONSE_CONTEXT_KEY]: response } }
  invitation = { id: invitationId, ...scope, workflowId: BRIEF_REVIEW_WORKFLOW_ID, deletedAt: null, context: { [BRIEF_REVIEW_CONTEXT_KEY]: {
    caseId, customerEntityId, customerUserId, review: { caseId, documentId, versionId, version: '1.0', templateId: 'WZR-BRIEF', title: 'Brief', html: '<p>Brief</p>', status: 'ready_for_review', isCurrent: true, mode: 'content' },
  } } }
  run = { id: runId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', invocationId: stepId, agentId: CLIENT_TRIAGE_AGENT_ID,
    status: 'ok', runtime: 'native', deletedAt: null, input: inputSchema.parse({ original: submission.original }), output: { kind: 'research', data: interpretation } }
  findById.mockResolvedValue({ customerEntityId, isActive: true })
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  acceptBrief.mockResolvedValue({ status: 'accepted', documentId, versionId, replayed: false })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const filter = where as Record<string, unknown>
    const candidate = entity === UserTask ? task : entity === AgentRun ? run : entity === StepInstance
      ? { id: stepId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', status: 'COMPLETED' }
      : entity === WorkflowInstance ? filter.id === invitationId ? invitation : { id: workflowId, ...scope, workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, deletedAt: null } : null
    return candidate && Object.entries(filter).every(([key, value]) => candidate[key as keyof typeof candidate] === value) ? candidate as never : null
  })
})

test('hands only the exact native decision and authorized contact to the public producer under workflow identity', async () => {
  await expect(createBriefApproval(container).accept(submission, interpretation)).resolves.toMatchObject({ status: 'accepted', versionId })
  expect(acceptBrief).toHaveBeenCalledWith({ context: { ...scope, userId: principalId }, request: {
    orderRef: caseId, documentId, versionId, customerUserId,
    source: { submissionId, eventId: submission.eventId, workflowInstanceId: workflowId, agentRunId: runId, invitationTaskId: taskId },
  } })
  expect(findById).toHaveBeenCalledWith(customerUserId, scope.tenantId, scope.organizationId)
})

test('a click or mixed native recommendation cannot authorize acceptance', async () => {
  const mixed = { ...interpretation, parts: [...interpretation.parts, { ...interpretation.parts[0], intent: 'change', recommendedDisposition: 'change' }] }
  await expect(createBriefApproval(container).accept(submission, mixed)).rejects.toThrow('exact authorized review original')
  submission.original.reviewResponse = undefined
  await expect(createBriefApproval(container).accept(submission, interpretation)).rejects.toThrow('exact authorized review original')
  expect(acceptBrief).not.toHaveBeenCalled()
})

test('rejects a foreign completed invitation or inactive contact', async () => {
  task.completedBy = uuid(90)
  await expect(createBriefApproval(container).load(submission, interpretation)).resolves.toBeNull()
  task.completedBy = customerUserId
  findById.mockResolvedValue({ customerEntityId, isActive: false })
  await expect(createBriefApproval(container).load(submission, interpretation)).resolves.toBeNull()
  expect(acceptBrief).not.toHaveBeenCalled()
})

test('cannot replace the saved native interpretation or its original decision', async () => {
  run.output = { kind: 'research', data: { ...interpretation, recommendedDisposition: 'hold' } }
  await expect(createBriefApproval(container).load(submission, interpretation)).resolves.toBeNull()
  run.output = { kind: 'research', data: interpretation }
  run.input = { original: { eventId: 'other-original', text: 'Different request' } }
  await expect(createBriefApproval(container).load(submission, interpretation)).resolves.toBeNull()
  expect(acceptBrief).not.toHaveBeenCalled()
})

test('uses producer replay and stale-version decisions without substituting a newer version', async () => {
  const approval = createBriefApproval(container)
  acceptBrief.mockResolvedValueOnce({ status: 'accepted', versionId, replayed: true })
  await expect(approval.accept(submission, interpretation)).resolves.toMatchObject({ versionId, replayed: true })
  acceptBrief.mockRejectedValueOnce(new Error('Brief version is stale'))
  await expect(approval.accept(submission, interpretation)).rejects.toThrow('Brief version is stale')
  expect(acceptBrief.mock.calls[1][0].request.versionId).toBe(versionId)
})
