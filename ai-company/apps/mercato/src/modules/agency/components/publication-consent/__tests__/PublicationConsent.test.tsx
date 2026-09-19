/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PublicationConsent } from '../PublicationConsent'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/portal/hooks/usePortalAppEvent', () => ({ usePortalAppEvent: jest.fn() }))
jest.mock('@open-mercato/ui/backend/detail', () => ({ LoadingMessage: ({ label }: { label: string }) => <p>{label}</p>, ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p> }))
jest.mock('@open-mercato/ui/backend/CrudForm', () => ({
  CrudForm: function ConsentForm({ onSubmit, fields }: {
    onSubmit: (values: Record<string, unknown>) => Promise<void>
    fields: { id: string; label: string }[]
  }) {
    const [failed, setFailed] = React.useState(false)
    return <div>
      <p data-testid="consent-fields">{JSON.stringify(fields)}</p>
      {failed ? <p>retry consent</p> : null}
      <button type="button" onClick={() => { void onSubmit({ consent: true }).catch(() => setFailed(true)) }}>Consent now</button>
    </div>
  },
}))

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const taskId = id(1)
const projection = {
  ok: true as const,
  request: {
    caseId: id(2), documentId: id(3), postVersionId: id(4), version: '2.0',
    contentHash: 'immutable-content-hash', clientViewMd: 'Exact approved post text.', acceptedAt: '2026-09-19T10:00:00.000Z',
    target: { configVersionId: id(5), platform: 'discord', accountId: null, channelId: '12345678901234567', displayName: 'Configured client channel' },
  },
  canRespond: true, canSend: false as const, consentedAt: null,
}
const receipt = {
  taskId, status: 'consent_recorded' as const, consentedAt: '2026-09-19T11:00:00.000Z', replayed: false,
  preparation: { status: 'not_ready' as const, orderRef: projection.request.caseId, reason: 'pinned_input_missing' as const },
  canSend: false as const,
}
const response = (result: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, result, response: {} as Response, cacheStatus: null,
})

beforeEach(() => {
  jest.mocked(apiCall).mockReset()
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: jest.fn(() => 'publication-consent-event') })
})

test('shows the immutable approved post and exact target, then records only scoped publication consent', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response(projection)).mockResolvedValueOnce(response(receipt, 201))
  render(<PublicationConsent taskId={taskId} orgSlug="acme" canComplete taskStatus="PENDING" />)

  await screen.findByText(projection.request.clientViewMd)
  expect(screen.getAllByText(/Configured client channel.*discord.*12345678901234567/)).toHaveLength(2)
  expect(screen.getByText('agency.postReview.publicationConsentHint')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Consent now' }))
  await screen.findByText(/agency.postReview.publicationConsentSaved/)

  expect(apiCall).toHaveBeenNthCalledWith(1, `/api/agency/publication-consents/${taskId}`)
  expect(apiCall).toHaveBeenNthCalledWith(2, `/api/agency/publication-consents/${taskId}`, expect.objectContaining({ method: 'POST' }))
  expect(JSON.parse(jest.mocked(apiCall).mock.calls[1][1]?.body as string)).toEqual({
    postVersionId: projection.request.postVersionId,
    configVersionId: projection.request.target.configVersionId,
    consent: true,
    externalEventId: 'publication-consent-event',
  })
  expect(screen.queryByRole('button', { name: 'Consent now' })).toBeNull()
})

test('keeps retry payload identity stable and never offers consent without both task and projection authority', async () => {
  jest.mocked(apiCall)
    .mockResolvedValueOnce(response(projection))
    .mockResolvedValueOnce(response({ error: 'temporary' }, 500))
    .mockResolvedValueOnce(response(receipt, 201))
  const view = render(<PublicationConsent taskId={taskId} orgSlug="acme" canComplete taskStatus="PENDING" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Consent now' }))
  await screen.findByText('retry consent')
  fireEvent.click(screen.getByRole('button', { name: 'Consent now' }))
  await screen.findByText(/agency.postReview.publicationConsentSaved/)
  const writes = jest.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[0][1]?.body).toBe(writes[1][1]?.body)

  jest.mocked(apiCall).mockReset()
  jest.mocked(apiCall).mockResolvedValueOnce(response({ ...projection, canRespond: false }))
  view.unmount()
  render(<PublicationConsent taskId={taskId} orgSlug="acme" canComplete taskStatus="PENDING" />)
  await screen.findByText('agency.review.readOnly')
  expect(screen.queryByRole('button', { name: 'Consent now' })).toBeNull()
})
