import { randomUUID } from 'node:crypto'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenScope } from '@open-mercato/core/helpers/integration/generalFixtures'
import {
  createCustomerCompanyFixture, createCustomerUserFixture,
  deleteCustomerCompanyFixture, deleteCustomerUserFixture, portalLogin,
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'
import { assertNoMatchingPurchaseAnalysis, configurePurchaseJourney, failPurchaseJourneyPayment } from './support/purchaseJourney/setup'
import { deletePurchaseJourneyRecords, readPurchaseJourneyRecords, type PurchaseFixtureScope } from './support/purchaseJourney/records'
import { demoPurchaseReceiptSchema } from '../lib/orderBootstrap/contracts'
import { demoOffer } from '../lib/orderBootstrap/demoOffer'

export const integrationMeta = {
  dependsOnModules: ['agency', 'agency_operations', 'auth', 'customer_accounts', 'customers', 'catalog', 'sales', 'payment_gateways', 'example', 'attachments', 'workflows'],
}

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'
const PURCHASES = '/api/agency/portal/purchases'

async function checkpoint(page: Page, info: TestInfo, name: string): Promise<void> {
  console.log(`[TC-AGENCY-003] ${name}`)
  if (process.env.PW_CAPTURE_SCREENSHOTS !== '1') return
  const screenshotPath = info.outputPath('demo-screenshots', `${name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })
  await info.attach(name, { path: screenshotPath, contentType: 'image/png' })
}

test.use({ trace: 'retain-on-failure' })
test.describe('TC-AGENCY-003: purchase replay without execution authorization', () => {
  let cleanup: (() => Promise<void>) | undefined
  test.afterEach(async ({}, testInfo) => {
    testInfo.setTimeout(45_000)
    const current = cleanup
    cleanup = undefined
    await current?.()
  })

  test('rendered terms and repeated purchase delivery retain one paid case awaiting configuration', async ({ page, request }, testInfo) => {
    test.setTimeout(180_000)
    const adminToken = await getAuthToken(request, 'admin')
    const provisioningToken = await getAuthToken(request, 'superadmin')
    const { tenantId, organizationId } = getTokenScope(adminToken)
    const { userId } = getTokenScope(provisioningToken)
    const brand = `Purchase replay ${randomUUID().slice(0, 8)}`
    let customerEntityId: string | null = null
    let customerUserId: string | null = null
    let scope: PurchaseFixtureScope | undefined
    cleanup = async () => {
      console.log('[TC-AGENCY-003] Clean up owned customer and purchase fixtures')
      if (scope) await deletePurchaseJourneyRecords(request, adminToken, scope)
      await deleteCustomerUserFixture(request, provisioningToken, customerUserId)
      await deleteCustomerCompanyFixture(request, adminToken, customerEntityId)
    }

    await configurePurchaseJourney({ tenantId, organizationId, userId })
    await assertNoMatchingPurchaseAnalysis({ tenantId, organizationId })
    customerEntityId = await createCustomerCompanyFixture(request, adminToken, brand)
    const customer = await createCustomerUserFixture(request, provisioningToken, { customerEntityId, displayName: brand })
    customerUserId = customer.id
    scope = { tenantId, organizationId, customerEntityId, customerUserId }
    const organizationResponse = await apiRequest(request, 'GET',
      `/api/directory/organizations?view=manage&ids=${organizationId}&tenantId=${tenantId}`, { token: adminToken })
    expect(organizationResponse.ok()).toBeTruthy()
    const organization = await organizationResponse.json() as { items: Array<{ slug: string }> }
    const orgSlug = organization.items[0].slug
    const session = await portalLogin(request, { email: customer.email, password: customer.password, tenantId })
    await page.context().addCookies([
      { name: 'customer_auth_token', value: session.authToken, url: BASE_URL, sameSite: 'Lax' },
      { name: 'customer_session_token', value: session.sessionToken, url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_demo_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_cookie_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_feedback_suppress', value: '1', url: BASE_URL, sameSite: 'Lax' },
    ])

    await test.step('Read the actual versioned offer and rendered terms', async () => {
      const [response] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === PURCHASES && response.request().method() === 'GET'),
        page.goto(new URL(`/${orgSlug}/portal/agency/order`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' }),
      ])
      expect(response.ok(), 'Server demo offer must be available').toBeTruthy()
      const offer = await response.json() as { enabled: boolean; amount: number; currency: string; termsVersion: string; terms: { en: string; pl: string } }
      expect(offer.enabled, 'Start app and runner with OM_AGENCY_DEMO_PURCHASE_ENABLED=true').toBe(true)
      expect(offer.termsVersion).toBe(demoOffer.termsVersion)
      await expect(page.getByText(`${offer.amount} ${offer.currency}`, { exact: true })).toBeVisible()
      await expect(page.getByText(offer.terms.en, { exact: true }).or(page.getByText(offer.terms.pl, { exact: true }))).toBeVisible()
      await checkpoint(page, testInfo, '01-versioned-demo-offer')
    })

    const pending = await test.step('Replay one original purchase request', async () => {
      const original = {
        requestId: randomUUID(), offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion, acceptedTerms: true,
        buyer: { brandDisplayName: brand, brandWebsiteUrl: 'https://example.test', market: 'Polska', language: 'polski',
          contactName: 'Demo customer', contactEmail: customer.email, billingBuyerType: 'company',
          billingLegalName: brand, billingCountry: 'PL', billingAddress: 'Demo address, Warsaw',
          billingTaxId: 'DEMO-NOT-A-REAL-INVOICE', officialSocialUrl: '',
          purchaseGoal: 'Confirm replay safety without authorizing research execution.' },
      }
      for (const [id, value] of Object.entries(original.buyer)) {
        if (id === 'billingBuyerType') await page.locator(`#${id}`).selectOption(value)
        else await page.locator(`#${id}`).fill(value)
      }
      await page.getByRole('checkbox').check()
      const submitted = page.waitForResponse((response) => new URL(response.url()).pathname === PURCHASES && response.request().method() === 'POST')
      await page.getByRole('button', { name: /Create demo order|Utwórz zamówienie demonstracyjne/ }).click()
      const created = await submitted
      expect(created.status(), await created.text()).toBe(201)
      const receipt = demoPurchaseReceiptSchema.parse(await created.json())
      expect(receipt).toMatchObject({ status: 'pending_payment', caseId: null, workflowInstanceId: null })
      const replay = await page.request.post(new URL(PURCHASES, BASE_URL).toString(), { data: created.request().postDataJSON() })
      expect(replay.status(), await replay.text()).toBe(201)
      expect(demoPurchaseReceiptSchema.parse(await replay.json())).toEqual(receipt)
      return receipt
    })

    const replacement = await test.step('Recover a failed payment through the customer retry action', async () => {
      const failed = await failPurchaseJourneyPayment(request, { tenantId, organizationId, providerSessionId: pending.providerSessionId! })
      expect(failed.status(), await failed.text()).toBe(202)
      const endpoint = `${PURCHASES}/${pending.orderId}`
      const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === endpoint && response.request().method() === 'GET')
      await page.getByRole('button', { name: /Refresh payment status|Odśwież stan płatności/ }).click()
      const response = await refreshed
      expect(response.ok(), await response.text()).toBeTruthy()
      expect(await response.json()).toMatchObject({ orderId: pending.orderId, paymentId: pending.paymentId,
        status: 'blocked', canRetryPayment: true, caseId: null })
      const retried = page.waitForResponse((response) => new URL(response.url()).pathname === `${endpoint}/retry` && response.request().method() === 'POST')
      await page.getByRole('button', { name: /Retry failed test payment|Ponów nieudaną płatność testową/ }).click()
      const retryResponse = await retried
      expect(retryResponse.ok(), await retryResponse.text()).toBeTruthy()
      const receipt = demoPurchaseReceiptSchema.parse(await retryResponse.json())
      expect(receipt).toMatchObject({ orderId: pending.orderId, paymentId: pending.paymentId, status: 'pending_payment', caseId: null })
      expect(receipt.providerSessionId).not.toBe(pending.providerSessionId)
      await checkpoint(page, testInfo, '02-same-order-payment-retry')
      return receipt
    })

    const paid = await test.step('Replay zero-charge confirmation without starting execution', async () => {
      const endpoint = new URL(`${PURCHASES}/${pending.orderId}/confirm`, BASE_URL).toString()
      const response = await page.request.post(endpoint, { data: {} })
      expect(response.ok(), await response.text()).toBeTruthy()
      const receipt = demoPurchaseReceiptSchema.parse(await response.json())
      expect(receipt).toMatchObject({ status: 'paid', orderId: pending.orderId, paymentId: pending.paymentId,
        caseId: expect.any(String), workflowInstanceId: expect.any(String), processing: { state: 'waiting_configuration' } })
      const replay = await page.request.post(endpoint, { data: {} })
      expect(replay.ok(), await replay.text()).toBeTruthy()
      expect(demoPurchaseReceiptSchema.parse(await replay.json())).toEqual(receipt)
      const refreshed = await page.request.get(new URL(`${PURCHASES}/${pending.orderId}`, BASE_URL).toString())
      expect(refreshed.ok()).toBeTruthy()
      expect(demoPurchaseReceiptSchema.parse(await refreshed.json())).toEqual(receipt)
      return receipt
    })

    await test.step('Read the same case and its real native waiting state', async () => {
      const caseResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency/portal/cases/${paid.caseId}`)
      await page.goto(new URL(`/${orgSlug}/portal/agency/cases/${paid.caseId}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
      const response = await caseResponse
      expect(response.ok(), await response.text()).toBeTruthy()
      const visibleCase = await response.json() as { caseId: string; materialMimeType: string; workflow: { status: string } | null }
      expect(visibleCase).toMatchObject({ caseId: paid.caseId, materialMimeType: 'application/json' })
      await expect(page.getByText(`${demoOffer.name}: ${brand}`, { exact: true })).toBeVisible()
      const records = await readPurchaseJourneyRecords(scope!)
      expect(records.orders).toHaveLength(1)
      expect(records.payments).toHaveLength(1)
      expect(records.cases).toHaveLength(1)
      expect(records.attempts).toHaveLength(2)
      expect(records.attempts).toEqual(expect.arrayContaining([
        expect.objectContaining({ payment_id: paid.paymentId, provider_key: 'mock_processing',
          provider_session_id: pending.providerSessionId, unified_status: 'failed' }),
        expect.objectContaining({ payment_id: paid.paymentId, provider_key: 'mock_processing',
          provider_session_id: replacement.providerSessionId, unified_status: 'captured' }),
      ]))
      expect(records.cases[0]).toMatchObject({ id: paid.caseId, workflow_instance_id: paid.workflowInstanceId,
        workflow_id: 'agency_operations.demo-purchase.v1', current_step_id: 'awaiting_execution' })
      expect(['RUNNING', 'PAUSED']).toContain(records.cases[0].workflow_status)
      expect(visibleCase.workflow?.status).toBe(records.cases[0].workflow_status)
      await checkpoint(page, testInfo, '03-replayed-case-awaiting-execution')
    })
  })
})
