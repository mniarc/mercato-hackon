/** @jest-environment jsdom */
import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AgencyCaseProcess } from '../AgencyCaseProcess'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/backend/SectionHeader', () => ({
  SectionHeader: ({ title, action }: { title: string; action: React.ReactNode }) => <div>{title}{action}</div>,
  CollapsibleSection: ({ title, children }: { title: string; children: React.ReactNode }) => <section>{title}{children}</section>,
}))
jest.mock('@open-mercato/ui/backend/JsonDisplay', () => ({ JsonDisplay: ({ data }: { data: unknown }) => <pre>{JSON.stringify(data)}</pre> }))
jest.mock('@open-mercato/ui/backend/detail', () => ({
  LoadingMessage: ({ label }: { label: string }) => <p>{label}</p>,
  ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p>,
}))

const process = {
  caseId: 'case-id', hasMore: false,
  submissions: [{
    submissionId: 'submission-id', eventId: 'client-event', createdAt: '2026-09-19T10:00:00Z', original: { text: 'Client input' },
    workflow: { id: 'native-run', workflowId: 'agency_operations.client-submission.native.v1', version: 2, status: 'PAUSED', currentStepId: 'triage_exception', mode: 'native_agent', waitingFor: 'employee', routeUnapplied: false, error: null },
    disposition: null, interpretation: null,
    tasks: [{ id: 'visible-task', status: 'PENDING', claimedBy: null, assignedTo: null, assignedToRoles: ['employee'] }],
  }],
}

beforeEach(() => jest.clearAllMocks())

test('keeps a late-material impact hold visible without suggesting approved documents were replaced', async () => {
  const materialRevision = { status: 'not_ready', orderRef: 'case-id', reason: 'impact_review_required' }
  const materialRevisionHandoff = { status: 'blocked', orderRef: 'case-id', invitation: null,
    reason: 'impact_review_required', nextAction: 'review_impact', revision: materialRevision }
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: { ...process,
    submissions: [{ ...process.submissions[0], materialRevision, materialRevisionHandoff }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText('agencyOperations.cases.process.materialRevision.blocked')).toBeTruthy()
  expect(screen.getByText('impact_review_required')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.materialRevision.nextAction.review_impact')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.materialRevision.noApprovalOrResume')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.process.materialRevision.inspectWorkflow' }).getAttribute('href')).toBe('/backend/instances/native-run')
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test('shows the saved initial post hold with its next step without inventing resume', async () => {
  const postReviewHandoff = { status: 'blocked', orderRef: 'case-id', invitation: null,
    reason: 'missing_post_authorization', nextAction: 'review_configuration',
    execution: { status: 'not_configured', orderRef: 'case-id', reason: 'missing_post_authorization' } }
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], postReviewHandoff, tasks: [],
      workflow: { ...process.submissions[0].workflow, currentStepId: 'post_review_waiting', waitingFor: null } }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText('agencyOperations.cases.process.postReviewHandoff.blocked')).toBeTruthy()
  expect(screen.getByText('missing_post_authorization')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.postReviewHandoff.nextAction.review_configuration')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.postReviewHandoff.noResume')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.process.postReviewHandoff.inspectWorkflow' }).getAttribute('href')).toBe('/backend/instances/native-run')
  expect(screen.queryByRole('button', { name: /retry|resume/i })).toBeNull()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test.each([
  { status: 'blocked', orderRef: 'case-id', invitation: null, reason: 'missing_post_revision_authorization', nextAction: 'review_configuration' },
  { status: 'invited', orderRef: 'case-id', versionId: 'post-v2', invitation: { workflowInstanceId: 'post-review-run', taskId: 'client-review', replayed: false } },
])('shows saved post correction and $status handoff without a resume or approval action', async (postRevisionHandoff) => {
  const postRevision = postRevisionHandoff.status === 'blocked'
    ? { status: 'not_configured', orderRef: 'case-id', reason: 'missing_post_revision_authorization' }
    : { status: 'completed', orderRef: 'case-id', readyForReview: true }
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], postRevision, postRevisionHandoff,
      original: { text: 'Shorten the opening.', postReviewResponse: { body: 'Shorten the opening.' } },
      workflow: { ...process.submissions[0].workflow, currentStepId: 'post_revision_waiting', waitingFor: null },
    }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText(`agencyOperations.cases.process.postRevision.${postRevisionHandoff.status}`)).toBeTruthy()
  expect(screen.getByText('Shorten the opening.')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.postRevision.noApprovalOrResume')).toBeTruthy()
  if (postRevisionHandoff.status === 'blocked') {
    expect(screen.getByText('missing_post_revision_authorization')).toBeTruthy()
    expect(screen.getByText('agencyOperations.cases.process.postRevision.nextAction.review_configuration')).toBeTruthy()
  }
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.process.postRevision.inspectWorkflow' }).getAttribute('href'))
    .toBe(`/backend/instances/${postRevisionHandoff.status === 'invited' ? 'post-review-run' : 'native-run'}`)
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.process.openTask' }).getAttribute('href')).toBe('/backend/tasks/visible-task')
  expect(screen.queryByRole('button', { name: /retry|resume|approve/i })).toBeNull()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test.each([
  { status: 'blocked', invitation: null, reason: 'missing_brief_revision_authorization', revision: { status: 'not_configured' } },
  { status: 'invited', versionId: 'brief-v2', invitation: { workflowInstanceId: 'brief-review-run', taskId: 'client-review', replayed: false }, questions: [] },
])('shows saved brief revision $status and inspection without a resume action', async (briefRevisionHandoff) => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], briefRevisionHandoff }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText(`agencyOperations.cases.process.briefRevision.${briefRevisionHandoff.status}`)).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.briefRevision.noApprovalOrResume')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.process.briefRevision.inspectWorkflow' }).getAttribute('href'))
    .toBe(`/backend/instances/${briefRevisionHandoff.status === 'invited' ? 'brief-review-run' : 'native-run'}`)
  if (briefRevisionHandoff.status === 'blocked') expect(screen.getByText('missing_brief_revision_authorization')).toBeTruthy()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test('shows persisted native exception and links to the actual workflow and authorized task', async () => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: process } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText('PAUSED · triage_exception')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.waiting.employee')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.detail.workflow.open' }).getAttribute('href')).toBe('/backend/instances/native-run')
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.process.openTask' }).getAttribute('href')).toBe('/backend/tasks/visible-task')
  expect(apiCall).toHaveBeenCalledWith('/api/agency_operations/cases/case-id')
})

test('does not turn a workflow permission refusal into an empty successful process', async () => {
  jest.mocked(apiCall).mockResolvedValue({ ok: false, status: 403, result: null } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect((await screen.findByRole('alert')).textContent).toBe('agencyOperations.cases.process.forbidden')
  expect(screen.queryByText('agencyOperations.cases.process.empty')).toBeNull()
  expect(screen.queryByRole('link')).toBeNull()
})

test('shows the saved planning hold and links to inspection without offering resume', async () => {
  const planningReviewHandoff = { status: 'blocked', orderRef: 'case-id', invitation: null,
    reason: 'execution_disabled', nextAction: 'review_configuration' }
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], planningReviewHandoff, tasks: [],
      workflow: { ...process.submissions[0].workflow, currentStepId: 'planning_waiting', waitingFor: null } }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText('agencyOperations.cases.process.planningReviewHandoff.blocked')).toBeTruthy()
  expect(screen.getByText('execution_disabled')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.planningReviewHandoff.nextAction.review_configuration')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.planningReviewHandoff.noResume')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.process.planningReviewHandoff.inspectWorkflow' }).getAttribute('href')).toBe('/backend/instances/native-run')
  expect(screen.getByText(JSON.stringify(planningReviewHandoff))).toBeTruthy()
  expect(screen.queryByRole('button', { name: /retry|resume/i })).toBeNull()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test('shows the saved strategy hold and inspection link without offering a retry', async () => {
  const strategyReviewHandoff = { status: 'blocked', orderRef: 'case-id', invitation: null,
    reason: 'in_progress_or_interrupted', activationTaskRunId: 'saved-activation', nextAction: 'reconcile_execution' }
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], strategyReviewHandoff, tasks: [],
      workflow: { ...process.submissions[0].workflow, currentStepId: 'strategy_waiting', waitingFor: null } }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText('agencyOperations.cases.process.strategyReviewHandoff.blocked')).toBeTruthy()
  expect(screen.getByText('in_progress_or_interrupted')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.strategyReviewHandoff.nextAction.reconcile_execution')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.strategyReviewHandoff.noResume')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.process.strategyReviewHandoff.inspectWorkflow' }).getAttribute('href')).toBe('/backend/instances/native-run')
  expect(screen.getByText(JSON.stringify(strategyReviewHandoff))).toBeTruthy()
  expect(screen.queryByRole('button', { name: /retry|resume/i })).toBeNull()
  expect(screen.queryByText('agencyOperations.cases.process.waiting.employee')).toBeNull()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test('shows a saved incomplete analysis handoff with exact native agent references', async () => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    caseId: 'case-id', submissions: [], hasMore: false,
    analysis: {
      id: 'analysis-workflow', workflowId: 'agency_operations.analysis.v1', version: 1,
      status: 'PAUSED', currentStepId: 'waiting', awaitingFollowUp: true, error: null,
      result: { caseId: 'case-id', requestedThrough: '3.8', completedThrough: '3.5', state: 'waiting', taskRunIds: ['task-run'], documentVersionIds: ['document-version'], agentRunIds: ['actual-agent-run'], spentPln: 0.2, qaVerdict: 'to_fix' },
    },
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText('agencyOperations.cases.process.analysis.waiting')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.analysis.result.waiting')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.analysis.noApproval')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.detail.workflow.open' }).getAttribute('href')).toBe('/backend/instances/analysis-workflow')
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.detail.research.agentRun 1' }).getAttribute('href')).toBe('/backend/traces/actual-agent-run')
  expect(screen.queryByText('agencyOperations.cases.process.analysis.result.completed')).toBeNull()
})

test.each([
  { status: 'not_ready', orderRef: 'case-id', reason: 'missing_process_configuration' },
  {
    status: 'ready', orderRef: 'case-id',
    brief: { documentId: 'brief', versionId: 'accepted-brief-version', version: '2.0', templateId: 'WZR-BRIEF', documentRef: 'KLI-BRIEF' },
    analysis: { freezeTaskRunId: 'freeze-run', qaTaskRunId: 'qa-run', setHash: 'frozen-set', documents: [] },
    process: { workflowDefinitionId: 'pinned-definition', workflowId: 'agency_operations.analysis.v1', version: 3 },
  },
])('shows saved strategy readiness $status without claiming strategy execution', async (strategyHandoff) => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process,
    submissions: [{ ...process.submissions[0], strategyHandoff, disposition: { message: 'Acceptance recorded', rationale: 'Exact version', effectsApplied: true } }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText(`agencyOperations.cases.process.strategy.${strategyHandoff.status}`)).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.strategy.noExecution')).toBeTruthy()
  expect(screen.getByText(JSON.stringify(strategyHandoff))).toBeTruthy()
  expect(screen.queryByText('agencyOperations.cases.process.noBusinessEffects')).toBeNull()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.detail.workflow.open' })).toHaveAttribute('href', '/backend/instances/native-run')
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test.each([
  { status: 'not_configured', orderRef: 'case-id', reason: 'missing_strategy_authorization' },
  { status: 'not_ready', orderRef: 'case-id', reason: 'brief_not_current' },
  { status: 'execution_incomplete', orderRef: 'case-id', activationTaskRunId: 'activation-task', reason: 'in_progress_or_interrupted' },
  {
    status: 'completed', orderRef: 'case-id',
    taskRunIds: ['activation', 'strategy', 'tov', 'qa'], documentVersionIds: ['strategy-v2', 'tov-v1'],
    agentRunIds: ['strategy-agent', 'tov-agent'], spentPln: 0.8,
    strategyVersionId: 'strategy-v2', tovVersionId: 'tov-v1', qaTaskRunId: 'qa', qaVerdict: 'needs_agent_fix',
  },
  {
    status: 'paused_budget', orderRef: 'case-id',
    taskRunIds: ['activation', 'strategy'], documentVersionIds: ['strategy-v2'],
    agentRunIds: ['strategy-agent'], spentPln: 0.3,
    strategyVersionId: 'strategy-v2', tovVersionId: null, qaTaskRunId: null, qaVerdict: null,
  },
])('shows saved strategy execution $status without inventing an approval or another fetch', async (strategyExecution) => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], strategyExecution }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText(`agencyOperations.cases.process.strategyExecution.${strategyExecution.status}`)).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.strategyExecution.noApproval')).toBeTruthy()
  expect(screen.getByText(JSON.stringify(strategyExecution))).toBeTruthy()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test.each([
  { status: 'not_ready', orderRef: 'case-id', reason: 'pair_not_current', cumulative: { status: 'not_ready', orderRef: 'case-id', reason: 'pair_not_current' } },
  { status: 'partial', orderRef: 'case-id', cumulative: { status: 'partial', remainingDocuments: ['tov'] }, followUpTask: { workflowInstanceId: 'follow-up-workflow', taskId: 'client-task', replayed: false } },
  { status: 'accepted', orderRef: 'case-id', cumulative: { status: 'accepted', remainingDocuments: [] }, planningReadiness: { status: 'not_ready', reason: 'missing_process_configuration' } },
  { status: 'accepted', orderRef: 'case-id', cumulative: { status: 'accepted', remainingDocuments: [] }, planningReadiness: { status: 'ready', process: { workflowId: 'configured-planning', version: 1 } } },
])('shows the saved pair continuation $status without implying planning execution', async (strategyPairContinuation) => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], strategyPairContinuation }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText(`agencyOperations.cases.process.strategyPair.${strategyPairContinuation.status}`)).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.strategyPair.noExecution')).toBeTruthy()
  expect(screen.getByText(JSON.stringify(strategyPairContinuation))).toBeTruthy()
  if (strategyPairContinuation.status === 'partial') {
    expect(screen.getByText('agencyOperations.cases.process.strategyPair.followUp')).toBeTruthy()
    expect(screen.queryByText('agencyOperations.cases.process.strategyPair.planning.ready')).toBeNull()
  }
  if (strategyPairContinuation.status === 'accepted') {
    expect(screen.getByText(`agencyOperations.cases.process.strategyPair.planning.${strategyPairContinuation.planningReadiness!.status}`)).toBeTruthy()
    expect(screen.queryByText('agencyOperations.cases.process.strategyPair.followUp')).toBeNull()
  }
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test.each([
  { status: 'not_configured', orderRef: 'case-id', reason: 'execution_disabled' },
  { status: 'not_ready', orderRef: 'case-id', reason: 'pair_acceptance_incomplete' },
  { status: 'execution_incomplete', orderRef: 'case-id', activationTaskRunId: 'planning-activation', reason: 'in_progress_or_interrupted' },
  {
    status: 'completed', orderRef: 'case-id', strategyVersionId: 'strategy-v2', tovVersionId: 'tov-v1',
    taskRunIds: ['planning-activation', 'plan-writer', 'plan-qa'], documentVersionIds: ['plan-v1'],
    agentRunIds: ['planning-agent-run', 'planning-qa-run'], spentPln: 0.4,
    planVersionId: 'plan-v1', qaTaskRunId: 'plan-qa', qaVerdict: 'needs_agent_fix', readyForApproval: false,
  },
  {
    status: 'paused_budget', orderRef: 'case-id', strategyVersionId: 'strategy-v2', tovVersionId: 'tov-v1',
    taskRunIds: ['planning-activation', 'plan-writer'], documentVersionIds: ['plan-v1'],
    agentRunIds: ['planning-agent-run'], spentPln: 0.2,
    planVersionId: 'plan-v1', qaTaskRunId: null, qaVerdict: null, readyForApproval: false,
  },
])('shows saved planning $status and exact evidence without claiming client approval', async (planningExecution) => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], planningExecution }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText(`agencyOperations.cases.process.planningExecution.${planningExecution.status}`)).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.planningExecution.noApproval')).toBeTruthy()
  expect(screen.getByText(JSON.stringify(planningExecution))).toBeTruthy()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test.each([
  {
    status: 'ready', orderRef: 'case-id', planVersionId: 'plan-v2', selectedTopicId: 'topic-3',
    selectionSubmissionId: 'submission-id', taskRunId: 'compiler-run', instructionDocumentId: 'instruction-document',
    instructionVersionId: 'instruction-v1', instructionVersion: '1.0', replayed: false,
  },
  { status: 'not_ready', orderRef: 'case-id', reason: 'compiler_blocked', issueCodes: ['missing_source'] },
])('shows the saved post instruction $status without implying a post or publication consent', async (postInstruction) => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], postInstruction }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText(`agencyOperations.cases.process.postInstruction.${postInstruction.status}`)).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.postInstruction.noPost')).toBeTruthy()
  expect(screen.getByText(JSON.stringify(postInstruction))).toBeTruthy()
  if (postInstruction.status === 'ready') {
    expect(screen.getByText('agencyOperations.cases.process.postInstruction.selectedTopic: topic-3')).toBeTruthy()
  } else {
    expect(screen.getByText('compiler_blocked')).toBeTruthy()
  }
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test('shows the saved post and editor exception without presenting completed execution as ready or approved', async () => {
  const postExecution = {
    status: 'completed', orderRef: 'case-id', instructionVersionId: 'instruction-v1', selectionSubmissionId: 'submission-id',
    taskRunIds: ['author-task', 'editor-task'], documentVersionIds: ['post-v2'], agentRunIds: ['author-run', 'editor-run'],
    spentPln: 0.5, postVersionId: 'post-v2', qaTaskRunId: 'editor-task', qaVerdict: 'needs_fix', readyForReview: false,
    escalationVersionId: 'editor-exception-v1',
  }
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 200, result: {
    ...process, submissions: [{ ...process.submissions[0], postExecution }],
  } } as never)
  render(<AgencyCaseProcess caseId="case-id" />)
  expect(await screen.findByText('agencyOperations.cases.process.postExecution.completed')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.postExecution.notReadyForReview')).toBeTruthy()
  expect(screen.getByText('agencyOperations.cases.process.postExecution.noApproval')).toBeTruthy()
  expect(screen.queryByText('agencyOperations.cases.process.postExecution.readyForReview')).toBeNull()
  expect(screen.getByText(JSON.stringify(postExecution))).toBeTruthy()
  expect(apiCall).toHaveBeenCalledTimes(1)
})
