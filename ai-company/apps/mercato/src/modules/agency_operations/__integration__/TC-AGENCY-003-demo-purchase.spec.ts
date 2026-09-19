import { randomUUID } from 'node:crypto'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenScope } from '@open-mercato/core/helpers/integration/generalFixtures'
import {
  customerTestPassword, deleteCustomerCompanyFixture, deleteCustomerUserFixture, portalLogin,
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'
import { configurePurchaseJourney, failPurchaseJourneyPayment } from './support/purchaseJourney/setup'
import { deletePurchaseJourneyRecords, readOnboardedPurchaseCompanies, readPurchaseJourneyRecords, type PurchaseFixtureScope } from './support/purchaseJourney/records'
import { readSignedUpPurchaseCustomer, signUpPurchaseCustomer, verifyCapturedPurchaseEmail } from './support/purchaseJourney/signup'

export const integrationMeta = {
  dependsOnModules: ['agency', 'agency_operations', 'auth', 'customer_accounts', 'customers', 'catalog', 'sales', 'payment_gateways', 'example', 'attachments', 'workflows'],
}

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'
const PURCHASES = '/api/agency/portal/purchases'
type Receipt = { orderId: string; paymentId: string; providerSessionId: string | null;
  status: string; caseId: string | null; workflowInstanceId: string | null }

async function checkpoint(page: Page, info: TestInfo, name: string): Promise<void> {
  console.log(`[TC-AGENCY-003] ${name}`)
  if (process.env.PW_CAPTURE_SCREENSHOTS !== '1') return
  const screenshotPath = info.outputPath('demo-screenshots', `${name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })
  await info.attach(name, { path: screenshotPath, contentType: 'image/png' })
}

test.use({ trace: 'retain-on-failure' })
test.describe('TC-AGENCY-003: zero-charge purchase to a real waiting case', () => {
  let cleanup: (() => Promise<void>) | undefined
  test.afterEach(async ({}, testInfo) => {
    testInfo.setTimeout(45_000)
    const current = cleanup
    cleanup = undefined
    await current?.()
  })

  test('fresh customer signs up, onboards and retries a failed demo payment into one agency case', async ({ page, request }, testInfo) => {
    test.setTimeout(180_000)
    const adminToken = await getAuthToken(request, 'admin')
    const provisioningToken = await getAuthToken(request, 'superadmin')
    const { tenantId, organizationId } = getTokenScope(adminToken)
    const { userId } = getTokenScope(provisioningToken)
    const suffix = randomUUID().slice(0, 8)
    const brand = `Purchase demo ${suffix}`
    const customer = { email: `agency-purchase-${randomUUID()}@example.test`, password: customerTestPassword(), displayName: brand }
    let customerEntityId: string | null = null
    let customerUserId: string | null = null
    let scope: PurchaseFixtureScope | undefined
    cleanup = async () => {
      console.log('[TC-AGENCY-003] Clean up owned customer and purchase fixtures')
      customerUserId ??= (await readSignedUpPurchaseCustomer(request, provisioningToken, customer.email))?.id ?? null
      const createdCompanies = customerUserId ? await readOnboardedPurchaseCompanies({ tenantId, organizationId, customerUserId }) : []
      for (const companyId of createdCompanies) {
        await deletePurchaseJourneyRecords(request, adminToken, { tenantId, organizationId, customerUserId: customerUserId!, customerEntityId: companyId })
      }
      await deleteCustomerUserFixture(request, provisioningToken, customerUserId)
      for (const companyId of createdCompanies) await deleteCustomerCompanyFixture(request, adminToken, companyId)
    }

    await configurePurchaseJourney({ tenantId, organizationId, userId })
    const organizationResponse = await apiRequest(request, 'GET',
      `/api/directory/organizations?view=manage&ids=${organizationId}&tenantId=${tenantId}`, { token: adminToken })
    expect(organizationResponse.ok()).toBeTruthy()
    const organization = await organizationResponse.json() as { items: Array<{ slug: string }> }
    const orgSlug = organization.items[0].slug
    await test.step('Register a fresh account through native signup and verify its captured email', async () => {
      console.log('[TC-AGENCY-003] Anonymous signup, native captured-email verification; no prelinked customer')
      await signUpPurchaseCustomer(page, { ...customer, orgSlug, baseUrl: BASE_URL })
      const created = await readSignedUpPurchaseCustomer(request, provisioningToken, customer.email)
      expect(created, 'Signup must create the exact new account').toBeTruthy()
      customerUserId = created!.id
      expect(created!.customerEntityId).toBeNull()
      expect(created!.emailVerified).toBe(false)
      await verifyCapturedPurchaseEmail(request, customer.email, BASE_URL)
      await checkpoint(page, testInfo, '00-native-signup-email-verified')
    })
    const session = await portalLogin(request, { email: customer.email, password: customer.password, tenantId })
    await page.context().addCookies([
      { name: 'customer_auth_token', value: session.authToken, url: BASE_URL, sameSite: 'Lax' },
      { name: 'customer_session_token', value: session.sessionToken, url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_demo_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_cookie_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_feedback_suppress', value: '1', url: BASE_URL, sameSite: 'Lax' },
    ])

    const pending = await test.step('Read the real offer and submit the existing purchase form', async () => {
      const [response] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === PURCHASES && response.request().method() === 'GET'),
        page.goto(new URL(`/${orgSlug}/portal/agency/order`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' }),
      ])
      expect(response.ok(), 'Server demo offer must be available').toBeTruthy()
      const offer = await response.json() as { enabled: boolean; amount: number; currency: string; termsVersion: string; terms: { en: string; pl: string } }
      expect(offer.enabled, 'Start app and runner with OM_AGENCY_DEMO_PURCHASE_ENABLED=true').toBe(true)
      expect([offer.amount, offer.currency]).toEqual([2500, 'PLN'])
      await expect(page.getByText('2500 PLN', { exact: true })).toBeVisible()
      await expect(page.getByText(offer.terms.en, { exact: true }).or(page.getByText(offer.terms.pl, { exact: true }))).toBeVisible()
      await checkpoint(page, testInfo, '01-versioned-demo-offer')
      const fields = { brandDisplayName: brand, brandWebsiteUrl: 'https://example.test', market: 'Polska', language: 'polski',
        contactName: 'Demo customer', contactEmail: customer.email, billingLegalName: brand, billingCountry: 'PL',
        billingAddress: 'Demo address, Warsaw', billingTaxId: 'DEMO-NOT-A-REAL-INVOICE',
        purchaseGoal: 'Understand a zero-charge purchase before authorizing any execution.' }
      for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value)
      await page.locator('#billingBuyerType').selectOption('company')
      await page.getByRole('checkbox').check()
      const createdResponse = page.waitForResponse((item) => new URL(item.url()).pathname === PURCHASES && item.request().method() === 'POST')
      const onboardingResponse = page.waitForResponse((item) => new URL(item.url()).pathname === '/api/agency/portal/onboarding' && item.request().method() === 'POST')
      await page.getByRole('button', { name: /Create demo order|Utwórz zamówienie demonstracyjne/ }).click()
      const onboarded = await onboardingResponse
      expect(onboarded.ok(), await onboarded.text()).toBeTruthy()
      const linked = await onboarded.json() as { customerEntityId: string; replayed: boolean }
      expect(linked.replayed).toBe(false)
      customerEntityId = linked.customerEntityId
      scope = { tenantId, organizationId, customerEntityId, customerUserId: customerUserId! }
      expect(await readOnboardedPurchaseCompanies(scope)).toEqual([customerEntityId])
      const created = await createdResponse
      expect(created.status(), await created.text()).toBe(201)
      const receipt = await created.json() as Receipt
      expect(receipt).toMatchObject({ status: 'pending_payment', caseId: null, workflowInstanceId: null })
      expect(receipt.providerSessionId).toBeTruthy()
      // Retry the same request against actual encrypted sales metadata.
      const retried = await page.request.post(new URL(PURCHASES, BASE_URL).toString(), {
        data: created.request().postDataJSON(),
      })
      expect(retried.status(), await retried.text()).toBe(201)
      expect(await retried.json()).toEqual(receipt)
      await checkpoint(page, testInfo, '02-native-order-awaits-test-payment')
      return receipt
    })

    const replacement = await test.step('Fail the native test attempt and retry through the customer portal', async () => {
      const failed = await failPurchaseJourneyPayment(request, { tenantId, organizationId, providerSessionId: pending.providerSessionId! })
      expect(failed.status(), await failed.text()).toBe(202)
      const purchasePath = `${PURCHASES}/${pending.orderId}`
      const refreshedResponse = page.waitForResponse((item) => new URL(item.url()).pathname === purchasePath && item.request().method() === 'GET')
      await page.getByRole('button', { name: /Refresh payment status|Odśwież stan płatności/ }).click()
      const refreshed = await refreshedResponse
      expect(refreshed.ok(), await refreshed.text()).toBeTruthy()
      expect(await refreshed.json()).toMatchObject({ orderId: pending.orderId, paymentId: pending.paymentId,
        providerSessionId: pending.providerSessionId, status: 'blocked', canRetryPayment: true, caseId: null, workflowInstanceId: null })
      await checkpoint(page, testInfo, '03-failed-test-payment-retry-available')

      const retryResponse = page.waitForResponse((item) => new URL(item.url()).pathname === `${purchasePath}/retry` && item.request().method() === 'POST')
      await page.getByRole('button', { name: /Retry failed test payment|Ponów nieudaną płatność testową/ }).click()
      const retried = await retryResponse
      expect(retried.ok(), await retried.text()).toBeTruthy()
      const receipt = await retried.json() as Receipt
      expect(receipt).toMatchObject({ orderId: pending.orderId, paymentId: pending.paymentId,
        status: 'pending_payment', caseId: null, workflowInstanceId: null })
      expect(receipt.providerSessionId).toBeTruthy()
      expect(receipt.providerSessionId).not.toBe(pending.providerSessionId)
      await checkpoint(page, testInfo, '04-same-order-replacement-payment-pending')
      return receipt
    })

    const paid = await test.step('Confirm zero-charge payment through the native gateway', async () => {
      const confirmationPath = `${PURCHASES}/${pending.orderId}/confirm`
      const confirmationResponse = page.waitForResponse((item) => new URL(item.url()).pathname === confirmationPath && item.request().method() === 'POST')
      await page.getByRole('button', { name: /Confirm test payment|Potwierdź płatność testową/ }).click()
      const response = await confirmationResponse
      expect(response.ok(), await response.text()).toBeTruthy()
      const receipt = await response.json() as Receipt
      expect(receipt).toMatchObject({ status: 'paid', orderId: pending.orderId, paymentId: pending.paymentId,
        providerSessionId: replacement.providerSessionId })
      expect(receipt.caseId).toBeTruthy()
      expect(receipt.workflowInstanceId).toBeTruthy()
      // One API retry proves delivery idempotence without replaying the browser journey.
      const replay = await page.request.post(new URL(confirmationPath, BASE_URL).toString(), {
        data: {},
      })
      expect(replay.ok(), await replay.text()).toBeTruthy()
      expect(await replay.json()).toEqual(receipt)
      await expect(page.getByRole('link', { name: /Open your agency case|Otwórz sprawę agencji/ })).toBeVisible()
      await checkpoint(page, testInfo, '05-test-payment-confirmed')
      return receipt
    })

    await test.step('Open the linked case and prove its native waiting state', async () => {
      const caseResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency/portal/cases/${paid.caseId}`)
      await page.getByRole('link', { name: /Open your agency case|Otwórz sprawę agencji/ }).click()
      const response = await caseResponse
      expect(response.ok(), await response.text()).toBeTruthy()
      const visibleCase = await response.json() as { caseId: string; materialMimeType: string; workflow: { status: string } | null }
      expect(visibleCase).toMatchObject({ caseId: paid.caseId, materialMimeType: 'application/json' })
      expect(['RUNNING', 'PAUSED']).toContain(visibleCase.workflow?.status)
      await expect(page.getByText(`START KOMUNIKACJI — DEMO: ${brand}`, { exact: true })).toBeVisible()
      const records = await readPurchaseJourneyRecords(scope!)
      expect(records.orders).toHaveLength(1)
      expect(records.payments).toHaveLength(1)
      expect(records.cases).toHaveLength(1)
      expect(records.orders[0]).toMatchObject({ id: pending.orderId, currency_code: 'PLN' })
      expect(Number(records.orders[0].grand_total_gross_amount)).toBe(2500)
      expect(records.payments[0]).toMatchObject({ id: paid.paymentId, order_id: paid.orderId, currency_code: 'PLN' })
      expect(Number(records.payments[0].captured_amount)).toBe(2500)
      expect(records.attempts).toHaveLength(2)
      expect(records.attempts).toEqual(expect.arrayContaining([
        expect.objectContaining({ payment_id: paid.paymentId, provider_key: 'mock_processing',
          provider_session_id: pending.providerSessionId, unified_status: 'failed' }),
        expect.objectContaining({ payment_id: paid.paymentId, provider_key: 'mock_processing',
          provider_session_id: replacement.providerSessionId, unified_status: 'captured' }),
      ]))
      expect(records.cases[0]).toMatchObject({ id: paid.caseId, workflow_instance_id: paid.workflowInstanceId,
        workflow_id: 'agency_operations.demo-purchase.v1', current_step_id: 'awaiting_execution' })
      // Native WAIT_FOR_SIGNAL can remain RUNNING. The exact waiting step, not
      // a generic workflow status, proves this purchase has not been fulfilled.
      expect(['RUNNING', 'PAUSED']).toContain(records.cases[0].workflow_status)
      expect(visibleCase.workflow?.status).toBe(records.cases[0].workflow_status)
      await checkpoint(page, testInfo, '06-real-case-awaiting-execution')
    })
  })
})
