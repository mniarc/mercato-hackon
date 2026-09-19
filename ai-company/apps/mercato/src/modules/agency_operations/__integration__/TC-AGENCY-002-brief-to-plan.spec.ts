import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenScope } from '@open-mercato/core/helpers/integration/generalFixtures'
import { drainIntegrationQueue } from '@open-mercato/core/helpers/integration/queue'
import {
  createCustomerCompanyFixture, createCustomerRoleFixture, createCustomerUserFixture,
  deleteCustomerCompanyFixture, deleteCustomerRoleFixture, deleteCustomerUserFixture, portalLogin,
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'
import { BRIEF_REVIEW_WORKFLOW_ID, BRIEF_REVIEW_CONTEXT_KEY, briefReviewInvitationSchema } from '../lib/briefStrategyProcess/contracts'
import { STRATEGY_PAIR_REVIEW_WORKFLOW_ID, STRATEGY_PAIR_REVIEW_CONTEXT_KEY, strategyPairInvitationSchema } from '../lib/strategyPairReview/contracts'
import { PLAN_REVIEW_WORKFLOW_ID, PLAN_REVIEW_CONTEXT_KEY, planReviewInvitationSchema } from '../lib/planReview/contracts'
import { analysisMaterialSchema } from '../lib/analysisProcess/contracts'
import { startNativeTriageProvider } from './support/nativeTriageProvider'
import { answersForQuestions, createProductionJourneyIntelligence } from './support/productionJourney/intelligence'
import { configureProductionJourney, readProducedBrief, removeProductionJourneyDefinition } from './support/productionJourney/setup'
import { assertLoopbackOverrides, deleteProductionJourneyRecords, readInvitation, type JourneyScope } from './support/productionJourney/records'

export const integrationMeta = {
  dependsOnModules: ['agency', 'agency_operations', 'agency_research', 'auth', 'customer_accounts', 'customers', 'attachments', 'workflows', 'agent_orchestrator'],
}
const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'
async function checkpoint(page: Page, info: TestInfo, name: string) {
  console.log(`[TC-AGENCY-002] ${name}`)
  if (process.env.PW_CAPTURE_SCREENSHOTS !== '1') return
  const target = info.outputPath('demo-screenshots', `${name}.png`)
  await page.screenshot({ path: target, fullPage: true, animations: 'disabled' })
  await info.attach(name, { path: target, contentType: 'image/png' })
}
async function continueNativeResponse() {
  await drainIntegrationQueue('workflow-invoke-agent')
  await drainIntegrationQueue('workflow-activities')
}

test.use({ trace: 'retain-on-failure' })
test.describe('TC-AGENCY-002: original client answers through real producers to a plan invitation', () => {
  let cleanup: (() => Promise<void>) | undefined
  test.afterEach(async ({}, info) => {
    info.setTimeout(60_000)
    const current = cleanup
    cleanup = undefined
    await current?.()
  })
  test('research asks, client answers and accepts the resulting brief and strategy pair', async ({ page, request }, info) => {
    test.setTimeout(600_000)
    expect(process.env.AGENCY_TEST_NATIVE_TRIAGE, 'Run only with the explicit local intelligence fixture').toBe('1')
    const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
    const sourceDirectory = path.join(appRoot, 'src/modules/agency_research/__fixtures__/flow')
    expect(path.resolve(process.env.AGENCY_TEST_RESEARCH_FIXTURE_DIR ?? '')).toBe(sourceDirectory)
    const intelligence = createProductionJourneyIntelligence(appRoot)
    const provider = await startNativeTriageProvider(5003, { resolveStructured: intelligence.resolveStructured })
    cleanup = () => provider.close()
    expect(process.env.OPENROUTER_BASE_URL).toBe(provider.baseUrl)
    const adminToken = await getAuthToken(request, 'admin')
    const provisioningToken = await getAuthToken(request, 'superadmin')
    const { tenantId, organizationId } = getTokenScope(adminToken)
    const { userId } = getTokenScope(provisioningToken)
    const suffix = randomUUID().slice(0, 8)
    let customerEntityId: string | null = null
    let customerUserId: string | null = null
    let customerRoleId: string | null = null
    let scope: JourneyScope | undefined
    let definitions: string[] = []
    cleanup = async () => {
      console.log('[TC-AGENCY-002] Clean up this journey only')
      try {
        if (scope) await deleteProductionJourneyRecords(request, adminToken, scope)
        for (const id of definitions) await removeProductionJourneyDefinition({ id, tenantId, organizationId })
        if (customerUserId && customerRoleId) {
          const detached = await apiRequest(request, 'PUT', `/api/customer_accounts/admin/users/${customerUserId}`, { token: provisioningToken, data: { roleIds: [] } })
          expect(detached.ok()).toBeTruthy()
        }
        await deleteCustomerUserFixture(request, provisioningToken, customerUserId)
        await deleteCustomerRoleFixture(request, provisioningToken, customerRoleId)
        await deleteCustomerCompanyFixture(request, adminToken, customerEntityId)
      } finally { await provider.close() }
    }
    const order = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'order.json'), 'utf8'))
    const social = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'social.json'), 'utf8'))
    const material = analysisMaterialSchema.parse({ order, socialPosts: social.posts,
      pages: ['https://makeitflow.pl/index.php', 'https://makeitflow.pl/projekty/flowco-ai', 'https://makeitflow.pl/promocje-konsumenckie'] })
    const customer = await test.step('Configure explicit fixture policy and a real customer', async () => {
      console.log('[TC-AGENCY-002] Configure new native versions and local source/model fixtures')
      await assertLoopbackOverrides({ tenantId, organizationId }, provider.baseUrl)
      definitions = await configureProductionJourney({ tenantId, organizationId, userId, productSelection: material.order.product_selection })
      customerEntityId = await createCustomerCompanyFixture(request, adminToken, `Production journey ${suffix}`)
      scope = { tenantId, organizationId, customerEntityId }
      customerRoleId = (await createCustomerRoleFixture(request, provisioningToken, {
        name: `Production customer ${suffix}`, features: ['portal.tasks.view', 'portal.tasks.complete'], isPortalAdmin: false,
      })).id
      const created = await createCustomerUserFixture(request, provisioningToken, { customerEntityId, roleIds: [customerRoleId], displayName: `Production customer ${suffix}` })
      customerUserId = created.id
      return created
    })
    const organizationResponse = await apiRequest(request, 'GET', `/api/directory/organizations?view=manage&ids=${organizationId}&tenantId=${tenantId}`, { token: adminToken })
    expect(organizationResponse.ok()).toBeTruthy()
    const orgSlug = (await organizationResponse.json() as { items: Array<{ slug: string }> }).items[0].slug
    const session = await portalLogin(request, { email: customer.email, password: customer.password, tenantId })
    await page.context().addCookies([
      { name: 'customer_auth_token', value: session.authToken, url: BASE_URL, sameSite: 'Lax' },
      { name: 'customer_session_token', value: session.sessionToken, url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_demo_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_cookie_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_feedback_suppress', value: '1', url: BASE_URL, sameSite: 'Lax' },
    ])
    const openTask = async (taskId: string) => page.goto(new URL(`/${orgSlug}/portal/tasks/${taskId}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
    const caseId = await test.step('Ingest real source material and run native initial research', async () => {
      console.log('[TC-AGENCY-002] Start native analysis; source fixtures contain no produced documents')
      const response = await request.post(new URL('/api/agency/portal/materials', BASE_URL).toString(), {
        headers: { Cookie: session.cookieHeader }, multipart: {
          title: `Brief-to-plan ${suffix}`, process: JSON.stringify({ kind: 'analysis' }),
          file: { name: `research-input-${suffix}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(material)) },
        },
      })
      expect(response.status(), await response.text()).toBe(202)
      const created = await response.json() as { caseId: string; workflowInstanceId: string; status: string }
      expect(created.status).toBe('WAITING_FOR_ACTIVITIES')
      expect(created.workflowInstanceId).toBeTruthy()
      await drainIntegrationQueue('workflow-activities')
      return created.caseId
    })
    const first = await readInvitation(scope!, caseId, BRIEF_REVIEW_WORKFLOW_ID)
    const original = briefReviewInvitationSchema.parse(first.context[BRIEF_REVIEW_CONTEXT_KEY]).review
    const produced = await readProducedBrief({ tenantId, organizationId }, caseId, original.versionId)
    expect(produced?.qa).toMatchObject({ state: 'assessed', verdict: 'needs_client_data' })
    expect(produced!.questions.length).toBeGreaterThan(0)
    await test.step('Customer answers the genuine brief questions through teammate review UI', async () => {
      await openTask(first.taskId)
      await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled()
      const heading = page.frameLocator('iframe').locator('h1,h2,p').first()
      await expect(heading).toBeVisible()
      const quote = await heading.evaluate((element) => {
        const doc = element.ownerDocument
        const range = doc.createRange()
        range.selectNodeContents(element)
        const selection = doc.getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        doc.dispatchEvent(new (doc.defaultView!.MouseEvent)('mouseup', { bubbles: true }))
        return element.textContent!.trim()
      })
      await page.getByRole('button', { name: 'Add comment', exact: true }).click()
      const answers = answersForQuestions(produced!.questions)
      await page.getByRole('textbox', { name: 'Your comment on this fragment…', exact: true }).fill(answers)
      intelligence.allowAnswers({ ...original, taskId: first.taskId, text: `1. „${quote}"\n   → ${answers}`, questions: produced!.questions })
      await checkpoint(page, info, '01-original-client-answers')
      const sent = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency/cases/${caseId}/requests` && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Send comments', exact: true }).click()
      expect((await sent).status()).toBe(201)
      await continueNativeResponse()
    })
    const revised = await readInvitation(scope!, caseId, BRIEF_REVIEW_WORKFLOW_ID)
    const ready = briefReviewInvitationSchema.parse(revised.context[BRIEF_REVIEW_CONTEXT_KEY]).review
    expect(ready.versionId).not.toBe(original.versionId)
    const readyBrief = await readProducedBrief({ tenantId, organizationId }, caseId, ready.versionId)
    expect(readyBrief?.qa, JSON.stringify({ qa: readyBrief?.qaDetails, questions: readyBrief?.questions })).toMatchObject({ state: 'assessed', verdict: 'ready_for_approval' })
    expect(intelligence.calls).toContain('agency_research.brief_answers')
    await test.step('Client explicitly accepts the newly produced exact brief', async () => {
      intelligence.allowBriefApproval({ ...ready, taskId: revised.taskId })
      await openTask(revised.taskId)
      await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled()
      await checkpoint(page, info, '02-revised-brief-ready-for-approval')
      const sent = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency/cases/${caseId}/requests` && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Accept', exact: true }).click()
      expect((await sent).status()).toBe(201)
      await continueNativeResponse()
    })
    const pairInvitation = await readInvitation(scope!, caseId, STRATEGY_PAIR_REVIEW_WORKFLOW_ID)
    const pair = strategyPairInvitationSchema.parse(pairInvitation.context[STRATEGY_PAIR_REVIEW_CONTEXT_KEY]).review
    await test.step('Client reviews and approves both actually produced paired versions', async () => {
      intelligence.allowPairApproval({ taskId: pairInvitation.taskId, strategy: pair.strategy, tov: pair.tov })
      await openTask(pairInvitation.taskId)
      await expect(page.getByRole('heading', { name: 'Review strategy and tone of voice', exact: true })).toBeVisible()
      await page.getByRole('checkbox', { name: 'Approve this strategy version', exact: true }).check()
      await page.getByRole('checkbox', { name: 'Approve this tone of voice version', exact: true }).check()
      await checkpoint(page, info, '03-produced-strategy-and-tone-pair')
      const sent = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency/strategy-reviews/${pairInvitation.taskId}` && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Send response', exact: true }).click()
      expect((await sent).ok()).toBeTruthy()
      await continueNativeResponse()
    })
    await test.step('The real planning producer hands its exact output to the client', async () => {
      const invitation = await readInvitation(scope!, caseId, PLAN_REVIEW_WORKFLOW_ID)
      const plan = planReviewInvitationSchema.parse(invitation.context[PLAN_REVIEW_CONTEXT_KEY]).review
      expect(plan.plan.templateId).toBe('WZR-PLAN')
      expect(plan.topics.length).toBeGreaterThan(0)
      await openTask(invitation.taskId)
      await expect(page.getByRole('heading', { name: 'Review your content plan', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Send response', exact: true })).toBeVisible()
      await checkpoint(page, info, '04-real-plan-awaiting-client-choice')
      console.log(`[TC-AGENCY-002] Completed through plan invitation; ${intelligence.calls.length} real native model-boundary calls. No plan approval, post production or publication performed.`)
    })
  })
})
