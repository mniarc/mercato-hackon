/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createBriefRevisionBinding } from '../binding'
import { createBriefRevisionActivity } from '../activity'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
jest.mock('../binding', () => ({ createBriefRevisionBinding: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, briefVersionId, taskId, analysisId, definitionId, principalId] = Array.from({ length: 12 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const request = { orderRef: caseId, briefVersionId, originalText: 'Audience: agency owners', source: { submissionId, eventId: 'brief:source-event', customerUserId, workflowInstanceId: workflowId, invitationTaskId: taskId } }
const decision = { kind: 'change', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Client answers', message: 'Updating', targets: { caseId, submissionId, documentVersionReference: briefVersionId }, effectsApplied: false }
const context = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const runBriefRevision = jest.fn()
const load = jest.fn()
const container = { resolve: (name: string) => name === 'agencyResearchService' ? { runBriefRevision } : {} }
const originalFlag = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
function arrange(briefRevision: unknown = { maxCostPln: 2 }) {
  jest.mocked(findOneWithDecryption).mockReset()
    .mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId } as never)
    .mockResolvedValueOnce({ id: workflowId, context: { nativeClientTriageInterpretation: {}, clientTriageResult: { result: decision } } } as never)
    .mockResolvedValueOnce({ id: caseId, workflowInstanceId: analysisId } as never)
    .mockResolvedValueOnce({ id: analysisId, definitionId, workflowId: 'agency_operations.analysis.v1', version: 2 } as never)
    .mockResolvedValueOnce({ metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } }, definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: 'agency_operations.runAnalysis', args: { policy: { maxCostPln: 999, briefRevision } } } }] }] } } as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  jest.mocked(createBriefRevisionBinding).mockReturnValue({ load } as never)
  load.mockResolvedValue(request)
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  runBriefRevision.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'brief_not_current' })
  arrange()
})
afterAll(() => {
  if (originalFlag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = originalFlag
})

test('passes only the saved response and separately pinned revision budget under native execution identity', async () => {
  await expect(createBriefRevisionActivity(container as never)({ originalText: 'forged', maxCostPln: 999 }, context)).resolves.toMatchObject({ status: 'not_ready', reason: 'brief_not_current' })
  expect(runBriefRevision).toHaveBeenCalledWith({ context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'brief_revision' }, request: { ...request, maxCostPln: 2 } })
})

test('missing revision authorization and disabled execution cannot spend the original analysis budget', async () => {
  arrange(null)
  await expect(createBriefRevisionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_brief_revision_authorization' })
  arrange()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'false'
  await expect(createBriefRevisionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'execution_disabled' })
  expect(runBriefRevision).not.toHaveBeenCalled()
})

test('the persisted G disposition cannot replace the original invited brief version', async () => {
  load.mockResolvedValue({ ...request, briefVersionId: uuid(90) })
  await expect(createBriefRevisionActivity(container as never)({}, context)).rejects.toThrow('saved G disposition')
  expect(runBriefRevision).not.toHaveBeenCalled()
})
