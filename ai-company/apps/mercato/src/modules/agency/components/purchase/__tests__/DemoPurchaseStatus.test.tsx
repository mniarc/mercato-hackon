/** @jest-environment jsdom */
import * as React from 'react'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@open-mercato/shared/lib/testing/renderWithProviders'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { DemoPurchaseStatus } from '../DemoPurchaseStatus'
import { useDemoPurchase, type DemoPurchaseReceipt } from '../useDemoPurchase'
import translations from '../../../i18n/en.json'

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
})
