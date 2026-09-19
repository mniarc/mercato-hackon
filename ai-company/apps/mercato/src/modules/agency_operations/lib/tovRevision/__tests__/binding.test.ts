/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { STRATEGY_PAIR_REVIEW_CONTEXT_KEY, STRATEGY_PAIR_REVIEW_WORKFLOW_ID, STRATEGY_PAIR_RESPONSE_CONTEXT_KEY } from '../../strategyPairReview/contracts'
import { strategyPairEventId } from '../../strategyPairReview/service'
import { CLIENT_TRIAGE_AGENT_ID, inputSchema, type ClientTriageInterpretation } from '../../../agents/client-triage/contract'
import { createTovRevisionBinding, tovFieldsFromFindings } from '../binding'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const caseId = uuid(3), customerEntityId = uuid(4), customerUserId = uuid(5), invitationId = uuid(6), taskId = uuid(7)
const submissionId = uuid(10), workflowId = uuid(11), stepId = uuid(12), runId = uuid(13)
const pair = { strategy: { documentId: uuid(8), versionId: uuid(9) }, tov: { documentId: uuid(15), versionId: uuid(16) } }
const reference = { owner: 'agency_tov', kind: 'KLI-TOV', ...pair.tov, researchRunId: uuid(17), version: '1.0' }
const response = { channel: 'portal' as const, kind: 'message' as const, ...pair, body: 'Please address the reader as you, without changing our strategy.', externalEventId: 'tov-change' }
const interpretation: ClientTriageInterpretation = {
  parts: [{ intent: 'change', summary: 'ToV form of address correction', rationale: 'ToV only', needsClarification: false, recommendedDisposition: 'change' }],
  rationale: 'Exact ToV correction', recommendedDisposition: 'change', responseMessage: null,
  tovDirective: { target: 'tov', instructions: response.body, affectedFields: ['addressingTheReader'] },
}
let submission: AgencyClientSubmission
let task: Record<string, unknown>, run: Record<string, unknown>, invitation: Record<string, unknown>
const getStrategyReview = jest.fn(), findById = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { getStrategyReview }, customerUserService: { findById } }
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  const eventId = strategyPairEventId(taskId, response.externalEventId)
  submission = Object.assign(new AgencyClientSubmission(), { id: submissionId, ...scope, caseId, customerEntityId, submittedByCustomerUserId: customerUserId,
    workflowInstanceId: workflowId, eventId, original: { eventId, text: response.body, documentVersionReference: pair.strategy.versionId, strategyReviewResponse: { ...response, taskId } } })
  task = { id: taskId, ...scope, workflowInstanceId: invitationId, status: 'COMPLETED', assigneeKind: 'customer', assignedTo: customerUserId, completedBy: customerUserId, formData: { [STRATEGY_PAIR_RESPONSE_CONTEXT_KEY]: response } }
  const document = (kind: keyof typeof pair) => ({ caseId, ...pair[kind], version: '1.0', templateId: kind === 'strategy' ? 'WZR-STRATEGIA' : 'WZR-TOV', title: kind, html: `<p>${kind}</p>`, status: 'ready_for_review', isCurrent: true, mode: 'content' })
  invitation = { id: invitationId, ...scope, workflowId: STRATEGY_PAIR_REVIEW_WORKFLOW_ID, deletedAt: null,
    context: { [STRATEGY_PAIR_REVIEW_CONTEXT_KEY]: { caseId, customerEntityId, customerUserId, review: { caseId, strategy: document('strategy'), tov: document('tov') } } } }
  run = { id: runId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', invocationId: stepId, agentId: CLIENT_TRIAGE_AGENT_ID,
    status: 'ok', runtime: 'native', deletedAt: null, input: inputSchema.parse({ original: submission.original }), output: { kind: 'research', data: interpretation } }
  findById.mockResolvedValue({ customerEntityId, isActive: true })
  getStrategyReview.mockResolvedValue({ orderRef: caseId, strategy: pair.strategy, tov: { ...pair.tov, specialistReference: reference }, brief: { versionId: uuid(18) }, tovUsesStrategy: true })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const candidate = entity === AgencyCase ? { id: caseId, ...scope, customerEntityId, deletedAt: null }
      : entity === UserTask ? task : entity === WorkflowInstance ? invitation : entity === AgentRun ? run
        : entity === StepInstance ? { id: stepId, ...scope, workflowInstanceId: workflowId, stepId: 'triage', status: 'COMPLETED' } : null
    return candidate && Object.entries(where as Record<string, unknown>).every(([key, value]) => Reflect.get(candidate, key) === value) ? candidate as never : null
  })
})

test('binds the original completed customer task and saved G run to the exact specialist version', async () => {
  await expect(createTovRevisionBinding(container).load(submission, interpretation)).resolves.toEqual({
    requestId: submissionId, previous: reference, briefVersionId: uuid(18), strategyVersionId: pair.strategy.versionId,
    source: { kind: 'client_change', submissionId, invitationTaskId: taskId, agentRunId: runId }, instructions: response.body, affectedFields: ['addressingTheReader'],
  })
  expect(getStrategyReview).toHaveBeenCalledWith(scope, caseId, pair.strategy.versionId, pair.tov.versionId)
})

test('does not treat a spoofed task body, another contact or a replaced G output as a correction', async () => {
  const binding = createTovRevisionBinding(container)
  task.formData = { [STRATEGY_PAIR_RESPONSE_CONTEXT_KEY]: { ...response, body: 'Different message' } }
  expect(await binding.load(submission, interpretation)).toBeNull()
  task.formData = { [STRATEGY_PAIR_RESPONSE_CONTEXT_KEY]: response }
  findById.mockResolvedValueOnce({ customerEntityId: uuid(90), isActive: true })
  expect(await binding.load(submission, interpretation)).toBeNull()
  run.output = { kind: 'research', data: { ...interpretation, recommendedDisposition: 'hold' } }
  expect(await binding.load(submission, interpretation)).toBeNull()
})

test('only maps exact specialist fields from ToV-only blocking QA; mixed/legacy fields remain employee work', () => {
  const finding = { severity: 'blocking', owner: 'agent', fix_step: '5.3', path: 'KLI-TOV.addressingTheReader', gap: 'Unclear form of address', fix_hint: 'Preserve the recorded audience.' }
  expect(tovFieldsFromFindings([finding])).toEqual({ affectedFields: ['addressingTheReader'], instructions: `${finding.path}: ${finding.gap}\n${finding.fix_hint}` })
  expect(tovFieldsFromFindings([finding, { ...finding, path: 'KLI-STRATEGIA.positioning', fix_step: '5.2' }])).toBeNull()
  expect(tovFieldsFromFindings([{ ...finding, path: 'KLI-TOV.unknown_field' }])).toBeNull()
})
