/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { AgencySourceRecoveryAction } from '../AgencySourceRecoveryAction'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ readApiResultOrThrow: jest.fn() }))
jest.mock('@open-mercato/ui/backend/injection/useGuardedMutation', () => ({ useGuardedMutation: jest.fn() }))
jest.mock('@open-mercato/ui/backend/detail', () => ({ ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p> }))
const key = 'agencyOperations.cases.process.sourceRecovery'
const onResumed = jest.fn(), retryLastMutation = jest.fn()
const runMutation = jest.fn(async ({ operation }: { operation: () => Promise<unknown> }) => operation())

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useGuardedMutation).mockReturnValue({ runMutation, retryLastMutation } as never)
})

test('uses the native mutation hook and exact displayed workflow, then refreshes the case', async () => {
  jest.mocked(readApiResultOrThrow).mockResolvedValue({ status: 'RUNNING' })
  render(<AgencySourceRecoveryAction caseId="case-1" workflowInstanceId="analysis-1" onResumed={onResumed} />)
  fireEvent.click(screen.getByRole('button', { name: `${key}.resume` }))
  await waitFor(() => expect(onResumed).toHaveBeenCalledTimes(1))
  expect(readApiResultOrThrow).toHaveBeenCalledWith('/api/agency_operations/cases/case-1/resume-source-analysis',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ workflowInstanceId: 'analysis-1' }) }), expect.anything())
  expect(runMutation).toHaveBeenCalledWith(expect.objectContaining({
    context: expect.objectContaining({ recordId: 'case-1', retryLastMutation }),
  }))
})

test('keeps a rejected or stale recovery on screen without claiming successful resumption', async () => {
  jest.mocked(readApiResultOrThrow).mockRejectedValue(new Error('stale'))
  render(<AgencySourceRecoveryAction caseId="case-1" workflowInstanceId="analysis-1" onResumed={onResumed} />)
  fireEvent.click(screen.getByRole('button', { name: `${key}.resume` }))
  expect(await screen.findByRole('alert')).toHaveTextContent(`${key}.failed`)
  expect(onResumed).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: `${key}.resume` })).not.toBeDisabled()
})
