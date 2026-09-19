import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenScope } from '@open-mercato/core/helpers/integration/generalFixtures'
import { drainIntegrationQueue } from '@open-mercato/core/helpers/integration/queue'
import {
  customerTestPassword, deleteCustomerCompanyFixture, deleteCustomerUserFixture, portalLogin,
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'
import { BRIEF_REVIEW_WORKFLOW_ID, BRIEF_REVIEW_CONTEXT_KEY, briefReviewInvitationSchema } from '../lib/briefStrategyProcess/contracts'
import { STRATEGY_PAIR_REVIEW_WORKFLOW_ID, STRATEGY_PAIR_REVIEW_CONTEXT_KEY, strategyPairInvitationSchema } from '../lib/strategyPairReview/contracts'
import { PLAN_REVIEW_WORKFLOW_ID, PLAN_REVIEW_CONTEXT_KEY, planReviewInvitationSchema } from '../lib/planReview/contracts'
import { demoPurchaseReceiptSchema } from '../lib/orderBootstrap/contracts'
import { demoOffer } from '../lib/orderBootstrap/demoOffer'
import { supplementaryMaterialResultSchema } from '../lib/contracts/clientMaterialIntake'
import { answersForQuestions, SUPPLEMENTARY_MATERIAL_TEXT } from './support/productionJourney/intelligence'
import { configureFullProductionJourney, readProducedBrief, readSpecialistForCase, removeProductionJourneyDefinition } from './support/productionJourney/setup'
import { readJourneyMode, readClientJourneyInput, startJourneyIntelligence } from './support/productionJourney/mode'
import { createJourneyEvidence } from './support/productionJourney/evidence'
import { tovPostSchema } from '../../agency_tov/data/validators'
import { staffTovIntakeStatusSchema } from '../lib/tovIntake/contracts'
import { assertLoopbackOverrides, deleteProductionJourneyRecords, readInvitation, readUploadedResearchMaterial, type JourneyScope } from './support/productionJourney/records'
import { configurePurchaseJourney } from './support/purchaseJourney/setup'
import { deletePurchaseJourneyRecords, readOnboardedPurchaseCompanies, readPurchaseJourneyRecords } from './support/purchaseJourney/records'
import { readSignedUpPurchaseCustomer, signUpPurchaseCustomer, verifyCapturedPurchaseEmail } from './support/purchaseJourney/signup'
import { completeProducedPostJourney } from './support/productionJourney/downstream'
import { configureDiscordDestinationFixture, cleanupDiscordDestinationFixture, type DiscordDestinationFixture } from './support/discordDestinationFixture'
import type { PublicationDestinationResult } from '../../agency_research/lib/publicationDestination/contracts'
import { completeTovCorrection } from './support/productionJourney/tovCorrection'

export const integrationMeta = {
  dependsOnModules: ['agency', 'agency_operations', 'agency_research', 'agency_tov', 'auth', 'customer_accounts', 'customers', 'catalog', 'sales', 'payment_gateways', 'example', 'attachments', 'workflows', 'agent_orchestrator', 'communication_channels', 'channel_discord', 'integrations'],
}
const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'
let evidence: ReturnType<typeof createJourneyEvidence> | undefined
async function checkpoint(page: Page, info: TestInfo, name: string) {
  console.log(`[TC-AGENCY-002] ${name}`)
  await evidence?.checkpoint(name, 'completed')
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
test.describe('TC-AGENCY-002: primary customer journey to publication preparation without sending', () => {
  let cleanup: (() => Promise<void>) | undefined
  test.afterEach(async ({}, info) => {
    info.setTimeout(60_000)
    await evidence?.checkpoint('journey', info.status === 'passed' ? 'completed' : 'failed')
    const current = cleanup
    cleanup = undefined
    await current?.()
  })
  test('signup, purchase, materials and genuine client decisions reach configured publication preparation', async ({ page, request }, info) => {
    test.setTimeout(600_000)
    const mode = readJourneyMode()
    const tovCorrection = process.env.AGENCY_JOURNEY_TOV_CORRECTION === '1'
    if (tovCorrection && mode !== 'fixture') throw new Error('The ToV correction proof is a fixture-only alternative, not paid execution authority')
    const clientInput = readClientJourneyInput(mode)
    expect(process.env.AGENCY_TOV_EXECUTION_ENABLED, 'Enable the authoritative specialist for the same intelligence mode').toMatch(/^(1|true)$/)
    expect(process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED, 'Enable the zero-charge purchase in app and runner').toMatch(/^(1|true)$/)
    expect(process.env.OM_ENABLE_TEST_CHANNEL_SEEDING, 'Enable only the network-free native channel fixture in app and runner').toMatch(/^(1|true)$/)
    const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
    const sourceDirectory = path.join(appRoot, 'src/modules/agency_research/__fixtures__/flow')
    expect(path.resolve(process.env.AGENCY_TEST_RESEARCH_FIXTURE_DIR ?? '')).toBe(sourceDirectory)
    evidence = createJourneyEvidence(appRoot, mode)
    await evidence.checkpoint('journey', 'started')
    const provider = await startJourneyIntelligence(appRoot, mode)
    const { intelligence } = provider
    cleanup = () => provider.close()
    const adminToken = await getAuthToken(request, 'admin')
    const provisioningToken = await getAuthToken(request, 'superadmin')
    const { tenantId, organizationId } = getTokenScope(adminToken)
    const { userId } = getTokenScope(provisioningToken)
    const suffix = randomUUID().slice(0, 8)
    const customer = { email: `agency-production-${randomUUID()}@example.test`, password: customerTestPassword(),
      displayName: `Production customer ${suffix}` }
    let customerEntityId: string | null = null
    let customerUserId: string | null = null
    let scope: JourneyScope | undefined
    let definitions: string[] = []
    let discordFixture: DiscordDestinationFixture | undefined
    cleanup = async () => {
      console.log('[TC-AGENCY-002] Clean up this journey only')
      try {
        customerUserId ??= (await readSignedUpPurchaseCustomer(request, provisioningToken, customer.email))?.id ?? null
        const companies = customerUserId ? await readOnboardedPurchaseCompanies({ tenantId, organizationId, customerUserId }) : []
        for (const companyId of companies) {
          const owned = { tenantId, organizationId, customerEntityId: companyId, customerUserId: customerUserId! }
          const records = await readPurchaseJourneyRecords(owned)
          for (const item of records.cases) await evidence?.collect(owned, item.id)
          await deleteProductionJourneyRecords(request, adminToken, owned)
          await deletePurchaseJourneyRecords(request, adminToken, owned)
        }
        for (const id of definitions) await removeProductionJourneyDefinition({ id, tenantId, organizationId })
        await deleteCustomerUserFixture(request, provisioningToken, customerUserId)
        for (const companyId of companies) await deleteCustomerCompanyFixture(request, adminToken, companyId)
      } finally {
        try { if (discordFixture) await cleanupDiscordDestinationFixture(discordFixture, { request, token: provisioningToken }) }
        finally { await provider.close() }
      }
    }
    const order = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'order.json'), 'utf8'))
    order.brand.display_name = `${order.brand.display_name} demo-${suffix}`
    await test.step('Configure explicit test-owned policy for the real purchase and process', async () => {
      console.log('[TC-AGENCY-002] Configure new native versions and local source/model fixtures')
      if (provider.baseUrl) await assertLoopbackOverrides({ tenantId, organizationId }, provider.baseUrl)
      await configurePurchaseJourney({ tenantId, organizationId, userId })
      definitions = await configureFullProductionJourney({ tenantId, organizationId, userId, tovCorrection, productSelection: {
        sku: demoOffer.sku, offer_version: demoOffer.offerVersion, price_net: demoOffer.amount, currency: demoOffer.currency,
        result_limits: order.product_selection.result_limits,
      } })
    })
    const organizationResponse = await apiRequest(request, 'GET', `/api/directory/organizations?view=manage&ids=${organizationId}&tenantId=${tenantId}`, { token: adminToken })
    expect(organizationResponse.ok()).toBeTruthy()
    const orgSlug = (await organizationResponse.json() as { items: Array<{ slug: string }> }).items[0].slug
    await test.step('Register a fresh customer and verify the actual captured signup email', async () => {
      await signUpPurchaseCustomer(page, { ...customer, orgSlug, baseUrl: BASE_URL })
      const created = await readSignedUpPurchaseCustomer(request, provisioningToken, customer.email)
      expect(created).toBeTruthy()
      customerUserId = created!.id
      expect(created).toMatchObject({ customerEntityId: null, emailVerified: false })
      await verifyCapturedPurchaseEmail(request, customer.email, BASE_URL)
      await checkpoint(page, info, '00-native-signup-email-verified')
    })
    const session = await portalLogin(request, { email: customer.email, password: customer.password, tenantId })
    await page.context().addCookies([
      { name: 'customer_auth_token', value: session.authToken, url: BASE_URL, sameSite: 'Lax' },
      { name: 'customer_session_token', value: session.sessionToken, url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_demo_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_cookie_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' },
      { name: 'om_feedback_suppress', value: '1', url: BASE_URL, sameSite: 'Lax' },
    ])
    const openTask = async (taskId: string) => page.goto(new URL(`/${orgSlug}/portal/tasks/${taskId}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
    const paid = await test.step('Purchase through the real customer form and queue research for the same paid case', async () => {
      console.log('[TC-AGENCY-002] Real order and zero-charge payment; no internal process JSON or seeded research')
      const purchases = '/api/agency/portal/purchases'
      const offered = page.waitForResponse((response) => new URL(response.url()).pathname === purchases && response.request().method() === 'GET')
      await page.goto(new URL(`/${orgSlug}/portal/agency/order`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
      const offerResponse = await offered
      expect(offerResponse.ok(), await offerResponse.text()).toBeTruthy()
      expect(await offerResponse.json()).toMatchObject({ enabled: true, sku: demoOffer.sku, amount: demoOffer.amount,
        currency: demoOffer.currency, offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion })
      const fields = { brandDisplayName: order.brand.display_name, brandWebsiteUrl: order.brand.website_url,
        market: order.market_language.market, language: order.market_language.language,
        contactName: `Production customer ${suffix}`, contactEmail: customer.email,
        billingLegalName: `Production journey ${suffix}`, billingCountry: 'PL', billingAddress: 'Fixture address, Warsaw',
        billingTaxId: 'DEMO-NOT-A-REAL-INVOICE', officialSocialUrl: order.official_social.url, purchaseGoal: order.purchase_goal }
      for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value as string)
      await page.locator('#billingBuyerType').selectOption('company')
      await page.getByRole('checkbox').check()
      const initiated = page.waitForResponse((response) => new URL(response.url()).pathname === purchases && response.request().method() === 'POST')
      const onboarding = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/agency/portal/onboarding' && response.request().method() === 'POST')
      await page.getByRole('button', { name: /Create demo order|Utwórz zamówienie demonstracyjne/ }).click()
      const onboardedResponse = await onboarding
      expect(onboardedResponse.ok(), await onboardedResponse.text()).toBeTruthy()
      const linked = await onboardedResponse.json() as { customerEntityId: string; replayed: boolean }
      expect(linked.replayed).toBe(false)
      customerEntityId = linked.customerEntityId
      scope = { tenantId, organizationId, customerEntityId }
      expect(await readOnboardedPurchaseCompanies({ ...scope, customerUserId: customerUserId! })).toEqual([customerEntityId])
      const initiatedResponse = await initiated
      expect(initiatedResponse.status(), await initiatedResponse.text()).toBe(201)
      const pending = demoPurchaseReceiptSchema.parse(await initiatedResponse.json())
      expect(pending).toMatchObject({ status: 'pending_payment', caseId: null })
      const confirmed = page.waitForResponse((response) => new URL(response.url()).pathname === `${purchases}/${pending.orderId}/confirm`
        && response.request().method() === 'POST')
      await page.getByRole('button', { name: /Confirm test payment|Potwierdź płatność testową/ }).click()
      const confirmedResponse = await confirmed
      expect(confirmedResponse.ok(), await confirmedResponse.text()).toBeTruthy()
      const receipt = demoPurchaseReceiptSchema.parse(await confirmedResponse.json())
      expect(receipt).toMatchObject({ status: 'paid', orderId: pending.orderId, paymentId: pending.paymentId,
        processing: { state: 'started', nativeStatus: 'WAITING_FOR_ACTIVITIES' } })
      expect(receipt.caseId).toBeTruthy()
      expect(receipt.processing?.state === 'started' && receipt.processing.workflowInstanceId).toBe(receipt.workflowInstanceId)
      await checkpoint(page, info, '00-paid-case-native-research-queued')
      return receipt
    })
    const caseId = paid.caseId!
    const uploaded = await test.step('Upload real private material to this paid case before research starts', async () => {
      intelligence.allowMaterial({ text: SUPPLEMENTARY_MATERIAL_TEXT })
      await page.goto(new URL(`/${orgSlug}/portal/agency/materials?caseId=${caseId}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
      await page.getByLabel('Material file', { exact: true }).setInputFiles({ name: `private-background-${suffix}.txt`,
        mimeType: 'text/plain', buffer: Buffer.from(SUPPLEMENTARY_MATERIAL_TEXT) })
      await page.getByLabel('Message about this material (optional)', { exact: true }).fill(SUPPLEMENTARY_MATERIAL_TEXT)
      const sent = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/agency/portal/materials'
        && response.request().method() === 'POST')
      await page.locator('form').filter({ has: page.getByLabel('Message about this material (optional)', { exact: true }) })
        .getByRole('button', { name: 'Submit material', exact: true }).click()
      const response = await sent
      expect(response.status(), await response.text()).toBe(202)
      const saved = supplementaryMaterialResultSchema.parse(await response.json())
      expect(saved).toMatchObject({ caseId, state: 'submitted_to_native_triage', replayed: false })
      intelligence.allowMaterial({ text: SUPPLEMENTARY_MATERIAL_TEXT, attachmentId: saved.attachmentId })
      await expect(page.getByTestId('agency-material-case-id')).toHaveText(caseId)
      await checkpoint(page, info, '00b-private-material-saved-on-paid-case')
      return saved
    })
    await test.step('Run the teammate research producer for this purchased case', async () => {
      await continueNativeResponse()
      const saved = await readUploadedResearchMaterial(scope!, caseId, uploaded.attachmentId)
      expect(saved.attachment?.id).toBe(uploaded.attachmentId)
      expect(saved.attachment?.material_attachment_id).not.toBe(uploaded.attachmentId)
      expect(saved.source).toMatchObject({ content_md: SUPPLEMENTARY_MATERIAL_TEXT, access: 'full', source_visibility: 'client_private' })
    })
    const first = await readInvitation(scope!, caseId, BRIEF_REVIEW_WORKFLOW_ID)
    const original = briefReviewInvitationSchema.parse(first.context[BRIEF_REVIEW_CONTEXT_KEY]).review
    const produced = await readProducedBrief({ tenantId, organizationId }, caseId, original.versionId)
    expect(produced?.qa.state).toBe('assessed')
    if (produced?.qa.state === 'assessed' && produced.qa.verdict === 'needs_client_data') await test.step('Customer answers the genuine brief questions through teammate review UI', async () => {
      expect(produced.questions.length, 'A client-data hold must expose actionable questions').toBeGreaterThan(0)
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
      const answers = clientInput ? produced!.questions.map((question) => {
        const answer = clientInput.answers[question.brief_field]
        if (!answer) throw new Error(`An explicit client answer is needed for ${question.brief_field}`)
        return `${question.question_id}: ${answer}`
      }).join('\n\n') : answersForQuestions(produced!.questions)
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
    const readyBrief = await readProducedBrief({ tenantId, organizationId }, caseId, ready.versionId)
    expect(readyBrief?.qa, JSON.stringify({ qa: readyBrief?.qaDetails, questions: readyBrief?.questions })).toMatchObject({ state: 'assessed', verdict: 'ready_for_approval' })
    const specialist = await test.step('Staff supplies corpus to the actual native ToV specialist', async () => {
      const social = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'social.json'), 'utf8')) as { posts: unknown[] }
      const posts = social.posts.map((post) => tovPostSchema.parse({ ...post as object, source: 'linkedin',
        profileUrl: `${order.official_social.url}#agency-demo-${caseId}`, media: 'none' }))
      const response = await request.post(new URL('/api/agency_operations/tov-intakes', BASE_URL).toString(), { headers: { Authorization: `Bearer ${provisioningToken}` },
        multipart: { caseId, eventId: `journey-${suffix}`, brand: order.brand.display_name, outputLanguage: order.market_language.language,
          file: { name: `tov-${suffix}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(posts)) } },
      })
      expect(response.ok(), await response.text()).toBeTruthy()
      const accepted = staffTovIntakeStatusSchema.parse(await response.json())
      await continueNativeResponse()
      const resolved = await readSpecialistForCase({ tenantId, organizationId, caseId })
      expect(resolved.status, 'The native specialist must finish; no alternate ToV writer can replace it').toBe('ready')
      if (resolved.status !== 'ready') throw new Error('Specialist ToV is not ready')
      expect(resolved.workflowInstanceId).toBe(accepted.workflowInstanceId)
      await checkpoint(page, info, '02b-authoritative-specialist-tov-produced')
      return resolved.reference
    })
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
    expect(pair.tov.versionId).toBe(specialist.versionId)
    if (tovCorrection) {
      await test.step('Client requests a real specialist correction and receives the newly assessed exact pair', async () => {
        await completeTovCorrection({ page, scope: scope!, caseId, invitation: pairInvitation, intelligence, openTask, continueNativeResponse })
        await checkpoint(page, info, '03-specialist-correction-fresh-pair-review')
      })
      console.log('[TC-AGENCY-002] Correction alternative reached a fresh unapproved pair review; no planning, publication or approval was inferred.')
      return
    }
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
      const records = await readPurchaseJourneyRecords({ ...scope!, customerUserId: customerUserId! })
      expect(records.orders).toHaveLength(1)
      expect(records.payments).toHaveLength(1)
      expect(records.cases).toHaveLength(1)
      expect(records.cases[0]).toMatchObject({ id: caseId, workflow_id: 'agency_operations.analysis.v1',
        workflow_instance_id: paid.processing?.state === 'started' ? paid.processing.workflowInstanceId : undefined })
      expect(records.orders[0].id).toBe(paid.orderId)
      expect(Number(records.payments[0].captured_amount)).toBe(demoOffer.amount)
      expect(records.attempts).toHaveLength(1)
      expect(records.attempts).toEqual(expect.arrayContaining([
        expect.objectContaining({ payment_id: paid.paymentId, unified_status: 'captured' }),
      ]))
    })
    const preparation = await completeProducedPostJourney({ page, request, adminToken, scope: scope!, caseId, baseUrl: BASE_URL, orgSlug,
      intelligence, selectedTopicId: clientInput?.selectedTopicId ?? 'TOP02', continueNativeResponse, capture: (name) => checkpoint(page, info, name) })
    await test.step('Staff configures the exact Discord destination without consent or sending', async () => {
      const postPath = `/api/agency_research/document-versions?id=${preparation.postVersionId}`
      const beforeResponse = await apiRequest(request, 'GET', postPath, { token: provisioningToken })
      expect(beforeResponse.ok(), await beforeResponse.text()).toBeTruthy()
      const before = await beforeResponse.json() as { approval_records: unknown[] }
      discordFixture = await configureDiscordDestinationFixture({ tenantId, organizationId, userId, request, token: provisioningToken })
      const configuredResponse = await apiRequest(request, 'POST', `/api/agency_operations/cases/${caseId}/publication-destination`, {
        token: provisioningToken, data: { nativeChannelId: discordFixture.nativeChannelId,
          discordChannelId: discordFixture.discordChannelId, displayName: discordFixture.displayName },
      })
      expect(configuredResponse.ok(), await configuredResponse.text()).toBeTruthy()
      const configured = await configuredResponse.json() as PublicationDestinationResult
      expect(configured).toMatchObject({ status: 'configured', orderRef: caseId, readiness: 'not_verified', canSend: false,
        target: { platform: 'Discord', channelId: discordFixture.discordChannelId, displayName: discordFixture.displayName } })
      if (configured.status !== 'configured') throw new Error('The authorized staff destination was not saved')
      expect(configured.preparation).toMatchObject({ status: 'prepared', configVersionId: configured.configVersionId,
        postVersionId: preparation.postVersionId, acceptanceSubmissionId: preparation.acceptanceSubmissionId,
        contentApproval: 'valid', publicationConsent: 'missing', canSend: false })
      const savedResponse = await apiRequest(request, 'GET', `/api/agency_research/document-versions?id=${configured.configVersionId}`, { token: provisioningToken })
      expect(savedResponse.ok(), await savedResponse.text()).toBeTruthy()
      expect(await savedResponse.json()).toMatchObject({ order_id: caseId, template_id: 'WZR-KONFIG-PUBLIKACJI', data: {
        destination_identity: { channel_or_page_id_or_null: discordFixture.discordChannelId, display_name: discordFixture.displayName },
        readiness: { state: 'not_ready' },
      } })
      const afterResponse = await apiRequest(request, 'GET', postPath, { token: provisioningToken })
      expect(afterResponse.ok(), await afterResponse.text()).toBeTruthy()
      const after = await afterResponse.json() as { approval_records: unknown[] }
      expect(after.approval_records).toEqual(before.approval_records)
      console.log(`[TC-AGENCY-002] Saved exact Discord target ${discordFixture.discordChannelId}; refreshed preparation remains unverified and cannot send. Existing content acceptance is unchanged.`)
    })
    console.log(`[TC-AGENCY-002] Primary journey reached configured publication preparation in ${mode} intelligence mode; sending remains disabled. Native evidence: ${evidence.file}`)
  })
})
