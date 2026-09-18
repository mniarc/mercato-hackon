/** @jest-environment jsdom */

import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ClientCaseItem } from '@/modules/agency_operations/lib/contracts/clientCaseQuery'
import { ClientCases } from '../ClientCases'
import { metadata as listMetadata } from '../../page.meta'
import { metadata as detailMetadata } from '../../[id]/page.meta'
import translations from '../../../../../../../i18n/en.json'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  useT: () => (key: string) => (translations as Record<string, string>)[key] ?? key,
}))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/backend/DataTable', () => ({
  DataTable: ({ data, rowActions, pagination, error, actions, isLoading }: {
    data: ClientCaseItem[]; rowActions: (row: ClientCaseItem) => React.ReactNode;
    pagination: { onPageChange: (page: number) => void }; error: string | null;
    actions: React.ReactNode; isLoading: boolean;
  }) => <div>
    {actions}
    {error ? <p role="alert">{error}</p> : null}
    {data.map((row) => <div key={row.caseId}>{row.title}{rowActions(row)}</div>)}
    <button disabled={isLoading} onClick={() => pagination.onPageChange(2)}>Next</button>
  </div>,
}))
jest.mock('@open-mercato/ui/backend/RowActions', () => ({
  RowActions: ({ items }: { items: Array<{ id: string; label: string; href: string }> }) =>
    items.map((item) => <a key={item.id} href={item.href}>{item.label}</a>),
}))

const call = jest.mocked(apiCall)
const caseId = 'b0c463a3-60d1-44ef-b828-d55d3e27104e'
const success = {
  ok: true, status: 200, response: {} as Response, cacheStatus: null,
  result: { items: [{ caseId, title: 'Saved request' }], total: 21, totalPages: 2, page: 1, pageSize: 20 },
}

beforeEach(() => call.mockReset())

it('reopens a persisted case through a guarded, bookmarkable detail route and supports pagination', async () => {
  call.mockResolvedValue(success)
  render(<ClientCases orgSlug="acme" />)
  const link = await screen.findByRole('link', { name: 'Open case' })
  expect(link).toHaveAttribute('href', `/acme/portal/agency/cases/${caseId}`)
  expect(call).toHaveBeenCalledWith('/api/agency/portal/cases?page=1&pageSize=20')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Saved request')
  expect(call).toHaveBeenLastCalledWith('/api/agency/portal/cases?page=2&pageSize=20')
  expect(listMetadata.requireCustomerAuth).toBe(true)
  expect(detailMetadata.requireCustomerAuth).toBe(true)
  expect(listMetadata.nav?.labelKey).toBe('agency.cases.title')
})

it('shows a retryable load error rather than a fabricated empty case list', async () => {
  call.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(success)
  render(<ClientCases orgSlug="acme" />)
  expect(await screen.findByRole('alert')).toHaveTextContent(translations['agency.cases.loadError'])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
  expect(await screen.findByText('Saved request')).toBeTruthy()
})
