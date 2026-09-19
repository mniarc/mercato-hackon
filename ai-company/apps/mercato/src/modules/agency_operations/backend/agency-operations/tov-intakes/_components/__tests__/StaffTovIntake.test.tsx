/** @jest-environment jsdom */

import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { useSearchParams } from 'next/navigation'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { StaffTovIntake } from '../StaffTovIntake'

jest.mock('next/navigation', () => ({ useSearchParams: jest.fn() }))
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ readApiResultOrThrow: jest.fn() }))
jest.mock('@open-mercato/ui/backend/CrudForm', () => ({
  CrudForm: ({ initialValues }: { initialValues: { caseId: string } }) => <div data-testid="intake-form" data-case-id={initialValues.caseId} />,
}))

beforeEach(() => {
  jest.mocked(readApiResultOrThrow).mockReset()
  jest.mocked(useSearchParams).mockReturnValue(new URLSearchParams('caseId=selected-case') as never)
})

it('loads an explicitly requested case outside the first page and preserves its return link', async () => {
  jest.mocked(readApiResultOrThrow).mockResolvedValueOnce({ items: [{ id: 'other-case', title: 'Other', customerEntityId: 'customer' }] })
    .mockResolvedValueOnce({ items: [{ id: 'selected-case', title: 'Selected', customerEntityId: 'customer' }] })
  render(<StaffTovIntake />)
  expect(await screen.findByTestId('intake-form')).toHaveAttribute('data-case-id', 'selected-case')
  expect(readApiResultOrThrow).toHaveBeenLastCalledWith('/api/agency_operations/cases?id=selected-case&pageSize=1')
  expect(screen.getByRole('link', { name: 'agencyOperations.journey.openCase' }))
    .toHaveAttribute('href', '/backend/agency-operations/cases/selected-case')
})

it('does not trust an inaccessible case from the URL or silently select another case', async () => {
  jest.mocked(readApiResultOrThrow).mockResolvedValueOnce({ items: [{ id: 'other-case', title: 'Other', customerEntityId: 'customer' }] })
    .mockResolvedValueOnce({ items: [] })
  render(<StaffTovIntake />)
  expect(await screen.findByTestId('intake-form')).toHaveAttribute('data-case-id', '')
  expect(screen.queryByRole('link', { name: 'agencyOperations.journey.openCase' })).toBeNull()
  expect(screen.getByRole('link', { name: 'agencyOperations.cases.detail.backToList' }))
    .toHaveAttribute('href', '/backend/agency-operations/cases')
})
