/** @jest-environment jsdom */

import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@open-mercato/shared/lib/testing/renderWithProviders'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import MaterialSubmission from '../MaterialSubmission'
import translations from '../../../../../../../i18n/en.json'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/acme/portal/agency/materials',
  useSearchParams: () => new URLSearchParams('caseId=00000000-0000-4000-8000-000000000005'),
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

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => undefined
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined
if (typeof Response === 'undefined') Object.defineProperty(globalThis, 'Response', { value: class Response {}, configurable: true })

const caseId = '00000000-0000-4000-8000-000000000005'
const ownedCase = { caseId, title: 'Purchased case' }
beforeEach(() => {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => '00000000-0000-4000-8000-000000000099' })
  jest.mocked(readApiResultOrThrow).mockReset()
  jest.mocked(readApiResultOrThrow).mockImplementation(async (url) => {
    if (String(url).includes('/cases?')) return { items: [ownedCase] } as never
    return { caseId, attachmentId: 'attachment', submissionId: 'submission', replayed: false, state: 'saved_waiting_for_triage' } as never
  })
})

it('does not expose editable server-rendered inputs before owned cases have loaded', () => {
  const html = renderToString(<I18nProvider locale="en" dict={translations}><MaterialSubmission orgSlug="acme" /></I18nProvider>)
  expect(html).toContain('data-material-form-ready="0"')
  expect(html).not.toContain('type="file"')
})

it('uploads raw material to the selected existing case without internal process JSON or a new-case title', async () => {
  renderWithProviders(<MaterialSubmission orgSlug="acme" />, { dict: translations })
  const material = new File(['raw client material'], 'client.txt', { type: 'text/plain' })
  const file = await screen.findByLabelText('Material file')
  fireEvent.change(file, { target: { files: [material] } })
  const message = screen.getByRole('textbox', { name: translations['agency.materials.supplement.message'] })
  expect(screen.getByLabelText(translations['agency.materials.supplement.message'])).toBe(message)
  fireEvent.change(message, { target: { value: '  Original words  ' } })
  fireEvent.click(within(message.closest('form')!).getByRole('button', { name: 'Submit material' }))
  await waitFor(() => expect(readApiResultOrThrow).toHaveBeenCalledWith('/api/agency/portal/materials', expect.anything()))
  const call = jest.mocked(readApiResultOrThrow).mock.calls.find(([url]) => url === '/api/agency/portal/materials')!
  const body = call[1]?.body as FormData
  expect(body.get('caseId')).toBe(caseId)
  expect(body.get('text')).toBe('  Original words  ')
  expect(body.get('file')).toBe(material)
  expect(body.get('eventId')).toBeTruthy()
  expect(body.has('process')).toBe(false)
  expect(body.has('title')).toBe(false)
  expect(await screen.findByText(translations['agency.materials.supplement.saved_waiting_for_triage'])).toBeVisible()
  expect(screen.getByRole('link', { name: translations['agency.cases.open'] })).toHaveAttribute('href', `/acme/portal/agency/cases/${caseId}`)
})

it('does not offer a no-op intake fallback when owned cases cannot load', async () => {
  jest.mocked(readApiResultOrThrow).mockRejectedValue(new Error('Unavailable'))
  renderWithProviders(<MaterialSubmission orgSlug="acme" />, { dict: translations })
  expect(await screen.findByRole('alert')).toHaveTextContent(translations['agency.materials.supplement.loadFailed'])
  expect(screen.queryByRole('button', { name: 'Submit material' })).not.toBeInTheDocument()
})
