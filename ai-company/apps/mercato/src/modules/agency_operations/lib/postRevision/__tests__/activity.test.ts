/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createPostRevisionBinding } from '../binding'
import { createPostRevisionActivity } from '../activity'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
jest.mock('../binding', () => ({ createPostRevisionBinding: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [tenantId, organizationId, caseId, submissionId, workflowId, customerEntityId, customerUserId, postVersionId, taskId, analysisId, definitionId, principalId] = Array.from({ length: 12 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }
const request = { orderRef: caseId, postVersionId, originalText: 'Shorten the opening sentence', source: { submissionId, eventId: 'post:source-event', customerUserId, workflowInstanceId: workflowId, invitationTaskId: taskId, agentRunId: uuid(13) } }
const decision = { kind: 'change', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Client answers', message: 'Updating', targets: { caseId, submissionId, documentVersionReference: postVersionId }, effectsApplied: false }
const context = { workflowInstance: { id: workflowId, ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const runPostRevision = jest.fn()
const load = jest.fn()
const container = { resolve: (name: string) => name === 'agencyResearchService' ? { runPostRevision } : {} }
const originalFlag = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
function arrange(postRevision: unknown = { maxCostPln: 2 }, changeScope = 'post_content') {
  jest.mocked(findOneWithDecryption).mockReset()
    .mockResolvedValueOnce({ id: submissionId, caseId, customerEntityId, submittedByCustomerUserId: customerUserId } as never)
    .mockResolvedValueOnce({ id: workflowId, context: { nativeClientTriageInterpretation: { changeScope }, clientTriageResult: { result: decision } } } as never)
    .mockResolvedValueOnce({ id: caseId, workflowInstanceId: analysisId } as never)
    .mockResolvedValueOnce({ id: analysisId, definitionId, workflowId: 'agency_operations.analysis.v1', version: 2 } as never)
    .mockResolvedValueOnce({ id: definitionId, workflowId: 'agency_operations.analysis.v1', version: 2, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } }, definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: 'agency_operations.runAnalysis', args: { policy: { maxCostPln: 999, postRevision } } } }] }] } } as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  jest.mocked(createPostRevisionBinding).mockReturnValue({ load } as never)
  load.mockResolvedValue(request)
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  runPostRevision.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'post_not_current' })
  arrange()
})
afterAll(() => {
  if (originalFlag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = originalFlag
})

test.each(['upstream', 'uncertain'])('keeps a saved %s change blocked without invoking post workers', async (changeScope) => {
  arrange({ maxCostPln: 2 }, changeScope)
  await expect(createPostRevisionActivity(container as never)({}, context)).resolves.toMatchObject({
    status: 'not_ready', reason: changeScope === 'upstream' ? 'post_change_scope_requires_upstream_review' : 'post_change_scope_requires_clarification',
  })
  expect(runPostRevision).not.toHaveBeenCalled()
})

test('passes only the saved response and separately pinned revision budget under native execution identity', async () => {
  await expect(createPostRevisionActivity(container as never)({ originalText: 'forged', maxCostPln: 999 }, context)).resolves.toMatchObject({ status: 'not_ready', reason: 'post_not_current' })
  expect(runPostRevision).toHaveBeenCalledWith({ context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'post_revision' }, request: { ...request, process: { workflowDefinitionId: definitionId, workflowId: 'agency_operations.analysis.v1', version: 2 }, maxCostPln: 2 } })
})

test('missing revision authorization and disabled execution cannot spend the original analysis budget', async () => {
  arrange(null)
  await expect(createPostRevisionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'missing_post_revision_authorization' })
  arrange()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'false'
  await expect(createPostRevisionActivity(container as never)({}, context)).resolves.toMatchObject({ status: 'not_configured', reason: 'execution_disabled' })
  expect(runPostRevision).not.toHaveBeenCalled()
})

test('the persisted G disposition cannot replace the original invited post version', async () => {
  load.mockResolvedValue({ ...request, postVersionId: uuid(90) })
  await expect(createPostRevisionActivity(container as never)({}, context)).rejects.toThrow('saved G disposition')
  expect(runPostRevision).not.toHaveBeenCalled()
})
