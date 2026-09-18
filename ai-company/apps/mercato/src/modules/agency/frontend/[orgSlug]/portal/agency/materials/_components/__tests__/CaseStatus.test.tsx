/** @jest-environment jsdom */

import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { CaseStatus } from '../CaseStatus'
import translations from '../../../../../../../i18n/en.json'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  useT: () => (key: string) => (translations as Record<string, string>)[key] ?? key,
}))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/backend/detail', () => ({
  LoadingMessage: ({ label }: { label: string }) => <p>{label}</p>,
  ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p>,
}))

const call = jest.mocked(apiCall)
const caseId = 'a78b6635-fbbc-4f8e-8b2d-1c6eaa4c8d6e'

function response(status: number, workflowStatus: string | null = null) {
  return {
    ok: status === 200, status, cacheStatus: null,
    response: {} as Response,
    result: status === 200 ? { caseId, workflow: workflowStatus ? { status: workflowStatus } : null } : null,
  }
}

beforeEach(() => call.mockReset())

it('reads real status and refreshes without resubmitting material', async () => {
  call.mockResolvedValueOnce(response(200, 'RUNNING'))
    .mockResolvedValueOnce(response(200, 'COMPLETED'))
  render(<CaseStatus caseId={caseId} />)
  expect(await screen.findByText(translations['agency.materials.status.RUNNING'])).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: translations['agency.materials.refreshStatus'] }))
  expect(await screen.findByText(translations['agency.materials.status.COMPLETED'])).toBeTruthy()
  expect(call.mock.calls).toEqual([
    [`/api/agency/portal/cases/${caseId}`],
    [`/api/agency/portal/cases/${caseId}`],
  ])
})

it.each(['FAILED', 'CANCELLED'] as const)('does not report %s as successful or queued', async (status) => {
  call.mockResolvedValueOnce(response(200, status))
  render(<CaseStatus caseId={caseId} />)
  expect(await screen.findByRole('status')).toHaveTextContent(translations[`agency.materials.status.${status}`])
  expect(screen.queryByText(translations['agency.materials.status.COMPLETED'])).toBeNull()
})

it('keeps a failed status read recoverable without claiming processing failed', async () => {
  call.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(200))
  render(<CaseStatus caseId={caseId} />)
  expect(await screen.findByRole('alert')).toHaveTextContent(translations['agency.materials.loadError'])
  fireEvent.click(screen.getByRole('button', { name: translations['agency.materials.refreshStatus'] }))
  expect(await screen.findByRole('status')).toHaveTextContent(translations['agency.materials.status.UNAVAILABLE'])
})
