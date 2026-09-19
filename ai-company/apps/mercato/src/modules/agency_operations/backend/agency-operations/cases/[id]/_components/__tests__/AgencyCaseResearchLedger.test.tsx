/** @jest-environment jsdom */
import * as React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AgencyCaseResearchLedger } from '../AgencyCaseResearchLedger'

let mockScopeVersion = 1
jest.mock('@open-mercato/shared/lib/frontend/useOrganizationScope', () => ({ useOrganizationScopeVersion: () => mockScopeVersion }))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/backend/SectionHeader', () => ({
  SectionHeader: ({ title, action }: { title: string; action: React.ReactNode }) => <div><h2>{title}</h2>{action}</div>,
}))
jest.mock('@open-mercato/ui/backend/JsonDisplay', () => ({ JsonDisplay: ({ data }: { data: unknown }) => <pre>{JSON.stringify(data)}</pre> }))
jest.mock('@open-mercato/ui/backend/detail', () => ({
  LoadingMessage: ({ label }: { label: string }) => <p>{label}</p>,
  ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p>,
}))
jest.mock('@open-mercato/ui/backend/DataTable', () => ({
  DataTable: ({ columns, data, emptyState }: {
    columns: Array<{ accessorKey?: string; cell?: (context: { row: { original: Record<string, unknown> } }) => React.ReactNode }>
    data: Array<Record<string, unknown>>; emptyState?: React.ReactNode
  }) => data.length ? <div>{data.map((row, index) => <div key={index}>{columns.map((column) => <div key={column.accessorKey}>{column.cell ? column.cell({ row: { original: row } }) : String(row[column.accessorKey ?? ''] ?? '')}</div>)}</div>)}</div> : <p>{emptyState}</p>,
}))

const key = 'agencyOperations.cases.researchLedger'
const taskVersionId = '00000000-0000-4000-8000-000000000001'
const documentVersionId = '00000000-0000-4000-8000-000000000002'
const ledger = {
  orderRef: 'case-one', totalPln: 0.2, sources: 2,
  taskRuns: [{ id: 'run-one', stepId: '3.2', attempt: 1, status: 'failed', runner: 'source-researcher', costPln: 0.2, agentRuns: 1, outputVersionId: taskVersionId, error: 'Provider stopped after source collection', createdAt: '2026-09-19T10:00:00Z', finishedAt: '2026-09-19T10:01:00Z' }],
  documents: [{ templateId: 'WEW-ZRODLA', outputId: 'output-one', status: 'generated', versionNo: 1, versionId: documentVersionId, updatedAt: '2026-09-19T10:01:00Z' }],
}
const version = {
  id: taskVersionId, order_id: 'case-one', status: 'generated', template_id: 'WEW-ZRODLA', version: '1.0',
  data: { claim: 'Stored partial output' }, input_versions: ['source-v1'], field_evidence: ['evidence-one'], approval_records: [],
  simulation_flag: false, issues: ['Missing competitor evidence'], task_run_id: 'run-one', qa_result: { verdict: 'to_fix' },
}
const success = (result: unknown) => ({ ok: true, status: 200, result }) as never

beforeEach(() => { jest.resetAllMocks(); mockScopeVersion = 1 })

test('shows partial task attempts and lazily opens one exact persisted version without requiring a final handoff', async () => {
  jest.mocked(apiCall).mockImplementation(async (url) => String(url).includes('/task-runs?') ? success(ledger) : success(version))
  render(<AgencyCaseResearchLedger caseId="case-one" />)
  expect(await screen.findByText('failed')).toBeTruthy()
  expect(screen.getByText('Provider stopped after source collection')).toBeTruthy()
  expect(screen.getByText('3.2')).toBeTruthy()
  expect(screen.getByText('source-researcher')).toBeTruthy()
  expect(screen.getByRole('button', { name: documentVersionId })).toBeTruthy()
  expect(apiCall).toHaveBeenCalledTimes(1)
  expect(apiCall).toHaveBeenCalledWith('/api/agency_research/task-runs?order_ref=case-one')

  fireEvent.click(screen.getByRole('button', { name: taskVersionId }))
  expect(await screen.findByText(JSON.stringify(version))).toBeTruthy()
  expect(screen.getByText(`${key}.noApproval`)).toBeTruthy()
  expect(apiCall).toHaveBeenLastCalledWith(`/api/agency_research/document-versions?id=${taskVersionId}`)
  expect(apiCall).toHaveBeenCalledTimes(2)
})

test('preserves native permission denial instead of showing an empty ledger', async () => {
  jest.mocked(apiCall).mockResolvedValue({ ok: false, status: 403, result: null } as never)
  render(<AgencyCaseResearchLedger caseId="case-one" />)
  expect((await screen.findByRole('alert')).textContent).toBe(`${key}.forbidden`)
  expect(screen.queryByText(`${key}.empty`)).toBeNull()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test('rejects a returned output belonging to a different case', async () => {
  jest.mocked(apiCall).mockImplementation(async (url) => String(url).includes('/task-runs?') ? success(ledger) : success({ ...version, order_id: 'other-case' }))
  render(<AgencyCaseResearchLedger caseId="case-one" />)
  fireEvent.click(await screen.findByRole('button', { name: taskVersionId }))
  expect((await screen.findByRole('alert')).textContent).toBe(`${key}.versionUnavailable`)
  expect(screen.queryByText(/Stored partial output/)).toBeNull()
})

test('case switch removes old records and ignores a late selected-version response', async () => {
  let finishVersion!: (value: never) => void
  const pendingVersion = new Promise<never>((resolve) => { finishVersion = resolve })
  jest.mocked(apiCall).mockImplementation(async (url) => {
    if (String(url).includes('/document-versions?')) return pendingVersion
    return success(String(url).includes('case-one') ? ledger : { orderRef: 'case-two', totalPln: 0, sources: 0, taskRuns: [], documents: [] })
  })
  const view = render(<AgencyCaseResearchLedger caseId="case-one" />)
  fireEvent.click(await screen.findByRole('button', { name: taskVersionId }))
  await waitFor(() => expect(apiCall).toHaveBeenCalledTimes(2))
  view.rerender(<AgencyCaseResearchLedger caseId="case-two" />)
  expect(screen.queryByText('source-researcher')).toBeNull()
  expect(await screen.findByText(`${key}.empty`)).toBeTruthy()
  await act(async () => { finishVersion(success(version)) })
  expect(screen.queryByText(/Stored partial output/)).toBeNull()
  expect(apiCall).toHaveBeenLastCalledWith('/api/agency_research/task-runs?order_ref=case-two')
})

test('organization scope change clears displayed records before rechecking native access', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(success(ledger)).mockResolvedValueOnce({ ok: false, status: 403, result: null } as never)
  const view = render(<AgencyCaseResearchLedger caseId="case-one" />)
  expect(await screen.findByText('source-researcher')).toBeTruthy()
  mockScopeVersion = 2
  view.rerender(<AgencyCaseResearchLedger caseId="case-one" />)
  expect(screen.queryByText('source-researcher')).toBeNull()
  expect((await screen.findByRole('alert')).textContent).toBe(`${key}.forbidden`)
})
