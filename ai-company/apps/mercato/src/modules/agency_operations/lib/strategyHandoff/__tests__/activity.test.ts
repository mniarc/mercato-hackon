import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createStrategyReadinessHandoff } from '../activity'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const find = jest.mocked(findOneWithDecryption)
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerId, customerUserId, versionId, documentId, analysisId, definitionId] = Array.from({ length: 11 }, (_, i) => uuid(i + 1))
const scope = { tenantId, organizationId }
const submission = { id: submissionId, caseId, customerEntityId: customerId, submittedByCustomerUserId: customerUserId, eventId: 'approval-event' }
const receipt = {
  status: 'accepted', orderRef: caseId, documentId, versionId, version: '1.0',
  acceptedAt: '2026-09-19T12:00:00.000Z', customerUserId, replayed: false,
  source: { kind: 'agency_brief_acceptance', submissionId, eventId: 'approval-event', workflowInstanceId: workflowId, agentRunId: uuid(12), invitationTaskId: uuid(13) },
}
const disposition = {
  kind: 'approve', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Explicit acceptance', message: 'Accepted',
  targets: { caseId, submissionId, documentVersionReference: versionId }, effectsApplied: true, acceptance: receipt,
}
const nativeContext = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1', context: { forged: 'ignored' } } }
const analysis = { id: analysisId, workflowId: 'agency_operations.analysis.v1', definitionId, version: 3 }
const readiness = { status: 'ready', orderRef: caseId, analysis: { setHash: 'exact-frozen-set' } }
const getStrategyReadiness = jest.fn()
const container = { resolve: (key: string) => {
  if (key === 'em') return {}
  if (key === 'agencyResearchService') return { getStrategyReadiness }
  throw new Error(`Unexpected dependency ${key}`)
} }

function arrange(saved: unknown = disposition, agencyCase: unknown = { id: caseId, workflowInstanceId: analysisId }, originatingAnalysis: unknown = analysis) {
  find.mockReset().mockResolvedValueOnce(submission as never)
    .mockResolvedValueOnce({ context: { clientTriageResult: { result: saved } } } as never)
    .mockResolvedValueOnce(agencyCase as never).mockResolvedValueOnce(originatingAnalysis as never)
  getStrategyReadiness.mockReset().mockResolvedValue(readiness)
}
beforeEach(() => arrange())

test('hands exact persisted acceptance and originating analysis definition to readiness, ignoring caller references', async () => {
  await expect(createStrategyReadinessHandoff(container as never)({ process: { workflowId: 'forged' }, briefVersionId: 'forged' }, nativeContext)).resolves.toEqual(readiness)
  expect(getStrategyReadiness).toHaveBeenCalledWith(scope, {
    orderRef: caseId, briefVersionId: versionId, acceptanceSubmissionId: submissionId,
    process: { workflowDefinitionId: definitionId, workflowId: analysis.workflowId, version: 3 },
  })
  expect(find.mock.calls.map((call) => call[2])).toEqual([
    { ...scope, workflowInstanceId: workflowId, deletedAt: null },
    { ...scope, id: workflowId, workflowId: nativeContext.workflowInstance.workflowId },
    { ...scope, id: caseId, customerEntityId: customerId, deletedAt: null },
    { ...scope, id: analysisId, workflowId: 'agency_operations.analysis.v1' },
  ])
})

test('does not treat an unapplied recommendation as persisted acceptance', async () => {
  arrange({ ...disposition, effectsApplied: false })
  await expect(createStrategyReadinessHandoff(container as never)({}, nativeContext)).rejects.toThrow('persisted brief acceptance')
  expect(getStrategyReadiness).not.toHaveBeenCalled()
})

test('rejects acceptance from a different submission', async () => {
  arrange({ ...disposition, acceptance: { ...receipt, source: { ...receipt.source, submissionId: uuid(99) } } })
  await expect(createStrategyReadinessHandoff(container as never)({}, nativeContext)).rejects.toThrow('originating submission')
  expect(getStrategyReadiness).not.toHaveBeenCalled()
})

test.each([null, { id: caseId, workflowInstanceId: null }])('missing or wrong-case ownership cannot grant readiness: %j', async (agencyCase) => {
  arrange(disposition, agencyCase)
  const handoff = createStrategyReadinessHandoff(container as never)({}, nativeContext)
  if (agencyCase === null) await expect(handoff).rejects.toThrow('outside the submission scope')
  else await expect(handoff).resolves.toEqual({ status: 'not_ready', orderRef: caseId, reason: 'missing_process_configuration' })
  expect(getStrategyReadiness).not.toHaveBeenCalled()
})

test('a deterministic intake workflow does not stand in for a configured analysis process', async () => {
  arrange(disposition, { id: caseId, workflowInstanceId: analysisId }, null)
  await expect(createStrategyReadinessHandoff(container as never)({}, nativeContext)).resolves.toEqual({
    status: 'not_ready', orderRef: caseId, reason: 'missing_process_configuration',
  })
  expect(getStrategyReadiness).not.toHaveBeenCalled()
})

test('returns the producer not-ready reason without fabricating readiness or launching execution', async () => {
  getStrategyReadiness.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'analysis_requires_review', templateId: 'WZR-AUDYT' })
  await expect(createStrategyReadinessHandoff(container as never)({}, nativeContext)).resolves.toEqual({
    status: 'not_ready', orderRef: caseId, reason: 'analysis_requires_review', templateId: 'WZR-AUDYT',
  })
})
