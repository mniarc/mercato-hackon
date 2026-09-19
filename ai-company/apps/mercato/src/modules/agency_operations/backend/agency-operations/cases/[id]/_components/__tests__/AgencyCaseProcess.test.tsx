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
