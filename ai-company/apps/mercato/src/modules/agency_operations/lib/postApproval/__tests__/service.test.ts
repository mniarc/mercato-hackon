/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { POST_REVIEW_CONTEXT_KEY, POST_REVIEW_WORKFLOW_ID, POST_RESPONSE_CONTEXT_KEY } from '../../postReview/contracts'
import { postReviewEventId } from '../../postReview/service'
import { CLIENT_TRIAGE_AGENT_ID, inputSchema, type ClientTriageInterpretation } from '../../../agents/client-triage/contract'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../../../agents/client-triage/workflow'
import { createPostApproval } from '../service'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const caseId = uuid(3), customerEntityId = uuid(4), customerUserId = uuid(5), invitationId = uuid(6), taskId = uuid(7)
const documentId = uuid(8), versionId = uuid(9), submissionId = uuid(10), workflowId = uuid(11), stepId = uuid(12), runId = uuid(13), principalId = uuid(14)
const response = { channel: 'portal' as const, kind: 'approval' as const, post: { documentId, versionId }, approveContent: true, externalEventId: 'post-approval' }
const interpretation: ClientTriageInterpretation = {
  parts: [{ intent: 'approval', summary: 'Approves this post content', rationale: 'No changes or publishing request', needsClarification: false, recommendedDisposition: 'approve' }],
  rationale: 'Pure approval', recommendedDisposition: 'approve', responseMessage: null,
}
let submission: AgencyClientSubmission
let task: Record<string, unknown>, run: Record<string, unknown>, invitation: Record<string, unknown>, agencyCase: Record<string, unknown>
const acceptPost = jest.fn(), findById = jest.fn(), recordPublicationConsent = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { acceptPost, recordPublicationConsent }, customerUserService: { findById } }
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  const eventId = postReviewEventId(taskId, response.externalEventId)
  submission = Object.assign(new AgencyClientSubmission(), {
    id: submissionId, ...scope, caseId, customerEntityId, submittedByCustomerUserId: customerUserId, workflowInstanceId: workflowId, eventId,
    original: { eventId, text: 'I approve this post content.', documentVersionReference: versionId, postReviewResponse: { ...response, taskId } },
  })
  agencyCase = { id: caseId, ...scope, customerEntityId, deletedAt: null }
  task = { id: taskId, ...scope, workflowInstanceId: invitationId, status: 'COMPLETED', assigneeKind: 'customer', assignedTo: customerUserId, completedBy: customerUserId, formData: { [POST_RESPONSE_CONTEXT_KEY]: response } }
  invitation = { id: invitationId, ...scope, workflowId: POST_REVIEW_WORKFLOW_ID, deletedAt: null, context: { [POST_REVIEW_CONTEXT_KEY]: {
    caseId, customerEntityId, customerUserId, review: { caseId, post: { caseId, documentId, versionId, version: '1.0', templateId: 'WZR-POST', title: 'Post', html: '<p>Post</p>', status: 'ready_for_review', isCurrent: true, mode: 'content' } },
  } } }
  run = { id: runId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', invocationId: stepId, agentId: CLIENT_TRIAGE_AGENT_ID, status: 'ok', runtime: 'native', deletedAt: null,
    input: inputSchema.parse({ original: submission.original }), output: { kind: 'research', data: interpretation } }
  findById.mockResolvedValue({ customerEntityId, isActive: true })
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  acceptPost.mockResolvedValue({ status: 'post_accepted', replayed: false })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const filter = where as Record<string, unknown>
    const candidate: Record<string, unknown> | null = entity === AgencyCase ? agencyCase : entity === UserTask ? task : entity === AgentRun ? run : entity === StepInstance
      ? { id: stepId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', status: 'COMPLETED' }
      : entity === WorkflowInstance ? filter.id === invitationId ? invitation : { id: workflowId, ...scope, workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, deletedAt: null } : null
    return candidate && Object.entries(filter).every(([key, value]) => candidate[key] === value) ? candidate as never : null
  })
})

test('applies exact content approval under the native principal, without publication fields', async () => {
  await expect(createPostApproval(container).accept(submission, interpretation)).resolves.toMatchObject({ status: 'post_accepted' })
  expect(acceptPost).toHaveBeenCalledWith({ context: { ...scope, userId: principalId }, request: {
    orderRef: caseId, documentId, versionId, customerUserId,
    source: { submissionId, eventId: submission.eventId, workflowInstanceId: workflowId, agentRunId: runId, invitationTaskId: taskId },
  } })
  expect(recordPublicationConsent).not.toHaveBeenCalled()
})

test('only the exact saved native consent choice reaches the separate producer with decision time and invited target', async () => {
  const destination = { configVersionId: uuid(30), platform: 'LinkedIn', accountId: 'account-1', channelId: null, displayName: 'Known account' }
  const chosen = { ...response, publicationConsent: { configVersionId: destination.configVersionId, consent: true as const } }
  submission.original.postReviewResponse = { ...chosen, taskId }
  task.formData = { [POST_RESPONSE_CONTEXT_KEY]: chosen }
  task.completedAt = new Date('2026-09-19T12:30:00.000Z')
  const context = invitation.context as Record<string, { review: Record<string, unknown> }>
  context[POST_REVIEW_CONTEXT_KEY].review.publicationTarget = destination
  run.input = inputSchema.parse({ original: submission.original })
  await createPostApproval(container).accept(submission, interpretation)
  expect(recordPublicationConsent).toHaveBeenCalledWith({ context: { ...scope, userId: principalId }, request: expect.objectContaining({
    orderRef: caseId, documentId, versionId, customerUserId, destination, consent: true, decidedAt: '2026-09-19T12:30:00.000Z',
    source: { submissionId, eventId: submission.eventId, workflowInstanceId: workflowId, agentRunId: runId, invitationTaskId: taskId },
  }) })
  submission.original.postReviewResponse.publicationConsent!.configVersionId = uuid(31)
  await expect(createPostApproval(container).load(submission, interpretation)).resolves.toBeNull()
})

test('conditional approval/change or a message never becomes content acceptance', async () => {
  const mixed = { ...interpretation, parts: [...interpretation.parts, { ...interpretation.parts[0], intent: 'change', recommendedDisposition: 'change' }] }
  await expect(createPostApproval(container).load(submission, mixed)).resolves.toBeNull()
  submission.original.postReviewResponse = { channel: 'portal', kind: 'message', post: response.post, body: 'I accept, but change the CTA.', taskId, externalEventId: response.externalEventId }
  await expect(createPostApproval(container).load(submission, interpretation)).resolves.toBeNull()
  expect(acceptPost).not.toHaveBeenCalled()
})

test('cannot substitute a post version for the completed task original', async () => {
  submission.original.postReviewResponse = { ...response, taskId, post: { documentId, versionId: uuid(99) } }
  await expect(createPostApproval(container).load(submission, interpretation)).resolves.toBeNull()
})

test('requires scoped case ownership, active customer and exact completed task', async () => {
  const approval = createPostApproval(container)
  agencyCase.customerEntityId = uuid(90)
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
  agencyCase.customerEntityId = customerEntityId
  findById.mockResolvedValueOnce({ customerEntityId, isActive: false })
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
  task.completedBy = uuid(90)
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
})

test('cannot replace the saved native G interpretation or original', async () => {
  run.output = { kind: 'research', data: { ...interpretation, recommendedDisposition: 'hold' } }
  await expect(createPostApproval(container).load(submission, interpretation)).resolves.toBeNull()
  run.output = { kind: 'research', data: interpretation }
  run.input = { original: { eventId: 'other', text: 'Other original' } }
  await expect(createPostApproval(container).load(submission, interpretation)).resolves.toBeNull()
})

test('preserves producer replay and stale rejection without approving another version', async () => {
  acceptPost.mockResolvedValueOnce({ status: 'post_accepted', replayed: true })
  await expect(createPostApproval(container).accept(submission, interpretation)).resolves.toMatchObject({ replayed: true })
  acceptPost.mockRejectedValueOnce(new Error('Post is stale'))
  await expect(createPostApproval(container).accept(submission, interpretation)).rejects.toThrow('Post is stale')
  expect(acceptPost.mock.calls[1][0].request.versionId).toBe(versionId)
})
