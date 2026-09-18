/** @jest-environment jsdom */

import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))

jest.mock('@open-mercato/shared/lib/frontend/useOrganizationScope', () => ({
  useOrganizationScopeVersion: () => 1,
}))

const translations: Record<string, string> = {
  'agencyOperations.cases.actions.open': 'Open',
  'agencyOperations.cases.common.notAvailable': 'Not available',
  'agencyOperations.cases.detail.backToList': 'Back to agency cases',
  'agencyOperations.cases.detail.entityLabel': 'Agency case',
  'agencyOperations.cases.detail.fields.clientId': 'Client ID',
  'agencyOperations.cases.detail.fields.createdAt': 'Created',
  'agencyOperations.cases.detail.fields.fileName': 'File name',
  'agencyOperations.cases.detail.fields.fileSize': 'File size',
  'agencyOperations.cases.detail.fields.mimeType': 'Media type',
  'agencyOperations.cases.detail.fields.submittedBy': 'Submitted by customer user',
  'agencyOperations.cases.detail.fields.worker': 'Agent worker',
  'agencyOperations.cases.detail.loadError': 'The agency case could not be loaded.',
  'agencyOperations.cases.detail.loading': 'Loading agency case...',
  'agencyOperations.cases.detail.material.open': 'Open material',
  'agencyOperations.cases.detail.notFound': 'Agency case not found.',
  'agencyOperations.cases.detail.run.error': 'Run error',
  'agencyOperations.cases.detail.run.input': 'Run input',
  'agencyOperations.cases.detail.run.output': 'Run output',
  'agencyOperations.cases.detail.sections.case': 'Case details',
  'agencyOperations.cases.detail.sections.material': 'Client material',
  'agencyOperations.cases.detail.sections.run': 'Workflow run',
  'agencyOperations.cases.detail.workflow.open': 'Open workflow run',
  'agencyOperations.cases.list.columns.client': 'Client',
  'agencyOperations.cases.list.columns.createdAt': 'Created',
  'agencyOperations.cases.list.columns.material': 'Material',
  'agencyOperations.cases.list.columns.title': 'Title',
  'agencyOperations.cases.list.columns.worker': 'Agent worker',
  'agencyOperations.cases.list.entityName': 'agency cases',
  'agencyOperations.cases.list.loadError': 'Agency cases could not be loaded.',
  'agencyOperations.cases.list.searchPlaceholder': 'Search agency cases...',
  'agencyOperations.cases.list.title': 'Agency cases',
  'agencyOperations.cases.status.completed': 'Completed',
}

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  useLocale: () => 'en',
  useT: () => (key: string) => translations[key] ?? key,
}))

jest.mock('@open-mercato/ui/backend/Page', () => ({
  Page: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageBody: ({ children }: { children?: React.ReactNode }) => <main>{children}</main>,
}))

type MockColumn = {
  id?: string
  accessorKey?: string
  cell?: (context: { row: { original: Record<string, unknown> } }) => React.ReactNode
}

jest.mock('@open-mercato/ui/backend/DataTable', () => ({
  DataTable: ({
    title,
    columns,
    data,
    rowActions,
  }: {
    title?: React.ReactNode
    columns: MockColumn[]
    data: Record<string, unknown>[]
    rowActions?: (row: Record<string, unknown>) => React.ReactNode
  }) => (
    <div>
      <h1>{title}</h1>
      {data.map((row) => (
        <div key={String(row.id)}>
          {columns.map((column) => (
            <div key={column.id ?? column.accessorKey}>
              {column.cell
                ? column.cell({ row: { original: row } })
                : String(row[column.accessorKey ?? ''] ?? '')}
            </div>
          ))}
          {rowActions?.(row)}
        </div>
      ))}
    </div>
  ),
}))

jest.mock('@open-mercato/ui/backend/RowActions', () => ({
  RowActions: ({ items }: { items: Array<{ id: string; label: string; href?: string }> }) => (
    <div>
      {items.map((item) => (
        <a key={item.id} data-action-id={item.id} href={item.href}>{item.label}</a>
      ))}
    </div>
  ),
}))

jest.mock('@open-mercato/ui/backend/filters/ListEmptyState', () => ({
  ListEmptyState: ({ entityName }: { entityName: string }) => <div>{entityName}</div>,
}))

jest.mock('@open-mercato/ui/backend/forms', () => ({
  FormHeader: ({
    title,
    entityTypeLabel,
    statusBadge,
  }: {
    title?: React.ReactNode
    entityTypeLabel?: string
    statusBadge?: React.ReactNode
  }) => (
    <header>
      <span>{entityTypeLabel}</span>
      <h1>{title}</h1>
      {statusBadge}
    </header>
  ),
}))

jest.mock('@open-mercato/ui/backend/detail', () => ({
  LoadingMessage: ({ label }: { label: string }) => <div>{label}</div>,
  ErrorMessage: ({ label }: { label: string }) => <div>{label}</div>,
  RecordNotFoundState: ({ label }: { label: string }) => <div>{label}</div>,
  formatAttachmentFileSize: (value: number) => `${value} B`,
}))

jest.mock('@open-mercato/ui/backend/JsonDisplay', () => ({
  JsonDisplay: ({ data, title }: { data: unknown; title?: string }) => (
    <section>
      <h2>{title}</h2>
      <pre>{JSON.stringify(data)}</pre>
    </section>
  ),
}))

jest.mock('@open-mercato/ui/primitives/button', () => ({
  Button: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@open-mercato/ui/primitives/status-badge', () => ({
  StatusBadge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}))

jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({
  apiCall: jest.fn(),
}))

const apiCallMock = apiCall as jest.MockedFunction<typeof apiCall>

import AgencyCasesPage from '../backend/agency-operations/cases/page'
import AgencyCaseDetailPage from '../backend/agency-operations/cases/[id]/page'

const agencyCase = {
  id: 'case-1',
  customerEntityId: 'client-1',
  submittedByCustomerUserId: 'customer-user-1',
  title: 'Quarterly campaign brief',
  agentWorkerId: 'agency_operations.agent-worker.noop.v1',
  hasMaterial: true,
  materialFileName: 'campaign-brief.pdf',
  materialMimeType: 'application/pdf',
  materialFileSize: 2048,
  workflowInstanceId: 'workflow-1',
  createdAt: '2026-09-18T08:00:00.000Z',
  updatedAt: '2026-09-18T08:01:00.000Z',
}

function successfulCall(result: unknown) {
  return { ok: true, status: 200, result } as never
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('the employee list uses the agency case API and exposes the open detail action', async () => {
  apiCallMock.mockResolvedValue(successfulCall({
    items: [agencyCase],
    total: 1,
    totalPages: 1,
  }))

  render(<AgencyCasesPage />)

  const titleLink = await screen.findByRole('link', { name: agencyCase.title })
  expect(titleLink.getAttribute('href')).toBe('/backend/agency-operations/cases/case-1')
  expect(screen.getByRole('heading', { name: 'Agency cases' })).toBeTruthy()
  const action = screen.getByRole('link', { name: 'Open' })
  expect(action.getAttribute('data-action-id')).toBe('open')
  expect(action.getAttribute('href')).toBe('/backend/agency-operations/cases/case-1')
  expect(String(apiCallMock.mock.calls[0]?.[0])).toBe(
    '/api/agency_operations/cases?page=1&pageSize=20',
  )
})

test('the detail composes public case and workflow APIs into persisted evidence', async () => {
  apiCallMock.mockImplementation(async (input) => {
    const url = String(input)
    if (url === '/api/agency_operations/cases?id=case-1&pageSize=1') {
      return successfulCall({ items: [agencyCase], total: 1, totalPages: 1 })
    }
    if (url === '/api/workflows/instances/workflow-1') {
      return successfulCall({
        data: {
          id: 'workflow-1',
          status: 'COMPLETED',
          context: {
            agentWorkerResult: {
              executed: true,
              functionName: 'agency_operations.processCase',
              result: {
                kind: 'no_op',
                unchanged: true,
                input: { materialFileName: 'campaign-brief.pdf' },
              },
            },
          },
        },
      })
    }
    if (url === '/api/workflows/instances/workflow-1/steps?limit=100') {
      return successfulCall({
        data: [{
          stepId: 'agent_worker',
          inputData: { attachmentId: 'attachment-1' },
          outputData: { accepted: true, action: 'none' },
          errorData: null,
        }],
      })
    }
    throw new Error(`[internal] Unexpected test API URL: ${url}`)
  })

  render(<AgencyCaseDetailPage params={{ id: 'case-1' }} />)

  await waitFor(() => expect(screen.getByRole('heading', { name: agencyCase.title })).toBeTruthy())
  expect(screen.getByText('client-1')).toBeTruthy()
  expect(screen.getByText('campaign-brief.pdf')).toBeTruthy()
  expect(screen.getByText('agency_operations.agent-worker.noop.v1')).toBeTruthy()
  expect(screen.getByText('Completed')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Run input' })).toBeTruthy()
  expect(screen.getByText('{"materialFileName":"campaign-brief.pdf"}')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Run output' })).toBeTruthy()
  expect(screen.getByText('{"kind":"no_op","unchanged":true,"input":{"materialFileName":"campaign-brief.pdf"}}')).toBeTruthy()
  const materialLink = screen.getByRole('link', { name: 'Open material' })
  expect(materialLink.getAttribute('href')).toBe('/api/agency_operations/cases/case-1/material')
  const workflowLink = screen.getByRole('link', { name: 'Open workflow run' })
  expect(workflowLink.getAttribute('href')).toBe('/backend/instances/workflow-1')

  expect(new Set(apiCallMock.mock.calls.map(([input]) => String(input)))).toEqual(new Set([
    '/api/agency_operations/cases?id=case-1&pageSize=1',
    '/api/workflows/instances/workflow-1',
    '/api/workflows/instances/workflow-1/steps?limit=100',
  ]))
})

test('a missing case renders the dedicated not-found state', async () => {
  apiCallMock.mockResolvedValue(successfulCall({ items: [], total: 0, totalPages: 1 }))

  render(<AgencyCaseDetailPage params={{ id: 'missing-case' }} />)

  expect(await screen.findByText('Agency case not found.')).toBeTruthy()
})
