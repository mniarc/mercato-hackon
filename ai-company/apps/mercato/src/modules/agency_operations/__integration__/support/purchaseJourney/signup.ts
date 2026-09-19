import { readFile } from 'node:fs/promises'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { apiRequest } from '@open-mercato/core/helpers/integration/api'

type SignedUpCustomer = { id: string; email: string; customerEntityId: string | null; emailVerified: boolean }
type CapturedEmail = { to?: string; links?: string[] }

export async function readSignedUpPurchaseCustomer(request: APIRequestContext, adminToken: string, email: string): Promise<SignedUpCustomer | null> {
  const response = await apiRequest(request, 'GET', `/api/customer_accounts/admin/users?search=${encodeURIComponent(email)}&pageSize=100`, { token: adminToken })
  expect(response.ok(), 'Read the exact newly signed-up customer for owned cleanup').toBeTruthy()
  const body = await response.json() as { items: SignedUpCustomer[] }
  return body.items.find((item) => item.email === email) ?? null
}

export async function signUpPurchaseCustomer(page: Page, input: { baseUrl: string; orgSlug: string; email: string; password: string; displayName: string }): Promise<void> {
  if (!process.env.OM_TEST_EMAIL_CAPTURE_PATH?.trim()) {
    throw new Error('[internal] Signup proof requires the app and runner OM_TEST_EMAIL_CAPTURE_PATH from the persistent agency launcher; no verification bypass is permitted.')
  }
  await page.goto(new URL(`/${input.orgSlug}/portal/signup`, input.baseUrl).toString(), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible({ timeout: 30_000 })
  await page.locator('#signup-name').fill(input.displayName)
  await page.locator('#signup-email').fill(input.email)
  await page.locator('#signup-password').fill(input.password)
  const accepted = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/customer_accounts/signup' && response.request().method() === 'POST')
  await page.locator('form button[type="submit"]').click()
  expect((await accepted).status(), 'Real anonymous signup must be accepted').toBe(202)
}

export async function verifyCapturedPurchaseEmail(request: APIRequestContext, email: string, baseUrl: string): Promise<void> {
  const capturePath = process.env.OM_TEST_EMAIL_CAPTURE_PATH?.trim()
  if (!capturePath) throw new Error('[internal] Native local email capture is not configured for signup proof.')
  let verificationLink: string | undefined
  await expect.poll(async () => {
    let raw: string
    try { raw = await readFile(capturePath, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
    const records = raw.split('\n').filter(Boolean).flatMap((line): CapturedEmail[] => {
      try { return [JSON.parse(line) as CapturedEmail] } catch { return [] }
    })
    verificationLink = records.filter((record) => record.to === email).flatMap((record) => record.links ?? [])
      .find((link) => {
        const url = new URL(link)
        return url.pathname.endsWith('/portal/verify') && !!url.searchParams.get('token')
      })
    return !!verificationLink
  }, { timeout: 20_000, intervals: [250, 500, 1000], message: 'Native signup email must contain a verification link; check OM_TEST_MODE and the shared capture path if absent.' }).toBe(true)
  const verificationUrl = new URL(verificationLink!)
  expect(verificationUrl.origin, 'Captured signup email must point to the configured local app').toBe(new URL(baseUrl).origin)
  const response = await request.post(new URL('/api/customer_accounts/email/verify', baseUrl).toString(), {
    data: { token: verificationUrl.searchParams.get('token') },
  })
  expect(response.ok(), 'Native verification must consume the captured token').toBeTruthy()
}
