/** @jest-environment node */
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ensureCustomerOnboarding } from '../ensureCustomerOnboarding'

jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
const buyer = { brandDisplayName: 'Brand', billingLegalName: 'Company', brandWebsiteUrl: 'https://example.test' }
const companyId = '00000000-0000-4000-8000-000000000001'

beforeEach(() => jest.resetAllMocks())

test('refreshes native session only after a persisted company link, before purchase can proceed', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce({ ok: true, status: 200, result: { customerEntityId: companyId, replayed: false } } as never)
  jest.mocked(apiCall).mockResolvedValueOnce({ ok: true, status: 200, result: { ok: true } } as never)
  await expect(ensureCustomerOnboarding(buyer)).resolves.toBeUndefined()
  expect(jest.mocked(apiCall).mock.calls.map(([url]) => url)).toEqual(['/api/agency/portal/onboarding', '/api/customer_accounts/portal/sessions-refresh'])
  expect(JSON.parse(String(jest.mocked(apiCall).mock.calls[0][1]?.body))).toEqual(buyer)
})

test('configuration refusal stops before refresh or payment and retains a specific error key', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce({ ok: false, status: 409, result: { error: 'unavailable' } } as never)
  await expect(ensureCustomerOnboarding(buyer)).rejects.toMatchObject({ messageKey: 'agency.onboarding.unavailable' })
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test('a saved link with failed session refresh does not report readiness for purchase', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce({ ok: true, status: 200, result: { customerEntityId: companyId, replayed: true } } as never)
  jest.mocked(apiCall).mockResolvedValueOnce({ ok: false, status: 401, result: { ok: false } } as never)
  await expect(ensureCustomerOnboarding(buyer)).rejects.toMatchObject({ messageKey: 'agency.onboarding.sessionRefreshFailed' })
})
