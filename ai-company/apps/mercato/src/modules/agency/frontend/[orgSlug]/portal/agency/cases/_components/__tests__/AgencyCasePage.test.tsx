/** @jest-environment jsdom */

import * as React from 'react'
import { render, screen } from '@testing-library/react'
import AgencyCasePage from '../../[id]/page'
import translations from '../../../../../../../i18n/en.json'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  useT: () => (key: string) => (translations as Record<string, string>)[key] ?? key,
}))
jest.mock('../../../materials/_components/CaseStatus', () => ({
  CaseStatus: ({ caseId, showMaterial }: { caseId: string; showMaterial: boolean }) =>
    <div data-testid="case-status" data-case-id={caseId} data-show-material={showMaterial} />,
}))
jest.mock('../CaseConversation', () => ({
  CaseConversation: ({ caseId }: { caseId: string }) =>
    <div data-testid="case-conversation" data-case-id={caseId} />,
}))

it('links the case to its organization task inbox without presenting intake completion as case completion', () => {
  const caseId = 'b0c463a3-60d1-44ef-b828-d55d3e27104e'
  render(<AgencyCasePage params={{ orgSlug: 'acme', id: caseId }} />)

  expect(screen.getByRole('link', { name: translations['agency.cases.openTasks'] }))
    .toHaveAttribute('href', '/acme/portal/tasks')
  expect(screen.getByRole('heading', { name: translations['agency.cases.intakeStatus'] })).toBeTruthy()
  expect(screen.getByText(translations['agency.cases.reviewTasksHint'])).toBeTruthy()
  expect(screen.getByTestId('case-status')).toHaveAttribute('data-case-id', caseId)
  expect(screen.getByTestId('case-status')).toHaveAttribute('data-show-material', 'true')
  expect(screen.getByTestId('case-conversation')).toHaveAttribute('data-case-id', caseId)
})
