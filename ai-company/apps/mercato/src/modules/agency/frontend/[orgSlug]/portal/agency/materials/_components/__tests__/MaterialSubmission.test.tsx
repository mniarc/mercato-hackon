/** @jest-environment jsdom */

import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@open-mercato/shared/lib/testing/renderWithProviders'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import MaterialSubmission from '../MaterialSubmission'
import translations from '../../../../../../../i18n/en.json'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/acme/portal/agency/materials',
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('remark-gfm', () => ({ __esModule: true, default: {} }))
jest.mock('@open-mercato/ui/backend/injection/InjectionSpot', () => ({
  InjectionSpot: () => null,
  useInjectionWidgets: () => ({ widgets: [], loading: false, error: null }),
  useInjectionSpotEvents: () => ({
    triggerEvent: async (_event: string, data: Record<string, unknown>) => ({ ok: true, data }),
  }),
}))
jest.mock('@open-mercato/ui/backend/injection/useInjectionDataWidgets', () => ({
  useInjectionDataWidgets: () => ({ widgets: [], isLoading: false, error: null }),
}))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({
  ...jest.requireActual('@open-mercato/ui/backend/utils/apiCall'),
  readApiResultOrThrow: jest.fn(),
}))
jest.mock('../CaseStatus', () => ({ CaseStatus: () => null }))

it('does not expose editable server-rendered inputs before hydration', () => {
  const html = renderToString(
    <I18nProvider locale="en" dict={translations}><MaterialSubmission orgSlug="acme" /></I18nProvider>,
  )
  expect(html).toContain('data-material-form-ready="0"')
  expect(html).not.toContain('aria-label="Title"')
  expect(html).not.toContain('type="file"')
})

it('retains title when a file is selected and submits both through the real CrudForm', async () => {
  jest.mocked(readApiResultOrThrow).mockResolvedValue({ caseId: 'created-case', status: 'COMPLETED' })
  renderWithProviders(<MaterialSubmission orgSlug="acme" />, { dict: translations })
  const title = screen.getByRole('textbox', { name: 'Title' })
  const material = new File(['source material'], 'material.txt', { type: 'text/plain' })
  fireEvent.change(title, { target: { value: 'Client request' } })
  await act(async () => { await Promise.resolve() })
  expect(title).toHaveValue('Client request')
  fireEvent.change(screen.getByLabelText('Material file'), { target: { files: [material] } })
  await act(async () => { await Promise.resolve() })
  expect(title).toHaveValue('Client request')
  fireEvent.click(screen.getByRole('button', { name: 'Submit material' }))
  await waitFor(() => expect(readApiResultOrThrow).toHaveBeenCalledTimes(1))
  const request = jest.mocked(readApiResultOrThrow).mock.calls[0][1]
  const body = request?.body as FormData
  expect(body.get('title')).toBe('Client request')
  expect(body.get('file')).toBe(material)
})
