/** @jest-environment jsdom */
import * as React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ResearchLineage } from '../ResearchLineage'

jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/JsonDisplay', () => ({ JsonDisplay: ({ data }: { data: unknown }) => <pre data-testid="stored-version">{JSON.stringify(data)}</pre> }))
const key = 'agencyOperations.cases.researchLineage'
const post = { id: 'post-version', order_id: 'case-one', template_id: 'WZR-POST', version: '3.0', status: 'needs_review',
  input_versions: [{ document_id: 'KLI-PLAN@case-one', version: '1.0' }], approval_records: [] }
const oldPlan = { id: 'old-plan', order_id: 'case-one', template_id: 'WZR-PLAN', version: '1.0', status: 'approved', input_versions: [],
  approval_records: [{ person: 'customer-1', at: '2026-09-19T10:00:00Z', scope: 'plan', version: '1.0' }], data: { title: 'Historical input' } }
const newPlan = { ...oldPlan, id: 'new-plan', version: '2.0', status: 'needs_review', approval_records: [], data: { title: 'Latest input' } }
const success = (result: unknown) => ({ ok: true, status: 200, result }) as never
beforeEach(() => jest.resetAllMocks())

test('opens the exact historical dependency rather than the newest version, preserving its recorded decision', async () => {
  jest.mocked(apiCall).mockImplementation(async (url) => String(url).includes('order_ref=') ? success({ items: [newPlan, oldPlan] }) : success(oldPlan))
  render(<ResearchLineage caseId="case-one" initialVersion={post} />)
  expect(apiCall).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'KLI-PLAN@case-one · 1.0' }))
  expect(await screen.findByText('plan · 1.0 · customer-1 · 2026-09-19T10:00:00Z')).toBeTruthy()
  expect(apiCall).toHaveBeenNthCalledWith(1, '/api/agency_research/document-versions?order_ref=case-one&template_id=WZR-PLAN')
  expect(apiCall).toHaveBeenNthCalledWith(2, '/api/agency_research/document-versions?id=old-plan')
  expect(screen.getByTestId('stored-version').textContent).toContain('Historical input')
  fireEvent.click(screen.getByRole('button', { name: `${key}.history` }))
  fireEvent.click(await screen.findByRole('button', { name: '2.0 · needs_review' }))
  // An endpoint returning a different version must not replace the selected historical record.
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByTestId('stored-version').textContent).toContain('Historical input')
  fireEvent.click(screen.getByRole('button', { name: `${key}.back` }))
  expect(screen.getByTestId('stored-version').textContent).toContain('post-version')
})
test('missing exact version never silently falls back to latest', async () => {
  jest.mocked(apiCall).mockResolvedValue(success({ items: [newPlan] }))
  render(<ResearchLineage caseId="case-one" initialVersion={post} />)
  fireEvent.click(screen.getByRole('button', { name: 'KLI-PLAN@case-one · 1.0' }))
  expect((await screen.findByRole('alert')).textContent).toBe(`${key}.unavailable`)
  expect(apiCall).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('stored-version').textContent).toContain('post-version')
})
test('foreign references never issue a request; forbidden history remains explicit', async () => {
  jest.mocked(apiCall).mockResolvedValue({ ok: false, status: 403, result: null } as never)
  render(<ResearchLineage caseId="case-one" initialVersion={{ ...post, input_versions: [{ document_id: 'KLI-PLAN@other-case', version: '1.0' }] }} />)
  expect((screen.getByRole('button', { name: 'KLI-PLAN@other-case · 1.0' }) as HTMLButtonElement).disabled).toBe(true)
  expect(apiCall).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: `${key}.history` }))
  expect((await screen.findByRole('alert')).textContent).toBe(`${key}.forbidden`)
})
test('a foreign API row is not displayed and unmount ignores an outstanding response', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(success({ items: [{ ...oldPlan, order_id: 'other-case' }] }))
  const view = render(<ResearchLineage caseId="case-one" initialVersion={post} />)
  fireEvent.click(screen.getByRole('button', { name: 'KLI-PLAN@case-one · 1.0' }))
  await screen.findByRole('alert')
  expect(screen.getByTestId('stored-version').textContent).toContain('post-version')
  let finish!: (value: never) => void
  jest.mocked(apiCall).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }) as never)
  fireEvent.click(screen.getByRole('button', { name: `${key}.history` }))
  await waitFor(() => expect(apiCall).toHaveBeenCalledTimes(2))
  view.unmount()
  await act(async () => { finish(success({ items: [post] })) })
  expect(screen.queryByTestId('stored-version')).toBeNull()
})
