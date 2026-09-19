/** @jest-environment jsdom */

import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import AgencyDashboardPage from '../AgencyDashboardPage'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/portal/PortalContext', () => ({ usePortalContext: jest.fn() }))
jest.mock('@open-mercato/core/modules/portal/frontend/[orgSlug]/portal/dashboard/page', () => ({
  __esModule: true, default: () => <div data-testid="native-dashboard" />,
}))

it('keeps the native dashboard and gives a signed-in customer the real agency entry points', () => {
  jest.mocked(usePortalContext).mockReturnValue({ auth: { user: { id: 'customer' } } } as never)
  render(<AgencyDashboardPage params={{ orgSlug: 'acme' }} />)
  expect(screen.getByTestId('native-dashboard')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agency.offer.label' })).toHaveAttribute('href', '/acme/portal/agency')
  expect(screen.getByRole('link', { name: 'agency.cases.title' })).toHaveAttribute('href', '/acme/portal/agency/cases')
  expect(screen.getByRole('link', { name: 'agency.cases.openTasks' })).toHaveAttribute('href', '/acme/portal/tasks')
})

it('leaves anonymous authentication handling to the native dashboard', () => {
  jest.mocked(usePortalContext).mockReturnValue({ auth: { user: null } } as never)
  render(<AgencyDashboardPage params={{ orgSlug: 'acme' }} />)
  expect(screen.getByTestId('native-dashboard')).toBeTruthy()
  expect(screen.queryByRole('navigation')).toBeNull()
})
