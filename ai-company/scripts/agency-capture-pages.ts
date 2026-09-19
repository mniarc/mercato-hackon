import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, request, type Page } from '@playwright/test'
import { createCaptureDirectory, retainLatestFiveCaptures } from './support/visualCaptures.mjs'
import { apiRequest, getAuthToken } from '../packages/core/src/helpers/integration/api'
import { getTokenScope } from '../packages/core/src/helpers/integration/generalFixtures'
import {
  createCustomerCompanyFixture, createCustomerRoleFixture, createCustomerUserFixture,
  deleteCustomerCompanyFixture, deleteCustomerRoleFixture, deleteCustomerUserFixture,
} from '../packages/core/src/helpers/integration/customerAccountsFixtures'

// Capture only: no test runner, model calls, content fixtures, or UI changes.
async function main() {
const baseURL = process.env.BASE_URL ?? 'http://localhost:5002'
if (new URL(baseURL).hostname !== 'localhost') throw new Error('Capture requires localhost so the demo app can hydrate correctly.')
const scriptFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url)
const visualsRoot = path.resolve(path.dirname(scriptFile), '..', '..', '.visuals')
const output = await createCaptureDirectory(visualsRoot)
const orgSlug = process.env.AGENCY_CAPTURE_ORG_SLUG ?? 'acme-corp'
type Viewpoint = 'customer' | 'employee'
const actors = { employee: 'admin@acme.com (demo staff)', customer: 'temporary native customer account' }
const captures: { viewpoint: Viewpoint; actor: string; file: string; requestedUrl: string; url: string; httpStatus: number | null }[] = []
const gaps: { viewpoint: Viewpoint; actor: string; page: string; reason: string }[] = []
function recordGap(viewpoint: Viewpoint, page: string, reason: string) {
  gaps.push({ viewpoint, actor: actors[viewpoint], page, reason })
  console.log(`[gap] ${viewpoint} ${page}: ${reason}`)
}
const api = await request.newContext({ baseURL })
const browser = await chromium.launch({ headless: false })
const staff = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, locale: 'pl-PL' })
const customer = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, locale: 'pl-PL' })
let companyId: string | null = null
let userId: string | null = null
let roleId: string | null = null
let adminToken: string | null = null
let setupToken: string | null = null

type AgencyCaseList = { items?: { id?: string }[] }
type ClientCaseList = { items?: { caseId?: string }[] }
type PortalTaskList = { ok?: boolean; tasks?: { id?: string }[] }
type ResearchOrderList = { items?: { orderRef?: string }[] }

async function capture(page: Page, viewpoint: Viewpoint, name: string, route: string, actor = actors[viewpoint]) {
  try {
    console.log(`[capture] ${name} ${route}`)
    const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
    await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]) })
    if (new URL(page.url()).pathname !== new URL(route, baseURL).pathname) recordGap(viewpoint, route, `Requested screen redirected to ${new URL(page.url()).pathname}; captured the actual permission/navigation surface.`)
    if (response && response.status() >= 400) recordGap(viewpoint, route, `HTTP ${response.status()}; captured the actual unavailable screen.`)
    const file = path.join(output, viewpoint, `${name}.png`)
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 60_000 })
    captures.push({ viewpoint, actor, file, requestedUrl: new URL(route, baseURL).href, url: page.url(), httpStatus: response?.status() ?? null })
    console.log(`[saved] ${file}`)
  } catch (error) {
    recordGap(viewpoint, route, error instanceof Error ? error.message : String(error))
  }
}

try {
  const customerPage = await customer.newPage()
  customerPage.setDefaultTimeout(60_000)
  await capture(customerPage, 'customer', '01-signup', `/${orgSlug}/portal/signup`, 'anonymous prospective customer')
  try {
  const staffPage = await staff.newPage()
  staffPage.setDefaultTimeout(60_000)
  const staffLogin = await staff.request.post('/api/auth/login', { form: { email: 'admin@acme.com', password: 'secret' } })
  if (!staffLogin.ok()) throw new Error(`Staff login returned ${staffLogin.status()}`)
  await capture(staffPage, 'employee', '01-work-inbox', '/backend/work-inbox')
  await capture(staffPage, 'employee', '02-agency-cases', '/backend/agency-operations/cases')
  const employeeCasesResponse = await staff.request.get('/api/agency_operations/cases?page=1&pageSize=20&sortField=createdAt&sortDir=desc')
  if (employeeCasesResponse.ok()) {
    const cases = await employeeCasesResponse.json() as AgencyCaseList
    const caseId = cases.items?.find((item) => typeof item.id === 'string' && item.id.length > 0)?.id
    if (caseId) await capture(staffPage, 'employee', '03-agency-case', `/backend/agency-operations/cases/${encodeURIComponent(caseId)}`)
    else recordGap('employee', '/backend/agency-operations/cases/:id', 'No genuine agency case was available to this employee; no case was fabricated.')
  } else {
    recordGap('employee', '/backend/agency-operations/cases/:id', `Employee case list API returned ${employeeCasesResponse.status()}; no elevated identity or ACL change was used.`)
  }
  await capture(staffPage, 'employee', '04-research-orders', '/backend/agency-research')
  const researchResponse = await staff.request.get('/api/agency_research/orders')
  if (researchResponse.ok()) {
    const research = await researchResponse.json() as ResearchOrderList
    const orderRef = research.items?.find((item) => typeof item.orderRef === 'string' && item.orderRef.length > 0)?.orderRef
    if (orderRef) await capture(staffPage, 'employee', '05-research-order', `/backend/agency-research/${encodeURIComponent(orderRef)}`)
    else recordGap('employee', '/backend/agency-research/:orderRef', 'No genuine research order was available to this employee; no order was fabricated.')
  } else {
    recordGap('employee', '/backend/agency-research/:orderRef', `Employee research list API returned ${researchResponse.status()}; agency_research.documents.view is required. No elevated identity or ACL change was used.`)
  }
  } catch (error) {
    recordGap('employee', 'capture setup', error instanceof Error ? error.message : String(error))
  }
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
  for (const [name, route] of [
    ['02-offer', `/${orgSlug}/portal/agency`],
    ['03-order', `/${orgSlug}/portal/agency/order`],
    ['04-materials', `/${orgSlug}/portal/agency/materials`],
    ['05-cases', `/${orgSlug}/portal/agency/cases`],
  ]) await capture(customerPage, 'customer', name, route)
  const customerCasesResponse = await customer.request.get('/api/agency/portal/cases?page=1&pageSize=20')
  if (customerCasesResponse.ok()) {
    const cases = await customerCasesResponse.json() as ClientCaseList
    const caseId = cases.items?.find((item) => typeof item.caseId === 'string' && item.caseId.length > 0)?.caseId
    if (caseId) await capture(customerPage, 'customer', '06-case', `/${orgSlug}/portal/agency/cases/${encodeURIComponent(caseId)}`)
    else recordGap('customer', `/${orgSlug}/portal/agency/cases/:id`, 'The temporary capture account has no genuine case; no case or ownership link was fabricated.')
  } else {
    recordGap('customer', `/${orgSlug}/portal/agency/cases/:id`, `Customer case list API returned ${customerCasesResponse.status()}; no case or ownership link was fabricated.`)
  }
  await capture(customerPage, 'customer', '07-tasks', `/${orgSlug}/portal/tasks`)
  const tasksResponse = await customer.request.get('/api/workflows/portal/tasks')
  if (tasksResponse.ok()) {
    const tasks = await tasksResponse.json() as PortalTaskList
    const taskId = tasks.ok === true
      ? tasks.tasks?.find((item) => typeof item.id === 'string' && item.id.length > 0)?.id
      : undefined
    if (taskId) await capture(customerPage, 'customer', '08-task-review', `/${orgSlug}/portal/tasks/${encodeURIComponent(taskId)}`)
    else recordGap('customer', `/${orgSlug}/portal/tasks/:id`, 'The temporary capture account has no genuine client task or review; no task or produced document was fabricated.')
  } else {
    recordGap('customer', `/${orgSlug}/portal/tasks/:id`, `Customer task list API returned ${tasksResponse.status()}; no task or review was fabricated.`)
  }
} catch (error) {
  recordGap('customer', 'capture setup', error instanceof Error ? error.message : String(error))
} finally {
  if (setupToken && userId && roleId) {
    const detached = await apiRequest(api, 'PUT', `/api/customer_accounts/admin/users/${userId}`, { token: setupToken, data: { roleIds: [] } })
    if (!detached.ok()) recordGap('customer', 'fixture cleanup', `Role detach returned ${detached.status()}`)
  }
  await deleteCustomerUserFixture(api, setupToken, userId)
  await deleteCustomerRoleFixture(api, setupToken, roleId)
  await deleteCustomerCompanyFixture(api, adminToken, companyId)
  await fs.writeFile(path.join(output, 'capture.json'), JSON.stringify({ viewport: { width: 1440, height: 1000 }, captures, gaps, fixtureIds: { companyId, userId, roleId } }, null, 2))
  const removedCaptureRuns = await retainLatestFiveCaptures(visualsRoot, output, captures[0]?.file)
  await browser.close()
  await api.dispose()
  console.log(JSON.stringify({ output, captures: captures.length, gaps, removedCaptureRuns }, null, 2))
}
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
