/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPostInstructionHandoff } from '../handoff'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, documentId, versionId, taskId, agentRunId, principalId, briefVersionId, strategyVersionId, tovVersionId, qaTaskRunId] = Array.from({ length: 16 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const response = { channel: 'portal', kind: 'approval', plan: { documentId, versionId }, approvePlan: true, selectedTopicId: 'topic-2', taskId, externalEventId: 'click' }
const submission = { id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId, eventId: 'stored-event', original: { eventId: 'stored-event', text: 'Approve plan, choose topic 2', documentVersionReference: versionId, planReviewResponse: response } }
const receipt = { status: 'plan_accepted', orderRef: caseId, replayed: false, record: {
  person: customerUserId, at: '2026-09-19T12:00:00.000Z', scope: 'plan', version: '1.0', documentId, documentVersionId: versionId, approvePlan: true, selectedTopicId: 'topic-2',
  briefVersionId, strategyVersionId, tovVersionId, qaTaskRunId,
  source: { kind: 'agency_plan_acceptance', submissionId, eventId: 'stored-event', workflowInstanceId: workflowId, agentRunId, invitationTaskId: taskId },
} }
const disposition = { kind: 'approve', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Explicit choice', message: 'Recorded', targets: { caseId, submissionId, documentVersionReference: versionId }, effectsApplied: true, acceptance: receipt }
const nativeContext = { userId: uuid(99), workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1', context: { clientTriageResult: 'ignored caller data' } } }
const runPostInstruction = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { runPostInstruction } }
const container = { resolve: (name: string) => services[name] }
const ready = { status: 'ready', orderRef: caseId, planVersionId: versionId, selectedTopicId: 'topic-2', selectionSubmissionId: submissionId,
  taskRunId: uuid(21), instructionDocumentId: uuid(22), instructionVersionId: uuid(23), instructionVersion: '1.0', replayed: false }

function arrange(saved: unknown = disposition, agencyCase: unknown = { id: caseId }) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce(submission as never)
    .mockResolvedValueOnce({ id: workflowId, context: { clientTriageResult: { result: saved } } } as never)
    .mockResolvedValueOnce(agencyCase as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  runPostInstruction.mockResolvedValue(ready)
})

test('calls only the deterministic compiler with the exact saved plan and selection source', async () => {
  await expect(createPostInstructionHandoff(container as never)({ planVersionId: uuid(98), selectedTopicId: 'forged' }, nativeContext)).resolves.toEqual(ready)
  expect(runPostInstruction).toHaveBeenCalledWith({
    context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'post_instruction' },
    request: { orderRef: caseId, planVersionId: versionId, selectionSubmissionId: submissionId },
  })
})

test('unapplied classification is not acceptance authority', async () => {
  arrange({ ...disposition, effectsApplied: false })
  await expect(createPostInstructionHandoff(container as never)({}, nativeContext)).rejects.toThrow('persisted plan approval')
  expect(runPostInstruction).not.toHaveBeenCalled()
})

test.each(['person', 'documentVersionId', 'selectedTopicId', 'source'] as const)('rejects receipt mismatch in %s', async (field) => {
  const changed = { ...receipt.record, [field]: field === 'source' ? { ...receipt.record.source, submissionId: uuid(99) } : field === 'selectedTopicId' ? 'topic-1' : uuid(99) }
  arrange({ ...disposition, acceptance: { ...receipt, record: changed } })
  await expect(createPostInstructionHandoff(container as never)({}, nativeContext)).rejects.toThrow('originating plan/topic selection')
  expect(runPostInstruction).not.toHaveBeenCalled()
})

test('missing case binding or native principal prevents compilation', async () => {
  arrange(disposition, null)
  await expect(createPostInstructionHandoff(container as never)({}, nativeContext)).rejects.toThrow('outside the submission scope')
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(null)
  await expect(createPostInstructionHandoff(container as never)({}, nativeContext)).rejects.toThrow('native workflow execution principal')
  expect(runPostInstruction).not.toHaveBeenCalled()
})

test('passes a superseded-selection refusal through without replacing the original selection', async () => {
  runPostInstruction.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'selection_superseded' })
  await expect(createPostInstructionHandoff(container as never)({}, nativeContext)).resolves.toEqual({ status: 'not_ready', orderRef: caseId, reason: 'selection_superseded' })
  expect(runPostInstruction.mock.calls[0][0].request.selectionSubmissionId).toBe(submissionId)
})
