'use client'

import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { customerOnboardingResultSchema, type CustomerOnboardingRequest } from '@/modules/agency_operations/lib/customerOnboarding/contracts'

export class CustomerOnboardingError extends Error {
  constructor(readonly messageKey: 'agency.onboarding.unavailable' | 'agency.onboarding.failed' | 'agency.onboarding.sessionRefreshFailed') {
    super(messageKey)
  }
}

export async function ensureCustomerOnboarding(buyer: CustomerOnboardingRequest): Promise<void> {
  const response = await apiCall<unknown>('/api/agency/portal/onboarding', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brandDisplayName: buyer.brandDisplayName, brandWebsiteUrl: buyer.brandWebsiteUrl, billingLegalName: buyer.billingLegalName }),
  })
  if (!response.ok || !customerOnboardingResultSchema.safeParse(response.result).success) {
    throw new CustomerOnboardingError(response.status === 409 ? 'agency.onboarding.unavailable' : 'agency.onboarding.failed')
  }
  const refreshed = await apiCall<{ ok?: boolean }>('/api/customer_accounts/portal/sessions-refresh', { method: 'POST' })
  if (!refreshed.ok || !refreshed.result?.ok) throw new CustomerOnboardingError('agency.onboarding.sessionRefreshFailed')
}
