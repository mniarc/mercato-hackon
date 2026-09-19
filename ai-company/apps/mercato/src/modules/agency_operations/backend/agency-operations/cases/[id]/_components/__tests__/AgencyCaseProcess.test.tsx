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
