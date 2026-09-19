/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { STRATEGY_PAIR_REVIEW_CONTEXT_KEY, STRATEGY_PAIR_REVIEW_WORKFLOW_ID, STRATEGY_PAIR_RESPONSE_CONTEXT_KEY } from '../../strategyPairReview/contracts'
import { strategyPairEventId } from '../../strategyPairReview/service'
import { CLIENT_TRIAGE_AGENT_ID, inputSchema, type ClientTriageInterpretation } from '../../../agents/client-triage/contract'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../../../agents/client-triage/workflow'
import { createStrategyPairApproval } from '../service'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const caseId = uuid(3), customerEntityId = uuid(4), customerUserId = uuid(5), invitationId = uuid(6), taskId = uuid(7)
const submissionId = uuid(10), workflowId = uuid(11), stepId = uuid(12), runId = uuid(13), principalId = uuid(14)
const pair = { strategy: { documentId: uuid(8), versionId: uuid(9) }, tov: { documentId: uuid(15), versionId: uuid(16) } }
const response = { channel: 'portal' as const, kind: 'approval' as const, ...pair, approvedDocuments: ['strategy' as const], externalEventId: 'pair-approval' }
const interpretation: ClientTriageInterpretation = {
  parts: [{ intent: 'approval', summary: 'Approves selected strategy', rationale: 'No changes requested', needsClarification: false, recommendedDisposition: 'approve' }],
  rationale: 'Pure selected approval', recommendedDisposition: 'approve', responseMessage: null,
}
let submission: AgencyClientSubmission
let task: Record<string, unknown>
let run: Record<string, unknown>
let invitation: Record<string, unknown>
let agencyCase: Record<string, unknown>
const acceptStrategyPair = jest.fn(), getStrategyPairAcceptance = jest.fn(), findById = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { acceptStrategyPair, getStrategyPairAcceptance }, customerUserService: { findById } }
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  const eventId = strategyPairEventId(taskId, response.externalEventId)
  submission = Object.assign(new AgencyClientSubmission(), {
    id: submissionId, ...scope, caseId, customerEntityId, submittedByCustomerUserId: customerUserId, workflowInstanceId: workflowId, eventId,
    original: { eventId, text: 'I approve only strategy.', documentVersionReference: pair.strategy.versionId, strategyReviewResponse: { ...response, taskId } },
  })
  agencyCase = { id: caseId, ...scope, customerEntityId, deletedAt: null }
  task = { id: taskId, ...scope, workflowInstanceId: invitationId, status: 'COMPLETED', assigneeKind: 'customer', assignedTo: customerUserId, completedBy: customerUserId, formData: { [STRATEGY_PAIR_RESPONSE_CONTEXT_KEY]: response } }
  const documentReview = (kind: keyof typeof pair) => ({ caseId, ...pair[kind], version: '1.0', templateId: kind === 'strategy' ? 'WZR-STRATEGIA' : 'WZR-TOV', title: kind, html: `<p>${kind}</p>`, status: 'ready_for_review', isCurrent: true, mode: 'content' })
  invitation = { id: invitationId, ...scope, workflowId: STRATEGY_PAIR_REVIEW_WORKFLOW_ID, deletedAt: null, context: { [STRATEGY_PAIR_REVIEW_CONTEXT_KEY]: {
    caseId, customerEntityId, customerUserId, review: { caseId, strategy: documentReview('strategy'), tov: documentReview('tov') },
  } } }
  run = { id: runId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', invocationId: stepId, agentId: CLIENT_TRIAGE_AGENT_ID,
    status: 'ok', runtime: 'native', deletedAt: null, input: inputSchema.parse({ original: submission.original }), output: { kind: 'research', data: interpretation } }
  findById.mockResolvedValue({ customerEntityId, isActive: true })
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  acceptStrategyPair.mockResolvedValue({ status: 'recorded', pair, approvedDocuments: ['strategy'], replayed: false })
  getStrategyPairAcceptance.mockResolvedValue({ status: 'partial', remainingDocuments: ['tov'] })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const filter = where as Record<string, unknown>
    const candidate: Record<string, unknown> | null = entity === AgencyCase ? agencyCase : entity === UserTask ? task : entity === AgentRun ? run : entity === StepInstance
      ? { id: stepId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', status: 'COMPLETED' }
      : entity === WorkflowInstance ? filter.id === invitationId ? invitation : { id: workflowId, ...scope, workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, deletedAt: null } : null
    return candidate && Object.entries(filter).every(([key, value]) => candidate[key] === value) ? candidate as never : null
  })
})

test('preserves the selected document and exact shown pair under the native principal', async () => {
  await expect(createStrategyPairApproval(container).accept(submission, interpretation)).resolves.toMatchObject({ status: 'recorded', approvedDocuments: ['strategy'] })
  expect(acceptStrategyPair).toHaveBeenCalledWith({ context: { ...scope, userId: principalId }, request: {
    orderRef: caseId, pair, approvedDocuments: ['strategy'], customerUserId,
    source: { submissionId, eventId: submission.eventId, workflowInstanceId: workflowId, agentRunId: runId, invitationTaskId: taskId },
  } })
})

test('partial approval remains partial in the cumulative producer projection', async () => {
  await expect(createStrategyPairApproval(container).getAcceptance(submission, interpretation)).resolves.toEqual({ status: 'partial', remainingDocuments: ['tov'] })
  expect(getStrategyPairAcceptance).toHaveBeenCalledWith(scope, { orderRef: caseId, strategyVersionId: pair.strategy.versionId, tovVersionId: pair.tov.versionId })
  expect(acceptStrategyPair).not.toHaveBeenCalled()
})

test('passes both documents only when both are explicitly selected in the saved original', async () => {
  const both = { ...response, approvedDocuments: ['strategy', 'tov'] }
  submission.original.strategyReviewResponse = { ...both, taskId }
  task.formData = { [STRATEGY_PAIR_RESPONSE_CONTEXT_KEY]: both }
  run.input = inputSchema.parse({ original: submission.original })
  await createStrategyPairApproval(container).accept(submission, interpretation)
  expect(acceptStrategyPair.mock.calls[0][0].request.approvedDocuments).toEqual(['strategy', 'tov'])
})

test('mixed instructions and an ordinary message cannot authorize selected approval', async () => {
  const mixed = { ...interpretation, parts: [...interpretation.parts, { ...interpretation.parts[0], intent: 'change', recommendedDisposition: 'change' }] }
  await expect(createStrategyPairApproval(container).load(submission, mixed)).resolves.toBeNull()
  submission.original.strategyReviewResponse = { ...pair, taskId, channel: 'portal', kind: 'message', body: 'Please change the headline', externalEventId: response.externalEventId }
  await expect(createStrategyPairApproval(container).load(submission, interpretation)).resolves.toBeNull()
  expect(acceptStrategyPair).not.toHaveBeenCalled()
})

test('rejects changed selections rather than promoting an original strategy-only click to both', async () => {
  submission.original.strategyReviewResponse = { ...response, taskId, approvedDocuments: ['strategy', 'tov'] }
  await expect(createStrategyPairApproval(container).load(submission, interpretation)).resolves.toBeNull()
  expect(acceptStrategyPair).not.toHaveBeenCalled()
})

test('requires the scoped case owner, active contact and exact completed customer task', async () => {
  const approval = createStrategyPairApproval(container)
  agencyCase.customerEntityId = uuid(90)
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
  agencyCase.customerEntityId = customerEntityId
  findById.mockResolvedValueOnce({ customerEntityId, isActive: false })
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
  task.completedBy = uuid(90)
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
})

test('cannot replace the saved native interpretation or its original input', async () => {
  const approval = createStrategyPairApproval(container)
  run.output = { kind: 'research', data: { ...interpretation, recommendedDisposition: 'hold' } }
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
  run.output = { kind: 'research', data: interpretation }
  run.input = { original: { eventId: 'other', text: 'Different original' } }
  await expect(approval.load(submission, interpretation)).resolves.toBeNull()
})

test('preserves producer replay and stale-version rejection without replacing the requested pair', async () => {
  const approval = createStrategyPairApproval(container)
  acceptStrategyPair.mockResolvedValueOnce({ status: 'recorded', pair, approvedDocuments: ['strategy'], replayed: true })
  await expect(approval.accept(submission, interpretation)).resolves.toMatchObject({ replayed: true })
  acceptStrategyPair.mockRejectedValueOnce(new Error('Strategy pair is stale'))
  await expect(approval.accept(submission, interpretation)).rejects.toThrow('Strategy pair is stale')
  expect(acceptStrategyPair.mock.calls[1][0].request.pair).toEqual(pair)
})
