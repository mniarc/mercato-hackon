/** @jest-environment jsdom */

import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import type { CrudField } from '@open-mercato/ui/backend/CrudForm'
import { AgencyCaseEscalation } from '../AgencyCaseEscalation'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn(), readApiResultOrThrow: jest.fn() }))
jest.mock('@open-mercato/ui/backend/FlashMessages', () => ({ flash: jest.fn() }))
jest.mock('@open-mercato/ui/backend/CrudForm', () => ({
  CrudForm: ({ onSubmit, submitLabel, fields }: { onSubmit: (values: { reason: string; evidence: string }) => Promise<void>; submitLabel: string; fields: CrudField[] }) => {
    const [error, setError] = React.useState<string | null>(null)
    const [values, setValues] = React.useState({ reason: 'Client needs help', evidence: 'See original material' })
    return (
      <form onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(values).catch((failure: Error) => setError(failure.message))
      }}>
        {fields.map((field) => field.type === 'custom' ? (
          <div key={field.id}>
            {field.component({
              id: field.id,
              value: values[field.id as keyof typeof values],
              setValue: (value) => setValues((previous) => ({ ...previous, [field.id]: value })),
            })}
          </div>
        ) : null)}
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">{submitLabel}</button>
      </form>
    )
  },
}))

const callMock = jest.mocked(apiCall)
const submitMock = jest.mocked(readApiResultOrThrow)
const actionLabel = 'agencyOperations.cases.escalation.action'
const submitLabel = 'agencyOperations.cases.escalation.submit'

beforeEach(() => jest.clearAllMocks())

test('staff without escalation permission do not get a mutation action', async () => {
  callMock.mockResolvedValue({ ok: true, result: { granted: ['agency_operations.cases.view'] } } as never)

  render(<AgencyCaseEscalation caseId="case-1" updatedAt={null} />)

  await waitFor(() => expect(callMock).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('button', { name: actionLabel })).toBeNull()
  expect(submitMock).not.toHaveBeenCalled()
})

test('authorized escalation sends only reason/evidence and links the returned native workflow', async () => {
  callMock.mockResolvedValue({ ok: true, result: { granted: ['agency_operations.*', 'customers.*'] } } as never)
  submitMock.mockResolvedValue({ caseId: 'case-1', workflowInstanceId: 'attention-1', deduplicated: false })

  render(<AgencyCaseEscalation caseId="case-1" updatedAt={null} />)
  fireEvent.click(await screen.findByRole('button', { name: actionLabel }))
  expect(screen.getByRole('textbox', { name: 'agencyOperations.cases.escalation.reason' })).toBeTruthy()
  expect(screen.getByLabelText('agencyOperations.cases.escalation.evidence')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: submitLabel }))

  const workflowLink = await screen.findByRole('link', { name: 'agencyOperations.cases.escalation.workflow' })
  expect(workflowLink.getAttribute('href')).toBe('/backend/instances/attention-1')
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.escalation.inbox' }).getAttribute('href')).toBe('/backend/work-inbox')
  expect(submitMock).toHaveBeenCalledWith(
    '/api/agency_operations/cases/case-1/escalate',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'Client needs help', evidence: 'See original material' }) }),
    expect.any(Object),
  )
})

test('a rejected request leaves the form open without claiming success', async () => {
  callMock.mockResolvedValue({ ok: true, result: { granted: ['*'] } } as never)
  submitMock.mockRejectedValue(new Error('Access denied'))

  render(<AgencyCaseEscalation caseId="case-1" updatedAt={null} />)
  fireEvent.click(await screen.findByRole('button', { name: actionLabel }))
  fireEvent.click(screen.getByRole('button', { name: submitLabel }))

  expect(await screen.findByText('Access denied')).toBeTruthy()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'agencyOperations.cases.escalation.workflow' })).toBeNull()
})
