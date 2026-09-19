/** @jest-environment jsdom */

import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { AgencyJourneyLinks } from '../AgencyJourneyLinks'
import AgencyTasksPage from '../../AgencyTasksPage'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/core/modules/workflows/frontend/[orgSlug]/portal/tasks/page', () => ({
  __esModule: true, default: () => <div data-testid="native-tasks" />,
}))

it('keeps case and upload navigation bound to the exact supplied case', () => {
  render(<AgencyJourneyLinks orgSlug="acme" caseId="case-1" />)
  expect(screen.getByRole('link', { name: 'agency.cases.open' })).toHaveAttribute('href', '/acme/portal/agency/cases/case-1')
  expect(screen.getByRole('link', { name: 'agency.materials.link' })).toHaveAttribute('href', '/acme/portal/agency/materials?caseId=case-1')
  expect(screen.getByRole('link', { name: 'agency.cases.openTasks' })).toHaveAttribute('href', '/acme/portal/tasks')
})

it('keeps the real task landing on native work, not canned review decisions', () => {
  render(<AgencyTasksPage params={{ orgSlug: 'acme' }} />)
  expect(screen.getByTestId('native-tasks')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'agency.offer.label' })).toHaveAttribute('href', '/acme/portal/agency')
  expect(screen.getByRole('link', { name: 'agency.cases.title' })).toHaveAttribute('href', '/acme/portal/agency/cases')
  expect(document.querySelector('a[href*="tasks-demo"]')).toBeNull()
  expect(screen.queryByRole('link', { name: 'agency.materials.link' })).toBeNull()
})
