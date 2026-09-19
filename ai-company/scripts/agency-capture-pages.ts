import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, request, type Page } from '@playwright/test'
import { apiRequest, getAuthToken } from '../packages/core/src/helpers/integration/api'
import { getTokenScope } from '../packages/core/src/helpers/integration/generalFixtures'
import {
  createCustomerCompanyFixture, createCustomerRoleFixture, createCustomerUserFixture,
  deleteCustomerCompanyFixture, deleteCustomerRoleFixture, deleteCustomerUserFixture,
} from '../packages/core/src/helpers/integration/customerAccountsFixtures'

// Capture only: no test runner, model calls, content fixtures, or UI changes.
async function main() {
const baseURL = process.env.BASE_URL ?? 'http://localhost:5002'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Capture is restricted to the local demo app.')
const scriptFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url)
const visualsRoot = path.resolve(path.dirname(scriptFile), '..', '..', '.visuals')
const output = path.join(visualsRoot, `capture-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const orgSlug = process.env.AGENCY_CAPTURE_ORG_SLUG ?? 'acme-corp'
const captures: { file: string; url: string; httpStatus: number | null }[] = []
const gaps: { page: string; reason: string }[] = []
async function retainLatestFive() {
  // Never prune previous evidence after a failed run, or touch unrelated directories/symlinks.
  if (!captures.length || !(await fs.stat(captures[0].file)).size) return []
  const actualRoot = await fs.realpath(visualsRoot)
  const runs = (await fs.readdir(actualRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && /^capture-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(entry.name))
    .map((entry) => entry.name).sort().reverse()
  const keep = new Set([path.basename(output), ...runs.filter((name) => name !== path.basename(output)).slice(0, 4)])
  const removed: string[] = []
  for (const name of runs.filter((name) => !keep.has(name))) {
    const target = path.resolve(actualRoot, name)
    if (path.dirname(target) !== actualRoot || target === path.resolve(output)) throw new Error('Unsafe capture retention target')
    const actualTarget = await fs.realpath(target)
    if (actualTarget !== target || path.dirname(actualTarget) !== actualRoot) throw new Error('Capture retention target escaped its directory')
    await fs.rm(actualTarget, { recursive: true })
    removed.push(name)
  }
  return removed
}
await fs.mkdir(output, { recursive: true })
const api = await request.newContext({ baseURL })
const browser = await chromium.launch({ headless: false })
const staff = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, locale: 'pl-PL' })
const customer = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, locale: 'pl-PL' })
let companyId: string | null = null
let userId: string | null = null
let roleId: string | null = null
let adminToken: string | null = null
let setupToken: string | null = null

async function capture(page: Page, name: string, route: string) {
  try {
    console.log(`[capture] ${name} ${route}`)
    const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
    await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]) })
    if (new URL(page.url()).pathname !== new URL(route, baseURL).pathname) throw new Error(`Redirected to ${new URL(page.url()).pathname}`)
    const file = path.join(output, `${name}.png`)
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 60_000 })
    captures.push({ file, url: page.url(), httpStatus: response?.status() ?? null })
    console.log(`[saved] ${file}`)
  } catch (error) {
    gaps.push({ page: route, reason: error instanceof Error ? error.message : String(error) })
    console.log(`[gap] ${name}: ${gaps[gaps.length - 1].reason}`)
  }
}

try {
  const staffPage = await staff.newPage()
  staffPage.setDefaultTimeout(60_000)
  const staffLogin = await staff.request.post('/api/auth/login', { form: { email: 'admin@acme.com', password: 'secret' } })
  if (!staffLogin.ok()) throw new Error(`Staff login returned ${staffLogin.status()}`)
  await capture(staffPage, 'employee-01-agency-cases', '/backend/agency-operations/cases')
  const caseLink = staffPage.locator('a[href^="/backend/agency-operations/cases/"]').first()
  const caseHref = await caseLink.getAttribute('href', { timeout: 3000 }).catch(() => null)
  if (caseHref && !caseHref.endsWith('/create')) await capture(staffPage, 'employee-02-agency-case', caseHref)
  else gaps.push({ page: '/backend/agency-operations/cases/:id', reason: 'No existing case detail link was available; no case was fabricated.' })
  await capture(staffPage, 'employee-03-work-inbox', '/backend/work-inbox')
  if (process.env.AGENCY_CAPTURE_CREATE_CUSTOMER !== '1') throw new Error('Customer fixture needs explicit AGENCY_CAPTURE_CREATE_CUSTOMER=1 authorization.')
  adminToken = await getAuthToken(api, 'admin')
  setupToken = await getAuthToken(api, 'superadmin')
  const authorizedScope = getTokenScope(adminToken)
  const setupScope = getTokenScope(setupToken)
  const tenantId = process.env.AGENCY_CAPTURE_TENANT_ID?.trim() || authorizedScope.tenantId
  if (!tenantId || tenantId !== authorizedScope.tenantId || tenantId !== setupScope.tenantId
    || !authorizedScope.organizationId || authorizedScope.organizationId !== setupScope.organizationId) {
    throw new Error('Capture tenant override and fixture credentials must match the authenticated tenant and organization scope.')
  }
  companyId = await createCustomerCompanyFixture(api, adminToken, 'Screenshot capture only')
  roleId = (await createCustomerRoleFixture(api, setupToken, { name: 'Screenshot capture only', features: ['portal.tasks.view', 'portal.tasks.complete'], isPortalAdmin: false })).id
  const account = await createCustomerUserFixture(api, setupToken, { displayName: 'Screenshot customer', customerEntityId: companyId, roleIds: [roleId] })
  userId = account.id
  // The browser context owns its login response cookies; never print or inspect them.
  const signedIn = await customer.request.post('/api/customer_accounts/login', { data: { email: account.email, password: account.password, tenantId } })
  if (!signedIn.ok()) throw new Error(`Customer login returned ${signedIn.status()}`)
  const customerPage = await customer.newPage()
  for (const [name, route] of [
    ['customer-01-offer', `/${orgSlug}/portal/agency`],
    ['customer-02-order', `/${orgSlug}/portal/agency/order`],
    ['customer-03-materials', `/${orgSlug}/portal/agency/materials`],
    ['customer-04-cases', `/${orgSlug}/portal/agency/cases`],
    ['customer-05-tasks', `/${orgSlug}/portal/tasks`],
  ]) await capture(customerPage, name, route)
  gaps.push({ page: `/${orgSlug}/portal/tasks/:id`, reason: 'Capture-only account has no genuine review task or produced document. No review state was fabricated.' })
} catch (error) {
  gaps.push({ page: 'capture setup', reason: error instanceof Error ? error.message : String(error) })
  console.error(`[capture gap] ${gaps[gaps.length - 1].reason}`)
} finally {
  if (setupToken && userId && roleId) {
    const detached = await apiRequest(api, 'PUT', `/api/customer_accounts/admin/users/${userId}`, { token: setupToken, data: { roleIds: [] } })
    if (!detached.ok()) gaps.push({ page: 'fixture cleanup', reason: `Role detach returned ${detached.status()}` })
  }
  await deleteCustomerUserFixture(api, setupToken, userId)
  await deleteCustomerRoleFixture(api, setupToken, roleId)
  await deleteCustomerCompanyFixture(api, adminToken, companyId)
  await fs.writeFile(path.join(output, 'capture.json'), JSON.stringify({ viewport: { width: 1440, height: 1000 }, captures, gaps, fixtureIds: { companyId, userId, roleId } }, null, 2))
  const removedCaptureRuns = await retainLatestFive()
  await browser.close()
  await api.dispose()
  console.log(JSON.stringify({ output, captures: captures.length, gaps, removedCaptureRuns }, null, 2))
}
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
