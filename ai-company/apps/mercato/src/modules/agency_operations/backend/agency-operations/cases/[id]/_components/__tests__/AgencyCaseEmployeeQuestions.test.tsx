/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import type { EmployeeQuestionList } from '../../../../../../lib/employeeQuestions/contracts'
import { AgencyCaseEmployeeQuestions } from '../AgencyCaseEmployeeQuestions'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn(), readApiResultOrThrow: jest.fn() }))
jest.mock('@open-mercato/ui/backend/FlashMessages', () => ({ flash: jest.fn() }))
jest.mock('@open-mercato/ui/backend/DataTable', () => ({ DataTable: ({ data }: { data: unknown }) => <div>{JSON.stringify(data)}</div> }))
jest.mock('@open-mercato/ui/backend/CrudForm', () => ({ CrudForm: ({ onSubmit, submitLabel }: { onSubmit: (values: unknown) => Promise<void>; submitLabel: string }) => {
  const [error, setError] = React.useState<string | null>(null)
  return <form onSubmit={(event) => { event.preventDefault(); void onSubmit({ parentTaskId: 'parent-1', question: 'What evidence can you provide?', documentVersionId: '' }).catch((failure: Error) => setError(failure.message)) }}>
    {error ? <p>{error}</p> : null}<button type="submit">{submitLabel}</button>
  </form>
} }))

const key = 'agencyOperations.cases.employeeQuestions'
const data: EmployeeQuestionList = { configured: true, parents: [{ taskId: 'parent-1', taskName: 'Missing evidence', status: 'PENDING', canAsk: true }], questions: [] }
beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => 'event-1' })
  jest.mocked(apiCall).mockResolvedValue({ ok: true, result: data } as never)
})

test('only an eligible owned exception can ask; unconfigured state is explicit', async () => {
  jest.mocked(apiCall).mockResolvedValue({ ok: true, result: { ...data, configured: false, parents: [{ ...data.parents[0], canAsk: false }] } } as never)
  render(<AgencyCaseEmployeeQuestions caseId="case-1" updatedAt={null} />)
  expect(await screen.findByText(`${key}.notConfigured`)).toBeTruthy()
  expect(screen.queryByRole('button', { name: `${key}.send` })).toBeNull()
  expect(readApiResultOrThrow).not.toHaveBeenCalled()
})

test('employee question uses the staff route and a stable event across failed submission retry', async () => {
  jest.mocked(readApiResultOrThrow).mockRejectedValueOnce(new Error('network-failure')).mockResolvedValueOnce({ replayed: true })
  render(<AgencyCaseEmployeeQuestions caseId="case-1" updatedAt={null} />)
  fireEvent.click(await screen.findByRole('button', { name: `${key}.send` }))
  await screen.findByText('network-failure')
  fireEvent.click(screen.getByRole('button', { name: `${key}.send` }))
  await waitFor(() => expect(readApiResultOrThrow).toHaveBeenCalledTimes(2))
  const calls = jest.mocked(readApiResultOrThrow).mock.calls
  expect(calls[0][0]).toBe('/api/agency_operations/cases/case-1/questions')
  expect(JSON.parse(calls[0][1]?.body as string)).toEqual({ parentTaskId: 'parent-1', question: 'What evidence can you provide?', eventId: 'event-1' })
  expect(calls[1][1]?.body).toBe(calls[0][1]?.body)
})
