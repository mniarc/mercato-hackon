/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createStrategyPairContinuation } from '../handoff'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, strategyId, strategyVersionId, tovId, tovVersionId, analysisId, definitionId, taskId, agentRunId, principalId, briefVersionId] = Array.from({ length: 17 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const pair = { strategy: { documentId: strategyId, versionId: strategyVersionId }, tov: { documentId: tovId, versionId: tovVersionId } }
const response = { channel: 'portal', kind: 'approval', ...pair, approvedDocuments: ['strategy'], taskId, externalEventId: 'click' }
const submission = { id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId, eventId: 'stored-event', original: { eventId: 'stored-event', text: 'Approve strategy', documentVersionReference: strategyVersionId, strategyReviewResponse: response } }
const receipt = {
  status: 'recorded', orderRef: caseId, pair, approvedDocuments: ['strategy'], replayed: false,
  records: [{ person: customerUserId, at: '2026-09-19T12:00:00.000Z', scope: 'strategy', version: '1.0', documentVersionId: strategyVersionId, briefVersionId, pair, approvedDocuments: ['strategy'],
    source: { kind: 'agency_strategy_pair_acceptance', submissionId, eventId: 'stored-event', workflowInstanceId: workflowId, agentRunId, invitationTaskId: taskId } }],
}
const disposition = { kind: 'approve', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Selected approval', message: 'Recorded', targets: { caseId, submissionId, documentVersionReference: strategyVersionId }, effectsApplied: true, acceptance: receipt }
const nativeContext = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1', context: { clientTriageResult: 'ignored caller data' } } }
const analysis = { id: analysisId, workflowId: 'agency_operations.analysis.v1', definitionId, version: 4 }
const getStrategyPairAcceptance = jest.fn(), getPlanningReadiness = jest.fn(), invite = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { getStrategyPairAcceptance, getPlanningReadiness }, agencyStrategyPairReviewService: { invite } }
const container = { resolve: (name: string) => services[name] }
const cumulative = { status: 'partial', orderRef: caseId, pair, remainingDocuments: ['tov'] }
const followUpTask = { workflowInstanceId: uuid(30), taskId: uuid(31), replayed: false }

function arrange(saved: unknown = disposition, originatingAnalysis: unknown = analysis) {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce(submission as never)
    .mockResolvedValueOnce({ context: { clientTriageResult: { result: saved } } } as never)
    .mockResolvedValueOnce({ id: caseId, workflowInstanceId: analysisId } as never)
    .mockResolvedValueOnce(originatingAnalysis as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  arrange()
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  getStrategyPairAcceptance.mockResolvedValue(cumulative)
  getPlanningReadiness.mockResolvedValue({ status: 'ready', orderRef: caseId })
  invite.mockResolvedValue(followUpTask)
})

test('partial decision creates only a same-pair follow-up through the public native invitation service', async () => {
  await expect(createStrategyPairContinuation(container as never)({ forged: 'ignored' }, nativeContext)).resolves.toEqual({ status: 'partial', orderRef: caseId, cumulative, followUpTask })
  expect(invite).toHaveBeenCalledWith({ ...scope, userId: principalId, caseId, strategyVersionId, tovVersionId })
  expect(getPlanningReadiness).not.toHaveBeenCalled()
})

test('accepted pair hands the actual case analysis definition to readiness, never another invitation', async () => {
  const accepted = { ...cumulative, status: 'accepted', remainingDocuments: [] }
  getStrategyPairAcceptance.mockResolvedValue(accepted)
  const result = await createStrategyPairContinuation(container as never)({ process: { workflowId: 'forged' } }, nativeContext)
  expect(result).toEqual({ status: 'accepted', orderRef: caseId, cumulative: accepted, planningReadiness: { status: 'ready', orderRef: caseId } })
  expect(getPlanningReadiness).toHaveBeenCalledWith(scope, { orderRef: caseId, strategyVersionId, tovVersionId, process: { workflowDefinitionId: definitionId, workflowId: analysis.workflowId, version: 4 } })
  expect(invite).not.toHaveBeenCalled()
})

test('no actual analysis process is passed as missing configuration, not a guessed process', async () => {
  arrange(disposition, null)
  getStrategyPairAcceptance.mockResolvedValue({ ...cumulative, status: 'accepted', remainingDocuments: [] })
  getPlanningReadiness.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'missing_process_configuration' })
  await expect(createStrategyPairContinuation(container as never)({}, nativeContext)).resolves.toMatchObject({ status: 'accepted', planningReadiness: { status: 'not_ready', reason: 'missing_process_configuration' } })
  expect(getPlanningReadiness).toHaveBeenCalledWith(scope, { orderRef: caseId, strategyVersionId, tovVersionId })
})

test('stale or blocked cumulative state remains an explicit reason without creating a follow-up', async () => {
  const stale = { status: 'not_ready', orderRef: caseId, reason: 'pair_not_current' }
  getStrategyPairAcceptance.mockResolvedValue(stale)
  await expect(createStrategyPairContinuation(container as never)({}, nativeContext)).resolves.toEqual({ status: 'not_ready', orderRef: caseId, cumulative: stale, reason: stale.reason })
  expect(invite).not.toHaveBeenCalled()
  expect(getPlanningReadiness).not.toHaveBeenCalled()
})

test('unapplied model recommendation cannot continue approval', async () => {
  arrange({ ...disposition, effectsApplied: false })
  await expect(createStrategyPairContinuation(container as never)({}, nativeContext)).rejects.toThrow('persisted selected-pair decision')
  expect(getStrategyPairAcceptance).not.toHaveBeenCalled()
})

test.each(['person', 'documentVersionId', 'submissionId'] as const)('rejects a receipt whose %s does not belong to this original', async (field) => {
  const originalRecord = receipt.records[0]
  const changed = field === 'submissionId' ? { ...originalRecord, source: { ...originalRecord.source, submissionId: uuid(99) } } : { ...originalRecord, [field]: uuid(99) }
  arrange({ ...disposition, acceptance: { ...receipt, records: [changed] } })
  await expect(createStrategyPairContinuation(container as never)({}, nativeContext)).rejects.toThrow('originating submission')
  expect(getStrategyPairAcceptance).not.toHaveBeenCalled()
})
