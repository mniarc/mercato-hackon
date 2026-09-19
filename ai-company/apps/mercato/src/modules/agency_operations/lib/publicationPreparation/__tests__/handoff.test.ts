/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPublicationPreparationHandoff } from '../handoff'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, documentId, versionId, taskId, agentRunId, principalId] = Array.from({ length: 12 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const response = { channel: 'portal', kind: 'approval', post: { documentId, versionId }, approveContent: true, taskId, externalEventId: 'click' }
const submission = { id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId, eventId: 'stored-event', original: { eventId: 'stored-event', text: 'Approve this content', documentVersionReference: versionId, postReviewResponse: response } }
const receipt = { status: 'post_accepted', orderRef: caseId, replayed: false, record: {
  person: customerUserId, at: '2026-09-19T12:00:00.000Z', scope: 'post_content', version: '1.0', documentId, documentVersionId: versionId, qaTaskRunId: uuid(15),
  source: { kind: 'agency_post_acceptance', submissionId, eventId: 'stored-event', workflowInstanceId: workflowId, agentRunId, invitationTaskId: taskId },
} }
const disposition = { kind: 'approve', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Pure content approval', message: 'Recorded', targets: { caseId, submissionId, documentVersionReference: versionId }, effectsApplied: true, acceptance: receipt }
const nativeContext = { userId: uuid(99), workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1', context: { clientTriageResult: 'caller claims ignored' } } }
const preparePublication = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { preparePublication } }
const container = { resolve: (name: string) => services[name] }
const prepared = { status: 'prepared', orderRef: caseId, postVersionId: versionId, acceptanceSubmissionId: submissionId,
  taskRunId: uuid(20), instructionVersionId: uuid(21), configVersionId: uuid(22), contentHash: 'exact-content', missingGates: ['destination', 'consent'],
  contentApproval: 'valid', publicationConsent: 'missing', canSend: false, replayed: false }

function arrange(saved: unknown = disposition) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce(submission as never)
    .mockResolvedValueOnce({ id: workflowId, context: { clientTriageResult: { result: saved } } } as never)
    .mockResolvedValueOnce({ id: caseId } as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  preparePublication.mockResolvedValue(prepared)
})

test('prepares and replays exact accepted content while retaining missing publication consent', async () => {
  const handoff = createPublicationPreparationHandoff(container as never)
  await expect(handoff({ postVersionId: uuid(99), publicationConsent: 'valid' }, nativeContext)).resolves.toEqual(prepared)
  expect(preparePublication).toHaveBeenCalledWith({ context: { ...scope, userId: principalId }, request: {
    orderRef: caseId, postVersionId: versionId, acceptanceSubmissionId: submissionId,
  } })
  expect(jest.mocked(findOneWithDecryption).mock.calls[2][2]).toEqual({ ...scope, id: caseId, customerEntityId, deletedAt: null })
  arrange()
  preparePublication.mockResolvedValue({ ...prepared, replayed: true })
  await expect(handoff({}, nativeContext)).resolves.toMatchObject({ replayed: true, canSend: false, publicationConsent: 'missing' })
})

test('an unapplied recommendation or different post receipt cannot authorize preparation', async () => {
  arrange({ ...disposition, effectsApplied: false })
  await expect(createPublicationPreparationHandoff(container as never)({}, nativeContext)).rejects.toThrow('persisted post-content acceptance')
  arrange({ ...disposition, acceptance: { ...receipt, record: { ...receipt.record, documentVersionId: uuid(99) } } })
  await expect(createPublicationPreparationHandoff(container as never)({}, nativeContext)).rejects.toThrow('originating content decision')
  expect(preparePublication).not.toHaveBeenCalled()
})

test('caller identity cannot replace a missing native principal', async () => {
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(null)
  await expect(createPublicationPreparationHandoff(container as never)({}, nativeContext)).rejects.toThrow('native workflow execution principal')
  expect(preparePublication).not.toHaveBeenCalled()
})

test('producer refusal remains non-executing and does not replace the accepted version', async () => {
  preparePublication.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'post_not_current' })
  await expect(createPublicationPreparationHandoff(container as never)({}, nativeContext)).resolves.toEqual({ status: 'not_ready', orderRef: caseId, reason: 'post_not_current' })
  expect(preparePublication.mock.calls[0][0].request.postVersionId).toBe(versionId)
})
