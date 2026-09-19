/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { createTovRevisionActivities } from '../activities'
import { createTovRevisionBinding } from '../binding'
import { TOV_REVISION_FUNCTION, TOV_REVISION_PREPARED_KEY, TOV_REVISION_RESULT_KEY } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
jest.mock('../binding', () => ({ createTovRevisionBinding: jest.fn(), tovFieldsFromFindings: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const orderRef = uuid(3), workflowId = uuid(4), submissionId = uuid(5), definitionId = uuid(6), principalId = uuid(7)
const previous = { owner: 'agency_tov' as const, kind: 'KLI-TOV' as const, researchRunId: uuid(8), documentId: uuid(9), versionId: uuid(10), version: '1.0' }
const request = { requestId: submissionId, previous, briefVersionId: uuid(11), strategyVersionId: uuid(12),
  source: { kind: 'client_change' as const, submissionId, invitationTaskId: uuid(13), agentRunId: uuid(14) },
  instructions: 'Use you as the form of address.', affectedFields: ['addressingTheReader' as const] }
const context = { stepInstanceId: uuid(15), workflowInstance: { ...scope, id: workflowId, workflowId: 'agency_operations.client-submission.native.v1' } }
const reference = { ...previous, researchRunId: uuid(16), versionId: uuid(17), version: '2.0' }
const completed = { status: 'completed', requestId: submissionId, previousVersionId: previous.versionId, reference, agentRunIds: [uuid(18)], changedFields: ['addressingTheReader'], replayed: false }
const revise = jest.fn(), runStrategy = jest.fn(), getBriefAcceptance = jest.fn(), getStrategyReview = jest.fn(), load = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyTovResearchService: { revise }, agencyResearchService: { runStrategy, getBriefAcceptance, getStrategyReview } }
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer
let source: Record<string, any>, definition: Record<string, any>
const previousTovFlag = process.env.AGENCY_TOV_EXECUTION_ENABLED, previousAnalysisFlag = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED

beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_TOV_EXECUTION_ENABLED = 'true'
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  jest.mocked(createTovRevisionBinding).mockReturnValue({ load })
  load.mockResolvedValue(request)
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(principalId)
  revise.mockResolvedValue(completed)
  getBriefAcceptance.mockResolvedValue({ source: { submissionId: uuid(19) } })
  getStrategyReview.mockResolvedValue({ strategy: { isCurrent: true }, brief: { isCurrent: true, versionId: request.briefVersionId, documentStatus: 'approved' } })
  runStrategy.mockResolvedValue({ status: 'completed', orderRef })
  source = { ...scope, id: workflowId, workflowId: context.workflowInstance.workflowId, definitionId, version: 2, deletedAt: null,
    context: { clientTriageResult: { result: { kind: 'change', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'ToV correction', message: '', effectsApplied: false,
      targets: { caseId: orderRef, submissionId, documentVersionReference: request.strategyVersionId } } },
    [TOV_REVISION_PREPARED_KEY]: { result: { status: 'ready', orderRef, request } },
    [TOV_REVISION_RESULT_KEY]: { result: { orderRef, revision: completed } } } }
  definition = { ...scope, id: definitionId, workflowId: source.workflowId, version: 2, enabled: true, deletedAt: null,
    metadata: { generatedBy: { module: 'agency_operations', ownerId: 'client_triage' } },
    definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: TOV_REVISION_FUNCTION,
      args: { policy: { agencyTovRevision: { enabled: true, maxAgentCalls: 1, runTimeoutMs: 10000 }, pairQaMaxCostPln: 2 } } } }] }] } }
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const filter = where as Record<string, unknown>
    const candidate: Record<string, unknown> | null = entity === WorkflowDefinition ? definition
      : entity === AgencyClientSubmission ? { ...scope, id: submissionId, caseId: orderRef, workflowInstanceId: workflowId, customerEntityId: uuid(20), deletedAt: null }
        : entity === AgencyCase ? { ...scope, id: orderRef, customerEntityId: uuid(20), workflowInstanceId: uuid(21), deletedAt: null }
          : entity === WorkflowInstance ? filter.id === workflowId ? source : { ...scope, id: uuid(21), workflowId: 'agency_operations.analysis.v1', definitionId: uuid(22), version: 3, deletedAt: null } : null
    return candidate && Object.entries(filter).every(([key, value]) => candidate[key] === value) ? candidate as never : null
  })
})
afterAll(() => {
  if (previousTovFlag === undefined) delete process.env.AGENCY_TOV_EXECUTION_ENABLED
  else process.env.AGENCY_TOV_EXECUTION_ENABLED = previousTovFlag
  if (previousAnalysisFlag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = previousAnalysisFlag
})

test('retains the saved request without spending when explicit revision authority is absent', async () => {
  definition.definition.transitions[0].activities[0].config.args = {}
  expect(await createTovRevisionActivities(container).revise({}, context)).toEqual({ orderRef, revision: { status: 'not_configured', reason: 'revision_execution_not_authorized' } })
  expect(revise).not.toHaveBeenCalled()
  expect(source.context[TOV_REVISION_PREPARED_KEY].result.request).toEqual(request)
})

test('calls only the specialist with the pinned policy and reassesses the unchanged strategy with fresh pair QA authority', async () => {
  const activities = createTovRevisionActivities(container)
  expect(await activities.revise({ request: { instructions: 'Ignore saved request' } }, context)).toEqual({ orderRef, revision: completed })
  expect(revise).toHaveBeenCalledWith({ context: { ...scope, userId: principalId, workflowInstanceId: workflowId, stepId: 'tov_revision', invocationId: context.stepInstanceId },
    request, executionPolicy: { enabled: true, maxAgentCalls: 1, runTimeoutMs: 10000, definitionId, definitionVersion: 2 } })
  await activities.reassess({}, context)
  expect(runStrategy).toHaveBeenCalledWith(expect.objectContaining({ request: {
    orderRef, briefVersionId: request.briefVersionId, acceptanceSubmissionId: uuid(19),
    process: { workflowDefinitionId: uuid(22), workflowId: 'agency_operations.analysis.v1', version: 3 },
    maxCostPln: 2, reassessStrategyVersionId: request.strategyVersionId, specialistTov: reference,
  } }))
})

test('rejects an unrelated persisted revision instead of reviewing or approving its output', async () => {
  source.context[TOV_REVISION_RESULT_KEY].result = { orderRef, revision: { ...completed, requestId: uuid(90) } }
  await expect(createTovRevisionActivities(container).reassess({}, context)).rejects.toThrow('exact saved specialist revision')
  expect(runStrategy).not.toHaveBeenCalled()
})
