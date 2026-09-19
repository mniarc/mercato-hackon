'use client'

import * as React from 'react'
import { z } from 'zod'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { CustomerOnboardingError, ensureCustomerOnboarding } from '../customer-onboarding/ensureCustomerOnboarding'
import { demoPurchaseReceiptSchema as receiptSchema } from '@/modules/agency_operations/lib/orderBootstrap/contracts'

const offerSchema = z.object({ enabled: z.boolean(), demoOnly: z.literal(true), sku: z.string(), name: z.string(), amount: z.number(), currency: z.string(), offerVersion: z.string(), termsVersion: z.string(), terms: z.object({ en: z.string(), pl: z.string() }), provider: z.string() })
export type DemoOffer = z.infer<typeof offerSchema>
export type DemoPurchaseReceipt = z.infer<typeof receiptSchema>
export type PurchaseBuyer = {
  brandDisplayName: string; brandWebsiteUrl: string; market: string; language: string; contactName: string; contactEmail: string;
  billingBuyerType: 'company' | 'individual'; billingLegalName: string; billingCountry: string; billingAddress: string; billingTaxId: string;
  officialSocialUrl: string; purchaseGoal: string;
}
const endpoint = '/api/agency/portal/purchases'

export function useDemoPurchase(orgSlug: string) {
  const t = useT()
  const [offer, setOffer] = React.useState<DemoOffer | null>(null)
  const [receipt, setReceipt] = React.useState<DemoPurchaseReceipt | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inFlight = React.useRef(false)
  const attempts = React.useRef(new Map<string, string>())
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: `agency.purchase.${orgSlug}`, blockedMessage: t('agency.purchase.failed', 'The demo purchase could not be updated. Retry the same action.') })

  React.useEffect(() => {
    let cancelled = false
    const orderId = new URL(window.location.href).searchParams.get('orderId')
    setReceipt(null)
    setOffer(null)
    setLoading(true)
    setError(null)
    void (async () => {
      if (orderId !== null && !z.uuid().safeParse(orderId).success) throw new Error('[internal] Invalid purchase link')
      const response = await apiCall<unknown>(endpoint)
      const parsed = offerSchema.safeParse(response.result)
      if (!response.ok || !parsed.success) throw new Error('[internal] Demo offer unavailable')
      let savedReceipt: DemoPurchaseReceipt | null = null
      if (orderId) {
        const saved = await apiCall<unknown>(`${endpoint}/${encodeURIComponent(orderId)}`)
        const history = receiptSchema.safeParse(saved.result)
        if (!saved.ok || !history.success || history.data.orderId !== orderId) throw new Error('[internal] Saved purchase unavailable')
        savedReceipt = history.data
      }
      if (cancelled) return
      setOffer(parsed.data)
      setReceipt(savedReceipt)
    })().catch(() => {
      if (!cancelled) setError(orderId !== null ? t('agency.purchase.history.loadError') : t('agency.purchase.loadError', 'The demo offer is unavailable. Reload this page to try again.'))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orgSlug, t])

  async function requestReceipt(url: string, body?: Record<string, unknown>) {
    const response = await apiCall<unknown>(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    const parsed = receiptSchema.safeParse(response.result)
    if (!response.ok || !parsed.success) throw new Error('[internal] Demo purchase was not acknowledged')
    setReceipt(parsed.data)
    const purchaseUrl = new URL(window.location.href)
    purchaseUrl.searchParams.set('orderId', parsed.data.orderId)
    window.history.replaceState(window.history.state, '', purchaseUrl)
    return parsed.data
  }

  async function mutate(url: string, payload: Record<string, unknown>, prepare?: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await runMutation({ context: { orderId: receipt?.orderId, retryLastMutation }, mutationPayload: payload, operation: async () => {
        await prepare?.()
        return requestReceipt(url, payload)
      } })
    } catch (error) {
      setError(error instanceof CustomerOnboardingError ? t(error.messageKey) : t('agency.purchase.failed', 'The demo purchase could not be updated. Retry the same action.'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function start(buyer: PurchaseBuyer) {
    if (!offer?.enabled || !offer.demoOnly || receipt) return
    const original = { offerVersion: offer.offerVersion, termsVersion: offer.termsVersion, acceptedTerms: true, buyer }
    const attemptKey = JSON.stringify(original)
    const requestId = attempts.current.get(attemptKey) ?? crypto.randomUUID()
    attempts.current.set(attemptKey, requestId)
    await mutate(endpoint, { requestId, ...original }, () => ensureCustomerOnboarding(buyer))
  }

  async function confirm() {
    if (!offer?.enabled || !receipt || !['pending_payment', 'blocked'].includes(receipt.status)) return
    await mutate(`${endpoint}/${encodeURIComponent(receipt.orderId)}/confirm`, {})
  }

  async function refresh() {
    if (!receipt || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try { await requestReceipt(`${endpoint}/${encodeURIComponent(receipt.orderId)}`) }
    catch { setError(t('agency.purchase.failed', 'The demo purchase could not be updated. Retry the same action.')) }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function retryPayment() {
    if (!offer?.enabled || !receipt?.canRetryPayment || !receipt.providerSessionId) return
    await mutate(`${endpoint}/${encodeURIComponent(receipt.orderId)}/retry`, { providerSessionId: receipt.providerSessionId })
  }

  return { offer, receipt, loading, busy, error, start, confirm, refresh, retryPayment }
}
