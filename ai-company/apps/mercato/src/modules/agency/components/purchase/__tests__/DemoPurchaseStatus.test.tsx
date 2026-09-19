/** @jest-environment jsdom */
import * as React from 'react'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@open-mercato/shared/lib/testing/renderWithProviders'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { DemoPurchaseStatus } from '../DemoPurchaseStatus'
import { useDemoPurchase, type DemoPurchaseReceipt } from '../useDemoPurchase'
import translations from '../../../i18n/en.json'
import { demoOffer } from '@/modules/agency_operations/lib/orderBootstrap/demoOffer'

const mockTranslate = (key: string) => translations[key as keyof typeof translations] ?? key
jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  ...jest.requireActual('@open-mercato/shared/lib/i18n/context'),
  useT: () => mockTranslate,
}))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/backend/injection/useGuardedMutation', () => ({
  useGuardedMutation: () => ({ runMutation: ({ operation }: { operation: () => Promise<unknown> }) => operation() }),
}))
jest.mock('../../customer-onboarding/ensureCustomerOnboarding', () => ({ ensureCustomerOnboarding: jest.fn() }))

const id = '00000000-0000-4000-8000-000000000001'
const receipt: DemoPurchaseReceipt = { orderId: id, paymentId: id, providerSessionId: 'test-session', status: 'paid', caseId: id, workflowInstanceId: id }
beforeEach(() => {
  jest.mocked(apiCall).mockReset()
  window.history.replaceState(null, '', '/acme/portal/agency/order')
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => id })
})
const processingStates: NonNullable<DemoPurchaseReceipt['processing']>[] = [
  { state: 'ready', workflowInstanceId: id },
  { state: 'started', workflowInstanceId: id, nativeStatus: 'WAITING_FOR_ACTIVITIES', replayed: false },
  { state: 'waiting_configuration', reason: 'execution_disabled' },
  { state: 'attention_required', workflowInstanceId: id, reason: 'workflow_not_running', nativeStatus: 'FAILED' },
]

test.each(processingStates)('shows saved processing $state separately from payment without a new action', (processing) => {
  renderWithProviders(<DemoPurchaseStatus receipt={{ ...receipt, processing }} orgSlug="acme" enabled busy={false} error={null}
    confirm={jest.fn()} refresh={jest.fn()} retryPayment={jest.fn()} />, { dict: translations })
  expect(screen.getByText(translations['agency.purchase.paid'])).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent(translations[`agency.purchase.processing.${processing.state}`])
  if ('reason' in processing) expect(screen.getByRole('status')).toHaveTextContent(translations[`agency.purchase.processing.reason.${processing.reason}`])
  if ('nativeStatus' in processing) expect(screen.getByRole('status')).toHaveTextContent(processing.nativeStatus)
  expect(screen.queryByRole('button', { name: /retry|confirm/i })).not.toBeInTheDocument()
})

test('the purchase hook preserves the server processing receipt', async () => {
  const processing = processingStates[2]
  jest.mocked(apiCall).mockResolvedValueOnce({ ok: true, result: { enabled: true, demoOnly: true, sku: 'demo', name: 'Demo', amount: 2500, currency: 'PLN', offerVersion: '1', termsVersion: '1', terms: { en: 'Demo', pl: 'Demo' }, provider: 'mock_processing' } } as never)
    .mockResolvedValueOnce({ ok: true, result: { ...receipt, processing } } as never)
  const { result } = renderHook(() => useDemoPurchase('acme'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => { await result.current.start({ brandDisplayName: 'Brand' } as Parameters<typeof result.current.start>[0]) })
  expect(result.current.receipt?.processing).toEqual(processing)
  expect(new URL(window.location.href).searchParams.get('orderId')).toBe(id)
})

test('reload reads the acknowledged order from its scoped API and foreign or invalid links expose no receipt', async () => {
  const offer = { enabled: true, demoOnly: true, sku: 'demo', name: 'Current offer', amount: 2500, currency: 'PLN', offerVersion: 'new', termsVersion: 'new', terms: { en: 'Current', pl: 'Bieżące' }, provider: 'mock_processing' }
  const purchaseHistory = { state: 'unavailable' as const, reason: 'content_not_recorded' as const,
    offerVersion: 'saved-old', termsVersion: 'saved-old', acceptedAt: '2026-09-19T10:00:00.000Z' }
  window.history.replaceState(null, '', `?orderId=${id}`)
  jest.mocked(apiCall).mockResolvedValueOnce({ ok: true, result: offer } as never)
    .mockResolvedValueOnce({ ok: true, result: { ...receipt, purchaseHistory } } as never)
  const loaded = renderHook(() => useDemoPurchase('acme'))
  await waitFor(() => expect(loaded.result.current.loading).toBe(false))
  expect(loaded.result.current.receipt?.purchaseHistory).toEqual(purchaseHistory)
  expect(apiCall).toHaveBeenCalledWith(`/api/agency/portal/purchases/${id}`)
  loaded.unmount()
  jest.mocked(apiCall).mockResolvedValueOnce({ ok: true, result: offer } as never)
    .mockResolvedValueOnce({ ok: false, status: 404, result: { error: 'not found' } } as never)
  const foreign = renderHook(() => useDemoPurchase('acme'))
  await waitFor(() => expect(foreign.result.current.loading).toBe(false))
  expect(foreign.result.current.receipt).toBeNull()
  expect(foreign.result.current.offer).toBeNull()
  expect(foreign.result.current.error).toBe(translations['agency.purchase.history.loadError'])
  foreign.unmount()
  jest.mocked(apiCall).mockClear()
  window.history.replaceState(null, '', '?orderId=invalid')
  const invalid = renderHook(() => useDemoPurchase('acme'))
  await waitFor(() => expect(invalid.result.current.loading).toBe(false))
  expect(invalid.result.current.receipt).toBeNull()
  expect(apiCall).not.toHaveBeenCalled()
})

test('blocked payment offers confirmation only when the server permits it, retaining refresh and failed-payment retry', () => {
  const callbacks = { confirm: jest.fn(), refresh: jest.fn(), retryPayment: jest.fn() }
  const blocked: DemoPurchaseReceipt = { ...receipt, status: 'blocked', caseId: null, workflowInstanceId: null,
    canConfirmPayment: false, canRetryPayment: false, reason: 'Native test payment is cancelled.' }
  const view = renderWithProviders(<DemoPurchaseStatus receipt={blocked} orgSlug="acme" enabled busy={false} error={null} {...callbacks} />, { dict: translations })
  expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: translations['agency.purchase.refresh'] })).toBeVisible()
  view.rerender(<DemoPurchaseStatus receipt={{ ...blocked, canConfirmPayment: true }} orgSlug="acme" enabled busy={false} error={null} {...callbacks} />)
  expect(screen.getByRole('button', { name: translations['agency.purchase.retryConfirm'] })).toBeVisible()
  view.rerender(<DemoPurchaseStatus receipt={{ ...blocked, canRetryPayment: true }} orgSlug="acme" enabled busy={false} error={null} {...callbacks} />)
  expect(screen.getByRole('button', { name: translations['agency.purchase.retryPayment'] })).toBeVisible()
  expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
})

test('customer reads the saved purchased text in Polish without rewriting it from the current catalogue', () => {
  const offer = { ...demoOffer, name: 'Zapisana oferta', offerVersion: 'offer-at-purchase', termsVersion: 'terms-at-purchase',
    terms: { en: 'Historical English terms.', pl: 'Pierwotnie przyjęte warunki — dokładny zapis.' } }
  renderWithProviders(<DemoPurchaseStatus receipt={{ ...receipt, purchaseHistory: { state: 'available', offer,
    offerVersion: offer.offerVersion, termsVersion: offer.termsVersion, acceptedAt: '2026-09-19T10:00:00.000Z' } }}
    orgSlug="acme" enabled busy={false} error={null} confirm={jest.fn()} refresh={jest.fn()} retryPayment={jest.fn()} />,
  { dict: translations, locale: 'pl' })
  expect(screen.getByText(offer.terms.pl)).toBeVisible()
  expect(screen.getByText('offer-at-purchase')).toBeVisible()
  expect(screen.getByText('terms-at-purchase')).toBeVisible()
  expect(screen.queryByText(demoOffer.terms.pl)).not.toBeInTheDocument()
})

test('legacy history explicitly reports unavailable text instead of presenting today’s terms', () => {
  renderWithProviders(<DemoPurchaseStatus receipt={{ ...receipt, purchaseHistory: { state: 'unavailable', reason: 'content_not_recorded',
    offerVersion: 'legacy-offer', termsVersion: 'legacy-terms', acceptedAt: '2026-09-19T10:00:00.000Z' } }}
    orgSlug="acme" enabled busy={false} error={null} confirm={jest.fn()} refresh={jest.fn()} retryPayment={jest.fn()} />,
  { dict: translations })
  expect(screen.getByText(translations['agency.purchase.history.unavailable'])).toBeVisible()
  expect(screen.getByText('legacy-offer')).toBeVisible()
  expect(screen.queryByText(demoOffer.terms.en)).not.toBeInTheDocument()
})
