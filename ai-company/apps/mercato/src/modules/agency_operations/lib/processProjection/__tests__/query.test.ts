/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { filterVisibleTasks, resolveTaskVisibilityForRequest } from '@open-mercato/core/modules/workflows/lib/task-visibility-request'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../../../agents/client-triage/workflow'
import { projectAnalysisProcess, projectSubmissionProcess, readCaseProcess } from '../query'
import { AGENCY_ANALYSIS_WORKFLOW_ID, AGENCY_ANALYSIS_RESULT_KEY } from '../../analysisProcess/workflow'
import { STRATEGY_EXECUTION_RESULT_KEY } from '../../strategyExecution/contracts'
import { PLANNING_EXECUTION_RESULT_KEY } from '../../planningExecution/contracts'
import { POST_EXECUTION_RESULT_KEY, POST_EXECUTION_FUNCTION } from '../../postExecution/contracts'
import { BRIEF_REVISION_RESULT_KEY } from '../../briefRevision/contracts'
import { POST_REVISION_RESULT_KEY } from '../../postRevision/contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/task-visibility-request', () => ({
  collectTaskEntityTypesFromTasks: jest.fn(() => []), filterVisibleTasks: jest.fn(), resolveTaskVisibilityForRequest: jest.fn(),
}))

const tenantId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000002'
const caseId = '00000000-0000-4000-8000-000000000003'
const submissionId = '00000000-0000-4000-8000-000000000004'
const instanceId = '00000000-0000-4000-8000-000000000005'
const customerEntityId = '00000000-0000-4000-8000-000000000006'
const scope = { tenantId, organizationId }
const em = {}
const container = { resolve: () => em } as unknown as AppContainer
const employee = { ...scope, userId: 'employee', roleNames: ['employee'] }
const submission = Object.assign(new AgencyClientSubmission(), {
  id: submissionId, caseId, customerEntityId, ...scope, eventId: 'submission-event',
  createdAt: new Date('2026-09-19T10:00:00Z'), original: { eventId: 'submission-event', text: 'Please help' }, workflowInstanceId: instanceId,
})
function workflow(step: string, context: Record<string, unknown> = {}, status = 'PAUSED') {
  return Object.assign(new WorkflowInstance(), {
    id: instanceId, ...scope, workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID,
    version: 2, status, currentStepId: step, context,
  })
}

beforeEach(() => jest.clearAllMocks())

const postCorrection = Object.assign(new AgencyClientSubmission(), submission, {
  original: { ...submission.original, text: 'Shorten the opening.', postReviewResponse: {
    channel: 'portal', kind: 'message', taskId: customerEntityId, externalEventId: 'post-change',
    post: { documentId: tenantId, versionId: organizationId }, body: 'Shorten the opening.',
  } },
})

test('retains the exact post correction configuration hold without inventing an employee task', () => {
  const revision = { status: 'not_configured', orderRef: caseId, reason: 'missing_post_revision_authorization' }
  const blocked = { status: 'blocked', orderRef: caseId, invitation: null, reason: revision.reason, nextAction: 'review_configuration', revision }
  const saved = workflow('post_revision_waiting', { [POST_REVISION_RESULT_KEY]: { result: revision }, agencyPostRevisionInvitation: { result: blocked } })
  const projected = projectSubmissionProcess(postCorrection, saved, [])
  expect(projected.postRevision).toEqual(revision)
  expect(projected.postRevisionHandoff).toEqual(blocked)
  expect(projected.original.postReviewResponse?.body).toBe('Shorten the opening.')
  expect(projected.workflow?.waitingFor).toBeNull()
  expect(projected.tasks).toEqual([])
  saved.context = { [POST_REVISION_RESULT_KEY]: { result: { ...revision, orderRef: customerEntityId } }, agencyPostRevisionInvitation: { result: blocked } }
  expect(projectSubmissionProcess(postCorrection, saved, []).postRevision).toBeNull()
  expect(projectSubmissionProcess(postCorrection, saved, []).postRevisionHandoff).toBeNull()
  saved.context = { [POST_REVISION_RESULT_KEY]: { result: revision }, agencyPostRevisionInvitation: { result: { ...blocked, revision: { ...revision, reason: 'execution_disabled' } } } }
  expect(projectSubmissionProcess(postCorrection, saved, []).postRevisionHandoff).toBeNull()
})

test('projects a post revision invitation only for the matching correction and new reviewable version', () => {
  const revision = { status: 'completed', orderRef: caseId, submissionId, previousPostVersionId: organizationId,
    instructionVersionId: tenantId, postVersionId: customerEntityId, qaTaskRunId: instanceId,
    qaVerdict: 'pass_for_draft', readyForReview: true, taskRunIds: [instanceId], documentVersionIds: [customerEntityId], agentRunIds: [], spentPln: 0.1 }
  const invited = { status: 'invited', orderRef: caseId, versionId: customerEntityId,
    invitation: { workflowInstanceId: instanceId, taskId: tenantId, replayed: false } }
  const saved = workflow('post_revision_decision', { [POST_REVISION_RESULT_KEY]: { result: revision }, agencyPostRevisionInvitation: { result: invited } })
  expect(projectSubmissionProcess(postCorrection, saved, []).postRevisionHandoff).toEqual(invited)
  saved.context = { [POST_REVISION_RESULT_KEY]: { result: { ...revision, previousPostVersionId: tenantId } }, agencyPostRevisionInvitation: { result: invited } }
  expect(projectSubmissionProcess(postCorrection, saved, []).postRevisionHandoff).toBeNull()
  saved.context = { [POST_REVISION_RESULT_KEY]: { result: revision }, agencyPostRevisionInvitation: { result: { ...invited, versionId: tenantId } } }
  expect(projectSubmissionProcess(postCorrection, saved, []).postRevisionHandoff).toBeNull()
})

test('projects actual brief revision invitation or hold only with its scoped saved revision', () => {
  const revision = { status: 'not_configured', orderRef: caseId, reason: 'missing_brief_revision_authorization' }
  const blocked = { status: 'blocked', invitation: null, reason: revision.reason, revision }
  const saved = workflow('brief_revision_held', { [BRIEF_REVISION_RESULT_KEY]: { result: revision }, agencyBriefRevisionInvitation: { result: blocked } })
  expect(projectSubmissionProcess(submission, saved, []).briefRevisionHandoff).toEqual(blocked)
  saved.context = { [BRIEF_REVISION_RESULT_KEY]: { result: { ...revision, orderRef: customerEntityId } }, agencyBriefRevisionInvitation: { result: blocked } }
  expect(projectSubmissionProcess(submission, saved, []).briefRevisionHandoff).toBeNull()
  const completed = { status: 'completed', orderRef: caseId, submissionId, previousBriefVersionId: tenantId, briefVersionId: organizationId,
    findingsVersionId: null, qaTaskRunId: instanceId, qaVerdict: 'ready_for_approval', analysisQaTaskRunId: null, freezeTaskRunId: null,
    answeredQuestionIds: [], unresolvedQuestionIds: [], questions: [], taskRunIds: [instanceId], documentVersionIds: [organizationId], agentRunIds: [], spentPln: 1 }
  const invited = { status: 'invited', versionId: organizationId, invitation: { workflowInstanceId: instanceId, taskId: customerEntityId, replayed: false }, questions: [] }
  saved.context = { [BRIEF_REVISION_RESULT_KEY]: { result: completed }, agencyBriefRevisionInvitation: { result: invited } }
  expect(projectSubmissionProcess(submission, saved, []).briefRevisionHandoff).toEqual(invited)
  saved.context = { [BRIEF_REVISION_RESULT_KEY]: { result: { ...completed, submissionId: customerEntityId } }, agencyBriefRevisionInvitation: { result: invited } }
  expect(projectSubmissionProcess(submission, saved, []).briefRevisionHandoff).toBeNull()
})

test('does not query submission or native records for a case outside employee scope', async () => {
  jest.mocked(findOneWithDecryption).mockResolvedValue(null)
  expect(await readCaseProcess(container, caseId, employee)).toBeNull()
  expect(findOneWithDecryption).toHaveBeenCalledWith(em, AgencyCase, { id: caseId, ...scope, deletedAt: null }, undefined, scope)
  expect(findWithDecryption).not.toHaveBeenCalled()
})

test('queries only case-owned submissions and linked scoped workflows, applying native task visibility', async () => {
  const visible = Object.assign(new UserTask(), { id: 'visible', workflowInstanceId: instanceId, status: 'PENDING' })
  const hidden = Object.assign(new UserTask(), { id: 'hidden', workflowInstanceId: instanceId, status: 'PENDING' })
  jest.mocked(findOneWithDecryption).mockResolvedValue({ customerEntityId } as never)
  jest.mocked(findWithDecryption).mockImplementation(async (_em, entity) => {
    if (entity === AgencyClientSubmission) return [submission] as never
    if (entity === WorkflowInstance) return [workflow('triage_exception')] as never
    if (entity === UserTask) return [visible, hidden] as never
    return []
  })
  jest.mocked(resolveTaskVisibilityForRequest).mockResolvedValue({} as never)
  jest.mocked(filterVisibleTasks).mockReturnValue([visible])

  const result = await readCaseProcess(container, caseId, employee)

  expect(findWithDecryption).toHaveBeenCalledWith(em, AgencyClientSubmission, {
    caseId, customerEntityId, ...scope, deletedAt: null,
  }, { orderBy: { createdAt: 'desc', id: 'desc' }, limit: 101 }, scope)
  expect(findWithDecryption).toHaveBeenCalledWith(em, WorkflowInstance, { id: { $in: [instanceId] }, ...scope, deletedAt: null }, undefined, scope)
  expect(findWithDecryption).toHaveBeenCalledWith(em, UserTask, {
    workflowInstanceId: { $in: [instanceId] }, ...scope, status: { $in: ['PENDING', 'IN_PROGRESS'] },
  }, { orderBy: { createdAt: 'desc' } }, scope)
  expect(resolveTaskVisibilityForRequest).toHaveBeenCalledWith(expect.objectContaining({
    auth: { userId: 'employee', tenantId, roleNames: ['employee'] }, organizationIds: [organizationId], aclOrganizationId: organizationId,
  }))
  expect(result?.submissions[0].tasks.map((task) => task.id)).toEqual(['visible'])
  expect(result?.submissions[0].workflow).toMatchObject({ waitingFor: 'employee', status: 'PAUSED', version: 2 })
})

test('clarification waits are derived from active native records, never old saved dispositions', () => {
  expect(projectSubmissionProcess(submission, workflow('client_reply'), []).workflow?.waitingFor).toBe('client')
  expect(projectSubmissionProcess(submission, workflow('reply_received', {}, 'COMPLETED'), []).workflow?.waitingFor).toBeNull()
  expect(projectSubmissionProcess(submission, workflow('client_reply', {}, 'CANCELLED'), []).workflow?.waitingFor).toBeNull()
})

test('unsupported business routing remains explicitly unapplied even when its native workflow ended', () => {
  const interpretation = {
    parts: [{ intent: 'hold', summary: 'Pause request', rationale: 'Client asked', needsClarification: false, recommendedDisposition: 'hold' }],
    rationale: 'Client asked', recommendedDisposition: 'hold', responseMessage: null,
  }
  const projected = projectSubmissionProcess(submission, workflow('unapplied', { nativeClientTriageInterpretation: interpretation }, 'COMPLETED'), [])
  expect(projected.workflow).toMatchObject({ status: 'COMPLETED', routeUnapplied: true, waitingFor: null })
  expect(projected.interpretation).toEqual(interpretation)
  expect(projected.disposition).toBeNull()
})

test('missing workflow and malformed saved result never imply a successful agent run', () => {
  expect(projectSubmissionProcess(submission, null, []).workflow).toBeNull()
  const result = projectSubmissionProcess(submission, workflow('triage', { clientTriageResult: { result: { kind: 'answer' } } }), [])
  expect(result.disposition).toBeNull()
  expect(result.interpretation).toBeNull()
})

test('retains a case-owned blocked planning handoff without inventing an employee task', () => {
  const blocked = { status: 'blocked', orderRef: caseId, invitation: null, reason: 'execution_disabled', nextAction: 'review_configuration' }
  const saved = workflow('planning_waiting', { agencyPlanInvitation: { result: blocked } })
  const result = projectSubmissionProcess(submission, saved, [])
  expect(result.planningReviewHandoff).toEqual(blocked)
  expect(result.workflow?.waitingFor).toBeNull()
  expect(result.tasks).toEqual([])
  saved.context = { agencyPlanInvitation: { result: { ...blocked, orderRef: customerEntityId } } }
  expect(projectSubmissionProcess(submission, saved, []).planningReviewHandoff).toBeNull()
  saved.context = { agencyPlanInvitation: { result: blocked } }
  saved.workflowId = 'agency_operations.client-submission.scaffold.v1'
  expect(projectSubmissionProcess(submission, saved, []).planningReviewHandoff).toBeNull()
})

test('projects the exact case-owned blocked strategy handoff without assigning a routine hold to an employee', () => {
  const blocked = { status: 'blocked', orderRef: caseId, invitation: null, reason: 'brief_not_current', nextAction: 'review_dependencies', templateId: 'WZR-BRIEF' }
  const saved = workflow('strategy_waiting', { agencyStrategyPairInvitation: { result: blocked } })
  const result = projectSubmissionProcess(submission, saved, [])
  expect(result.strategyReviewHandoff).toEqual(blocked)
  expect(result.workflow).toMatchObject({ status: 'PAUSED', currentStepId: 'strategy_waiting', waitingFor: null })
  expect(result.tasks).toEqual([])
  saved.context = { agencyStrategyPairInvitation: { result: { ...blocked, orderRef: customerEntityId } } }
  expect(projectSubmissionProcess(submission, saved, []).strategyReviewHandoff).toBeNull()
  saved.context = { agencyStrategyPairInvitation: { result: blocked } }
  saved.workflowId = 'agency_operations.client-submission.scaffold.v1'
  expect(projectSubmissionProcess(submission, saved, []).strategyReviewHandoff).toBeNull()
})

test('saved dispositions addressed to another case do not become this submission result', () => {
  const disposition = {
    kind: 'answer', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Answer', message: 'Answer',
    targets: { caseId: customerEntityId, submissionId }, effectsApplied: false,
  }
  expect(projectSubmissionProcess(submission, workflow('answered', { clientTriageResult: { result: disposition } }, 'COMPLETED'), []).disposition).toBeNull()
})

const analysisResult = {
  caseId, requestedThrough: '3.8', completedThrough: '3.5', state: 'waiting',
  taskRunIds: ['task-run'], documentVersionIds: ['document-version'], agentRunIds: ['agent-run'],
  spentPln: 0.2, qaVerdict: 'to_fix', escalationVersionId: 'escalation-version',
}

test('loads the case-owned analysis workflow even when there are no client submissions', async () => {
  const analysis = Object.assign(workflow('waiting', { [AGENCY_ANALYSIS_RESULT_KEY]: { result: analysisResult } }), { workflowId: AGENCY_ANALYSIS_WORKFLOW_ID })
  jest.mocked(findOneWithDecryption).mockResolvedValue({ customerEntityId, workflowInstanceId: instanceId } as never)
  jest.mocked(findWithDecryption).mockImplementation(async (_em, entity) => entity === WorkflowInstance ? [analysis] as never : [])

  const result = await readCaseProcess(container, caseId, employee)

  expect(findWithDecryption).toHaveBeenCalledWith(em, WorkflowInstance, { id: { $in: [instanceId] }, ...scope, deletedAt: null }, undefined, scope)
  expect(result?.submissions).toEqual([])
  expect(result?.analysis).toMatchObject({ id: instanceId, status: 'PAUSED', currentStepId: 'waiting', awaitingFollowUp: true, result: analysisResult })
})

test('never derives an analysis result from native completion or another case result', () => {
  const completed = Object.assign(workflow('completed', {}, 'COMPLETED'), { workflowId: AGENCY_ANALYSIS_WORKFLOW_ID })
  expect(projectAnalysisProcess(caseId, completed)).toMatchObject({ status: 'COMPLETED', result: null, awaitingFollowUp: false })
  completed.context = { [AGENCY_ANALYSIS_RESULT_KEY]: { result: { ...analysisResult, caseId: customerEntityId } } }
  expect(projectAnalysisProcess(caseId, completed)?.result).toBeNull()
  expect(projectAnalysisProcess(caseId, workflow('answered'))).toBeNull()
})

test('preserves exact completed research references without upgrading them to client approval', () => {
  const completedResult = { ...analysisResult, state: 'completed', completedThrough: '3.8', qaVerdict: 'ready', escalationVersionId: undefined }
  const completed = Object.assign(workflow('completed', { [AGENCY_ANALYSIS_RESULT_KEY]: { result: completedResult } }, 'COMPLETED'), { workflowId: AGENCY_ANALYSIS_WORKFLOW_ID })
  expect(projectAnalysisProcess(caseId, completed)?.result).toEqual(completedResult)
})

const strategyHandoff = {
  status: 'ready', orderRef: caseId,
  brief: { documentId: 'brief-document', versionId: 'accepted-brief-version', documentRef: 'KLI-BRIEF', version: '2.0', templateId: 'WZR-BRIEF' },
  analysis: {
    freezeTaskRunId: 'freeze-run', qaTaskRunId: 'analysis-qa-run', setHash: 'frozen-set',
    documents: [{ documentId: 'analysis-document', versionId: 'frozen-analysis-version', documentRef: 'WEW-ANALIZA', version: '1.0', templateId: 'WZR-ANALIZA' }],
  },
  process: { workflowDefinitionId: instanceId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: 3 },
}

test('projects only the saved case-owned native strategy handoff with its exact references', () => {
  const saved = workflow('strategy_ready', { agencyStrategyReadiness: { result: strategyHandoff } }, 'COMPLETED')
  expect(projectSubmissionProcess(submission, saved, []).strategyHandoff).toEqual(strategyHandoff)
  expect(projectSubmissionProcess(submission, workflow('strategy_ready', {}, 'COMPLETED'), []).strategyHandoff).toBeNull()
  saved.context = { agencyStrategyReadiness: { result: { ...strategyHandoff, orderRef: customerEntityId } } }
  expect(projectSubmissionProcess(submission, saved, []).strategyHandoff).toBeNull()
  saved.context = { agencyStrategyReadiness: { result: strategyHandoff } }
  saved.workflowId = 'agency_operations.client-submission.scaffold.v1'
  expect(projectSubmissionProcess(submission, saved, []).strategyHandoff).toBeNull()
})

test('retains the recorded strategy blocker and does not upgrade a malformed readiness result', () => {
  const notReady = { status: 'not_ready', orderRef: caseId, reason: 'missing_process_configuration' }
  expect(projectSubmissionProcess(submission, workflow('strategy_not_ready', { agencyStrategyReadiness: { result: notReady } }), []).strategyHandoff)
    .toEqual(notReady)
  expect(projectSubmissionProcess(submission, workflow('strategy_ready', { agencyStrategyReadiness: { result: { status: 'ready', orderRef: caseId } } }), []).strategyHandoff)
    .toBeNull()
})

const strategyExecution = {
  status: 'paused_budget', orderRef: caseId,
  taskRunIds: ['activation-task', 'strategy-task'], documentVersionIds: ['strategy-version'],
  agentRunIds: ['actual-strategy-agent-run'], spentPln: 0.35,
  strategyVersionId: 'strategy-version', tovVersionId: null, qaTaskRunId: null, qaVerdict: null,
}

test('preserves saved strategy execution outputs and cost rather than deriving success from readiness', () => {
  const saved = workflow('completed', {
    agencyStrategyReadiness: { result: strategyHandoff },
    [STRATEGY_EXECUTION_RESULT_KEY]: { result: strategyExecution },
  }, 'COMPLETED')
  expect(projectSubmissionProcess(submission, saved, []).strategyExecution).toEqual(strategyExecution)
  saved.context = { agencyStrategyReadiness: { result: strategyHandoff } }
  expect(projectSubmissionProcess(submission, saved, []).strategyExecution).toBeNull()
  saved.context = { [STRATEGY_EXECUTION_RESULT_KEY]: { result: { ...strategyExecution, orderRef: customerEntityId } } }
  expect(projectSubmissionProcess(submission, saved, []).strategyExecution).toBeNull()
  saved.context = { [STRATEGY_EXECUTION_RESULT_KEY]: { result: strategyExecution } }
  saved.workflowId = 'agency_operations.client-submission.scaffold.v1'
  expect(projectSubmissionProcess(submission, saved, []).strategyExecution).toBeNull()
})

test('retains a saved interrupted activation and rejects malformed execution output', () => {
  const incomplete = { status: 'execution_incomplete', orderRef: caseId, activationTaskRunId: 'activation-task', reason: 'in_progress_or_interrupted' }
  expect(projectSubmissionProcess(submission, workflow('completed', { [STRATEGY_EXECUTION_RESULT_KEY]: { result: incomplete } }), []).strategyExecution)
    .toEqual(incomplete)
  expect(projectSubmissionProcess(submission, workflow('completed', { [STRATEGY_EXECUTION_RESULT_KEY]: { result: { status: 'completed', orderRef: caseId } } }), []).strategyExecution)
    .toBeNull()
})

const pairCumulative = {
  status: 'partial', orderRef: caseId,
  pair: {
    strategy: { documentId: caseId, versionId: submissionId, version: '2.0' },
    tov: { documentId: customerEntityId, versionId: instanceId, version: '1.0' },
  },
  brief: { documentId: caseId, versionId: customerEntityId, version: '1.0' },
  remainingDocuments: ['tov'],
}
const pairContinuation = {
  status: 'partial', orderRef: caseId, cumulative: pairCumulative,
  followUpTask: { workflowInstanceId: instanceId, taskId: submissionId, replayed: false },
}

test('projects saved partial pair approval and its follow-up without exposing unrelated native receipt internals', () => {
  const saved = workflow('strategy_pair_partial', { agencyStrategyPairContinuation: { result: {
    ...pairContinuation, cumulative: { ...pairCumulative, acceptances: { strategy: { source: { agentRunId: 'private-native-reference' } } } },
  } } }, 'COMPLETED')
  expect(projectSubmissionProcess(submission, saved, []).strategyPairContinuation).toEqual(pairContinuation)
  saved.context = { agencyStrategyPairContinuation: { result: { ...pairContinuation, orderRef: customerEntityId } } }
  expect(projectSubmissionProcess(submission, saved, []).strategyPairContinuation).toBeNull()
  saved.context = { agencyStrategyPairContinuation: { result: { ...pairContinuation, cumulative: { ...pairCumulative, orderRef: customerEntityId } } } }
  expect(projectSubmissionProcess(submission, saved, []).strategyPairContinuation).toBeNull()
  saved.context = { agencyStrategyPairContinuation: { result: pairContinuation } }
  saved.workflowId = 'agency_operations.client-submission.scaffold.v1'
  expect(projectSubmissionProcess(submission, saved, []).strategyPairContinuation).toBeNull()
})

test('retains accepted-pair planning blockers and never invents continuation from workflow completion', () => {
  const accepted = {
    status: 'accepted', orderRef: caseId,
    cumulative: { ...pairCumulative, status: 'accepted', remainingDocuments: [] },
    planningReadiness: { status: 'not_ready', orderRef: caseId, reason: 'missing_process_configuration' },
  }
  const saved = workflow('strategy_pair_accepted', { agencyStrategyPairContinuation: { result: accepted } }, 'COMPLETED')
  expect(projectSubmissionProcess(submission, saved, []).strategyPairContinuation).toEqual(accepted)
  saved.context = { agencyStrategyPairContinuation: { result: { ...accepted, planningReadiness: { ...accepted.planningReadiness, orderRef: customerEntityId } } } }
  expect(projectSubmissionProcess(submission, saved, []).strategyPairContinuation).toBeNull()
  saved.context = { agencyStrategyPairContinuation: { result: { status: 'accepted', orderRef: caseId } } }
  expect(projectSubmissionProcess(submission, saved, []).strategyPairContinuation).toBeNull()
  saved.context = {}
  expect(projectSubmissionProcess(submission, saved, []).strategyPairContinuation).toBeNull()
})

test('shows saved planning blockers only for the owning native case, not from accepted-pair readiness', () => {
  const blocked = { status: 'not_configured', orderRef: caseId, reason: 'execution_disabled' }
  const saved = workflow('planning_execution', { [PLANNING_EXECUTION_RESULT_KEY]: { result: blocked } }, 'COMPLETED')
  expect(projectSubmissionProcess(submission, saved, []).planningExecution).toEqual(blocked)
  saved.context = { [PLANNING_EXECUTION_RESULT_KEY]: { result: { ...blocked, orderRef: customerEntityId } } }
  expect(projectSubmissionProcess(submission, saved, []).planningExecution).toBeNull()
  saved.context = { [PLANNING_EXECUTION_RESULT_KEY]: { result: blocked } }
  saved.workflowId = 'agency_operations.client-submission.scaffold.v1'
  expect(projectSubmissionProcess(submission, saved, []).planningExecution).toBeNull()
  saved.workflowId = NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID
  saved.context = { agencyStrategyPairContinuation: { result: { status: 'accepted', orderRef: caseId } } }
  expect(projectSubmissionProcess(submission, saved, []).planningExecution).toBeNull()
  saved.context = { [PLANNING_EXECUTION_RESULT_KEY]: { result: { status: 'completed', orderRef: caseId } } }
  expect(projectSubmissionProcess(submission, saved, []).planningExecution).toBeNull()
})

test('preserves the exact planning output and QA references without upgrading its verdict', () => {
  const planningExecution = {
    status: 'completed', orderRef: caseId, strategyVersionId: 'strategy-v2', tovVersionId: 'tov-v1',
    taskRunIds: ['planning-activation', 'plan-writer', 'plan-qa'], documentVersionIds: ['plan-v1'],
    agentRunIds: ['planning-agent-run', 'planning-qa-run'], spentPln: 0.4,
    planVersionId: 'plan-v1', qaTaskRunId: 'plan-qa', qaVerdict: 'needs_agent_fix', readyForApproval: false,
  }
  const saved = workflow('planning_execution', { [PLANNING_EXECUTION_RESULT_KEY]: { result: planningExecution } }, 'COMPLETED')
  expect(projectSubmissionProcess(submission, saved, []).planningExecution).toEqual(planningExecution)
})

test('projects the saved post instruction for this native case and exact selection, including blocked outcomes', () => {
  const instruction = {
    status: 'ready', orderRef: caseId, planVersionId: instanceId, selectedTopicId: 'topic-3',
    selectionSubmissionId: submissionId, taskRunId: 'compiler-run', instructionDocumentId: 'instruction-document',
    instructionVersionId: 'instruction-v1', instructionVersion: '1.0', replayed: false,
  }
  const saved = workflow('post_instruction', { agencyPostInstruction: { result: instruction } }, 'COMPLETED')
  expect(projectSubmissionProcess(submission, saved, []).postInstruction).toEqual(instruction)
  for (const mismatch of [{ orderRef: customerEntityId }, { selectionSubmissionId: customerEntityId }]) {
    saved.context = { agencyPostInstruction: { result: { ...instruction, ...mismatch } } }
    expect(projectSubmissionProcess(submission, saved, []).postInstruction).toBeNull()
  }
  const blocked = { status: 'not_ready', orderRef: caseId, reason: 'compiler_blocked', issueCodes: ['missing_source'], taskRunId: 'compiler-run' }
  saved.context = { agencyPostInstruction: { result: blocked } }
  expect(projectSubmissionProcess(submission, saved, []).postInstruction).toEqual(blocked)
  saved.workflowId = 'agency_operations.client-submission.scaffold.v1'
  expect(projectSubmissionProcess(submission, saved, []).postInstruction).toBeNull()
  saved.workflowId = NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID
  saved.context = { agencyPostInstruction: { result: { status: 'ready', orderRef: caseId } } }
  expect(projectSubmissionProcess(submission, saved, []).postInstruction).toBeNull()
  saved.context = {}
  expect(projectSubmissionProcess(submission, saved, []).postInstruction).toBeNull()
})

test('projects saved post/editor references only for the native case and exact topic decision', () => {
  const outcome = {
    status: 'completed', orderRef: caseId, instructionVersionId: 'instruction-v1', selectionSubmissionId: submissionId,
    taskRunIds: ['author-task', 'editor-task'], documentVersionIds: ['post-v2'], agentRunIds: ['author-run', 'editor-run'],
    spentPln: 0.5, postVersionId: 'post-v2', qaTaskRunId: 'editor-task', qaVerdict: 'needs_fix', readyForReview: false,
    escalationVersionId: 'editor-exception-v1',
  }
  const saved = workflow('post_production', {}, 'COMPLETED')
  for (const status of ['completed', 'paused_budget']) {
    saved.context = { [POST_EXECUTION_RESULT_KEY]: { executed: true, functionName: POST_EXECUTION_FUNCTION, result: { ...outcome, status } } }
    expect(projectSubmissionProcess(submission, saved, []).postExecution).toEqual({ ...outcome, status })
    saved.context = { [POST_EXECUTION_RESULT_KEY]: { result: { ...outcome, status, selectionSubmissionId: customerEntityId } } }
    expect(projectSubmissionProcess(submission, saved, []).postExecution).toBeNull()
  }
  saved.context = { [POST_EXECUTION_RESULT_KEY]: { result: { ...outcome, orderRef: customerEntityId } } }
  expect(projectSubmissionProcess(submission, saved, []).postExecution).toBeNull()
  saved.context = { [POST_EXECUTION_RESULT_KEY]: { result: outcome } }
  saved.workflowId = 'agency_operations.client-submission.scaffold.v1'
  expect(projectSubmissionProcess(submission, saved, []).postExecution).toBeNull()
  saved.workflowId = NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID
  saved.context = { agencyPostInstruction: { result: { status: 'ready', orderRef: caseId } } }
  expect(projectSubmissionProcess(submission, saved, []).postExecution).toBeNull()
  const disabled = { status: 'not_configured', orderRef: caseId, reason: 'execution_disabled' }
  saved.context = { agencyPostExecution: { result: outcome } }
  expect(projectSubmissionProcess(submission, saved, []).postExecution).toEqual(outcome)
  saved.context = { [POST_EXECUTION_RESULT_KEY]: { result: disabled }, agencyPostExecution: { result: outcome } }
  expect(projectSubmissionProcess(submission, saved, []).postExecution).toEqual(disabled)
})
