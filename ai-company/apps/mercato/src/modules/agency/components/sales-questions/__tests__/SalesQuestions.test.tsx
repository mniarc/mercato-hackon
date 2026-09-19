/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { SalesQuestionItem } from '@/modules/agency_operations/lib/salesQuestions/contracts'
import { metadata } from '../../../frontend/[orgSlug]/portal/agency/questions/page.meta'
import { SalesQuestions } from '../SalesQuestions'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/backend/injection/useGuardedMutation', () => ({ useGuardedMutation: () => ({
  runMutation: ({ operation }: { operation: () => Promise<unknown> }) => operation(), retryLastMutation: jest.fn(),
}) }))
jest.mock('@open-mercato/ui/backend/detail', () => ({
  LoadingMessage: ({ label }: { label: string }) => <p>{label}</p>,
  ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p>,
}))
jest.mock('@open-mercato/ui/backend/CrudForm', () => ({
  CrudForm: ({ onSubmit }: { onSubmit: (values: Record<string, unknown>) => Promise<void> }) => {
    const [question, setQuestion] = React.useState('')
    const [error, setError] = React.useState(false)
    return <div>
      <input aria-label="Question" value={question} onChange={(event) => setQuestion(event.target.value)} />
      <button type="button" onClick={() => { void onSubmit({ question }).catch(() => setError(true)) }}>Send question</button>
      {error ? <p role="alert">Request failed</p> : null}
    </div>
  },
}))
jest.mock('@open-mercato/ui/backend/DataTable', () => ({
  DataTable: ({ data, columns }: { data: SalesQuestionItem[]; columns: {
    cell?: (context: { row: { original: SalesQuestionItem } }) => React.ReactNode
  }[] }) => <div>{data.map((item) => <div key={item.id}>{columns.map((column, index) => (
    <div key={index}>{column.cell?.({ row: { original: item } })}</div>
  ))}</div>)}</div>,
}))

const item: SalesQuestionItem = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  question: 'What does the demo include?', createdAt: '2026-09-19T12:00:00.000Z', previousQuestionId: null,
  catalogVersionId: 'demo-v1', productId: 'demo-product', state: 'waiting_configuration', answer: null,
}
const offer = { versionId: 'demo-v1', productId: 'demo-product', content: 'Exact configured demo offer' }
const response = (result: unknown, status = 200) => ({ ok: status < 300, status, result, response: {} as Response, cacheStatus: null })
const call = jest.mocked(apiCall)
const writes = () => call.mock.calls.filter(([, init]) => init?.method === 'POST')

beforeEach(() => {
  call.mockReset()
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true,
    value: jest.fn(() => 'ffffffff-ffff-4fff-8fff-ffffffffffff') })
})

test('loads and refreshes without dispatch or purchase, then explicitly retries the saved event', async () => {
  call.mockResolvedValueOnce(response({ items: [item], offer }))
    .mockResolvedValueOnce(response({ items: [item], offer }))
    .mockResolvedValueOnce(response({ item: { ...item, state: 'processing' }, replayed: true }))
  render(<SalesQuestions orgSlug="acme" />)
  await screen.findByText(item.question)
  expect(metadata.requireCustomerAuth).toBe(true)
  expect(writes()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'agency.salesQuestions.refresh' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'agency.salesQuestions.refresh' })).not.toBeDisabled())
  expect(writes()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'agency.salesQuestions.retry' }))
  await screen.findByText('agency.salesQuestions.state.processing')
  expect(JSON.parse(writes()[0][1]!.body as string)).toEqual({ eventId: item.eventId, question: item.question })
  expect(call.mock.calls.every(([url]) => url === '/api/agency/portal/questions')).toBe(true)
  expect(screen.getByRole('link', { name: 'agency.salesQuestions.purchase' })).toHaveAttribute('href', '/acme/portal/agency/order')
  expect(screen.getByRole('link', { name: 'agency.salesQuestions.exit' })).toHaveAttribute('href', '/acme/portal/agency')
})

test('reuses the same event after failed submission and preserves the typed question', async () => {
  call.mockResolvedValueOnce(response({ items: [], offer })).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(response({ item: { ...item, eventId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, replayed: true }))
  render(<SalesQuestions orgSlug="acme" />)
  fireEvent.change(await screen.findByRole('textbox', { name: 'Question' }), { target: { value: item.question } })
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
  await screen.findByText('Request failed')
  expect(screen.getByRole('textbox', { name: 'Question' })).toHaveValue(item.question)
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
  await screen.findByText(item.question)
  expect(writes()).toHaveLength(2)
  expect(writes()[0][1]!.body).toBe(writes()[1][1]!.body)
  expect(JSON.parse(writes()[0][1]!.body as string)).not.toHaveProperty('caseId')
})

test('shows the saved catalogue-bound answer and attaches an explicit follow-up to it', async () => {
  const answered: SalesQuestionItem = { ...item, state: 'answered', answer: {
    disposition: 'explain_catalog_boundary', message: 'The catalogue does not include an audit.', catalogVersionId: 'demo-v1',
    supportingCatalogPassages: ['No free audit is included.'], unresolvedQuestions: [],
  } }
  const followUp = { ...item, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', question: 'What is included instead?', previousQuestionId: item.id }
  call.mockResolvedValueOnce(response({ items: [answered], offer })).mockResolvedValueOnce(response({ item: followUp, replayed: false }))
  render(<SalesQuestions orgSlug="acme" />)
  await screen.findByText(answered.answer!.message)
  expect(screen.getByText('agency.salesQuestions.disposition.explain_catalog_boundary')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'agency.salesQuestions.followUp' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), { target: { value: followUp.question } })
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
  await screen.findByText(followUp.question)
  expect(JSON.parse(writes()[0][1]!.body as string)).toMatchObject({ question: followUp.question, previousQuestionId: item.id })
})
