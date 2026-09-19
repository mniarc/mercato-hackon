import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createRoleFixture,
  createUserFixture,
  deleteRoleIfExists,
  deleteUserIfExists,
  setRoleAclFeatures,
} from '@open-mercato/core/helpers/integration/authFixtures'
import { deleteAttachmentIfExists } from '@open-mercato/core/helpers/integration/attachmentsFixtures'
import {
  createCustomerCompanyFixture,
  createCustomerRoleFixture,
  createCustomerUserFixture,
  deleteCustomerCompanyFixture,
  deleteCustomerRoleFixture,
  deleteCustomerUserFixture,
  portalLogin,
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { getTokenScope } from '@open-mercato/core/helpers/integration/generalFixtures'
import { findInstanceUserTask, pollWorkflowInstance } from '@open-mercato/core/helpers/integration/workflowsFixtures'
import { drainIntegrationQueue } from '@open-mercato/core/helpers/integration/queue'
import { startNativeTriageProvider } from './support/nativeTriageProvider'
import { configureCurrentTriageJourney, removeProductionJourneyDefinition } from './support/productionJourney/setup'
import { deleteNativeTriageFixtures } from './support/nativeTriageCleanup'
import { createBriefReviewFixture, deleteBriefReviewFixture, type BriefReviewFixture } from './support/briefReview'
import { createPlanReviewFixture, deletePlanReviewFixture, type PlanReviewFixture } from './support/planReview'
import { postExecutionOutcomeSchema } from '../../agency_research/lib/postExecution/contracts'
import { POST_EXECUTION_RESULT_KEY } from '../lib/postExecution/contracts'
import { demoPurchaseReceiptSchema, type DemoPurchaseReceipt } from '../lib/orderBootstrap/contracts'
import { demoOffer } from '../lib/orderBootstrap/demoOffer'
import { supplementaryMaterialResultSchema } from '../lib/contracts/clientMaterialIntake'
import { assertNoMatchingPurchaseAnalysis, configurePurchaseJourney } from './support/purchaseJourney/setup'
import { deletePurchaseJourneyRecords, type PurchaseFixtureScope } from './support/purchaseJourney/records'
import { captureDemoCheckpoint, finishDemoCapture } from './support/demoCapture'

export const integrationMeta = {
  dependsOnModules: [
    'agency_operations',
    'agency_research',
    'attachments',
    'auth',
    'customer_accounts',
    'customers',
    'workflows',
    'catalog',
    'sales',
    'payment_gateways',
    'example',
  ],
}

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'
const EMPLOYEE_FEATURES = [
  'agency_operations.cases.view',
  'agency_operations.cases.escalate',
  'agency_research.documents.view',
  'customers.companies.view',
  'workflows.instances.view',
  'workflows.view',
  'workflows.tasks.view',
  'workflows.tasks.claim',
  'workflows.tasks.complete',
]

type CreatedResources = {
  caseId: string | null
  attachmentId: string | null
  workflowInstanceId: string | null
}

async function captureDemoScreenshot(
  page: Page,
  testInfo: TestInfo,
  sequence: number,
  label: string,
): Promise<void> {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const name = `${String(sequence).padStart(2, '0')}-${slug}`
  const viewpoint = new URL(page.url()).pathname.startsWith('/backend') ? 'employee' : 'customer'
  await captureDemoCheckpoint(page, testInfo, name, viewpoint)
}

async function runDemoPhase<Result>(
  stepName: string,
  completedMessage: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  console.log(`[TC-AGENCY-001] ${stepName}: started`)
  return test.step(stepName, async () => {
    const result = await operation()
    console.log(`[TC-AGENCY-001] ${completedMessage}`)
    return result
  })
}

async function readOrganizationSlug(
  request: APIRequestContext,
  adminToken: string,
  tenantId: string,
  organizationId: string,
): Promise<string> {
  const response = await apiRequest(
    request,
    'GET',
    `/api/directory/organizations?view=manage&ids=${encodeURIComponent(organizationId)}&tenantId=${encodeURIComponent(tenantId)}`,
    { token: adminToken },
  )
  expect(response.ok(), 'Organization lookup should succeed').toBeTruthy()
  const body = (await response.json()) as { items?: Array<{ slug?: unknown }> }
  const slug = body.items?.[0]?.slug
  expect(typeof slug === 'string' && slug.length > 0, 'Organization slug should be present').toBe(
    true,
  )
  return slug as string
}

async function readCaseResourcesByTitle(
  title: string,
  tenantId: string,
  organizationId: string,
): Promise<CreatedResources> {
  return withClient(async (client) => {
    const result = await client.query<{
      id: string
      material_attachment_id: string | null
      workflow_instance_id: string | null
    }>(
      `SELECT id, material_attachment_id, workflow_instance_id
       FROM agency_cases
       WHERE title = $1 AND tenant_id = $2 AND organization_id = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [title, tenantId, organizationId],
    )
    const row = result.rows[0]
    return {
      caseId: row?.id ?? null,
      attachmentId: row?.material_attachment_id ?? null,
      workflowInstanceId: row?.workflow_instance_id ?? null,
    }
  })
}

async function deleteCreatedDatabaseRows(
  resources: CreatedResources,
  tenantId: string,
  organizationId: string,
): Promise<void> {
  await withClient(async (client) => {
    const workflows = await client.query<{ id: string }>(
      `SELECT id FROM workflow_instances WHERE tenant_id = $1 AND organization_id = $2
       AND (id = $3 OR correlation_key = $4 OR (metadata->>'entityType'='agency_operations:agency_case' AND metadata->>'entityId'=$5::text) OR id IN (
         SELECT workflow_instance_id FROM agency_client_submissions
         WHERE tenant_id = $1 AND organization_id = $2 AND case_id = $5::uuid
       ))`,
      [tenantId, organizationId, resources.workflowInstanceId, `agency-attention:${resources.caseId}`, resources.caseId],
    )
    for (const workflow of workflows.rows) {
      const scopedWorkflowParams = [workflow.id, tenantId, organizationId]
      if (process.env.AGENCY_TEST_NATIVE_TRIAGE === '1') {
        await deleteNativeTriageFixtures(client, workflow.id, tenantId, organizationId)
      }
      await client.query(
        'DELETE FROM workflow_events WHERE workflow_instance_id = $1 AND tenant_id = $2 AND organization_id = $3',
        scopedWorkflowParams,
      )
      await client.query(
        'DELETE FROM user_tasks WHERE workflow_instance_id = $1 AND tenant_id = $2 AND organization_id = $3',
        scopedWorkflowParams,
      )
      await client.query(
        'DELETE FROM step_instances WHERE workflow_instance_id = $1 AND tenant_id = $2 AND organization_id = $3',
        scopedWorkflowParams,
      )
      await client.query(
        'DELETE FROM workflow_branch_instances WHERE workflow_instance_id = $1 AND tenant_id = $2 AND organization_id = $3',
        scopedWorkflowParams,
      )
      await client.query(
        'DELETE FROM workflow_instances WHERE id = $1 AND tenant_id = $2 AND organization_id = $3',
        scopedWorkflowParams,
      )
    }
    if (resources.caseId) {
      await client.query(
        'DELETE FROM agency_client_replies WHERE case_id = $1 AND tenant_id = $2 AND organization_id = $3',
        [resources.caseId, tenantId, organizationId],
      )
      await client.query(
        'DELETE FROM agency_client_submissions WHERE case_id = $1 AND tenant_id = $2 AND organization_id = $3',
        [resources.caseId, tenantId, organizationId],
      )
      await client.query(
        'DELETE FROM agency_cases WHERE id = $1 AND tenant_id = $2 AND organization_id = $3',
        [resources.caseId, tenantId, organizationId],
      )
    }
  })
}

async function loginEmployee(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.context().addCookies([
    { name: 'om_demo_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' as const },
    { name: 'om_cookie_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' as const },
    { name: 'om_feedback_suppress', value: '1', url: BASE_URL, sameSite: 'Lax' as const },
  ])
  await page.goto(new URL('/login', BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  const loginResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/auth/login'
      && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await loginResponsePromise).ok(), 'Native employee login should succeed').toBeTruthy()
  await expect(page).toHaveURL(/\/backend(?:\/.*)?$/, { timeout: 20_000 })
}

test.use({ trace: 'retain-on-failure' })

test.describe('TC-AGENCY-001: real agency operations vertical slice', () => {
  let cleanupCurrentRun: (() => Promise<void>) | undefined

  test.afterEach(async ({}, testInfo) => {
    testInfo.setTimeout(30_000)
    const cleanup = cleanupCurrentRun
    cleanupCurrentRun = undefined
    try { await cleanup?.() }
    finally { await finishDemoCapture(testInfo) }
  })

  test('a paid case accepts supplementary material and preserves client and employee handoffs', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(480_000)

    let screenshotSequence = 0
    const capture = async (label: string) => {
      screenshotSequence += 1
      await captureDemoScreenshot(page, testInfo, screenshotSequence, label)
    }

    const adminToken = await getAuthToken(request, 'admin')
    const { tenantId, organizationId } = getTokenScope(adminToken)
    const provisioningToken = await getAuthToken(request, 'superadmin')
    const { userId: provisioningUserId } = getTokenScope(provisioningToken)
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const brand = `Agency proof ${suffix}`
    const title = `${demoOffer.name}: ${brand}`
    const fileName = `client-material-${suffix}.txt`
    const mimeType = 'text/plain'
    const sentinel = Buffer.from(`agency-operations-sentinel:${suffix}`, 'utf8')
    const employeeEmail = `agency-employee-${suffix}@test.local`
    const employeePassword = `AgencyProof-${suffix}!9a`

    let customerEntityId: string | null = null
    let customerUserId: string | null = null
    let customerRoleId: string | null = null
    let employeeRoleId: string | null = null
    let employeeUserId: string | null = null
    const provider = process.env.AGENCY_TEST_NATIVE_TRIAGE === '1' ? await startNativeTriageProvider() : null
    const nativePost = process.env.AGENCY_TEST_NATIVE_POST === '1'
    let employeeSignedIn = false
    let nativeRecovery: { workflowInstanceId: string; submissionId: string } | null = null
    let briefReview: BriefReviewFixture | null = null
    let planReview: PlanReviewFixture | null = null
    let planSubmissionId: string | undefined
    let ownedTriageDefinitionIds: string[] = []
    let purchaseScope: PurchaseFixtureScope | undefined
    let purchase: DemoPurchaseReceipt | undefined
    let resources: CreatedResources = {
      caseId: null,
      attachmentId: null,
      workflowInstanceId: null,
    }

    cleanupCurrentRun = async () => {
      try { await runDemoPhase('Clean up fixtures', 'Cleanup complete', async () => {
        if (!resources.caseId || !resources.attachmentId || !resources.workflowInstanceId) {
          resources = await readCaseResourcesByTitle(title, tenantId, organizationId).catch(
            () => resources,
          )
        }
        if (planReview) await deletePlanReviewFixture(planReview)
        if (briefReview) await deleteBriefReviewFixture(briefReview)
        if (resources.caseId) {
          const attachments = await withClient(async (client) => (await client.query<{ id: string }>(
            `SELECT id FROM attachments WHERE tenant_id=$1 AND organization_id=$2
             AND entity_id='agency_operations:agency_case' AND record_id=$3`,
            [tenantId, organizationId, resources.caseId])).rows)
          for (const attachment of attachments) await deleteAttachmentIfExists(request, adminToken, attachment.id)
        }
        await deleteCreatedDatabaseRows(resources, tenantId, organizationId)
        if (purchaseScope) await deletePurchaseJourneyRecords(request, adminToken, purchaseScope)
        for (const id of ownedTriageDefinitionIds) await removeProductionJourneyDefinition({ id, tenantId, organizationId })
        if (customerUserId && customerRoleId) {
          const response = await apiRequest(request, 'PUT', `/api/customer_accounts/admin/users/${customerUserId}`, {
            token: provisioningToken,
            data: { roleIds: [] },
          })
          expect(response.ok(), 'Fixture customer roles should be detached before deleting the user').toBeTruthy()
        }
        await deleteCustomerUserFixture(request, provisioningToken, customerUserId)
        await deleteCustomerRoleFixture(request, provisioningToken, customerRoleId)
        await deleteCustomerCompanyFixture(request, adminToken, customerEntityId)
        await deleteUserIfExists(request, provisioningToken, employeeUserId)
        await deleteRoleIfExists(request, provisioningToken, employeeRoleId)
      }) } finally { await provider?.close() }
    }

    {
      if (provider) {
        await runDemoPhase('Check native triage configuration', 'Native triage ready with local intelligence only', async () => {
          expect(process.env.OPENROUTER_BASE_URL).toBe(provider.baseUrl)
          if (nativePost) {
            const externalOverrides = await withClient(async (client) => client.query<{ count: string }>(
              `SELECT count(*) FROM ai_agent_runtime_overrides WHERE tenant_id=$1 AND deleted_at IS NULL
               AND (organization_id IS NULL OR organization_id=$2)
               AND (agent_id IS NULL OR agent_id IN ('agency_research.post_author','agency_research.post_editor'))
               AND NULLIF(btrim(base_url),'') IS NOT NULL AND btrim(base_url)<>$3`,
              [tenantId, organizationId, provider.baseUrl]))
            expect(Number(externalOverrides.rows[0].count), 'Native post proof requires loopback-only provider overrides').toBe(0)
          }
          ownedTriageDefinitionIds = await configureCurrentTriageJourney({ tenantId, organizationId, userId: provisioningUserId })
        })
      }
      const intakeIdentity = await runDemoPhase('Prepare fixtures', 'Fixture ready', async () => {
        const orgSlug = await readOrganizationSlug(
          request,
          adminToken,
          tenantId,
          organizationId,
        )
        const createdCustomerEntityId = await createCustomerCompanyFixture(
          request,
          adminToken,
          `Agency proof client ${suffix}`,
        )
        customerEntityId = createdCustomerEntityId
        const customerRole = await createCustomerRoleFixture(request, provisioningToken, {
          name: `Agency proof client role ${suffix}`,
          features: ['portal.tasks.view', 'portal.tasks.complete'],
          isPortalAdmin: false,
        })
        customerRoleId = customerRole.id
        const customerUser = await createCustomerUserFixture(request, provisioningToken, {
          customerEntityId: createdCustomerEntityId,
          displayName: `Agency proof customer ${suffix}`,
          roleIds: [customerRoleId],
        })
        customerUserId = customerUser.id
        purchaseScope = { tenantId, organizationId, customerEntityId: createdCustomerEntityId, customerUserId }
        await configurePurchaseJourney({ tenantId, organizationId, userId: provisioningUserId })
        await assertNoMatchingPurchaseAnalysis({ tenantId, organizationId })
        employeeRoleId = await createRoleFixture(request, adminToken, {
          name: `Agency proof employee ${suffix}`,
          tenantId,
        })
        await setRoleAclFeatures(request, provisioningToken, {
          roleId: employeeRoleId,
          features: EMPLOYEE_FEATURES,
          organizations: [organizationId],
        })
        employeeUserId = await createUserFixture(request, provisioningToken, {
          email: employeeEmail,
          password: employeePassword,
          organizationId,
          roles: [employeeRoleId, 'employee'],
          name: `Agency proof employee ${suffix}`,
        })
        return {
          customer: customerUser,
          orgSlug,
        }
      })

      const intakeResult = await runDemoPhase('Store intake', 'Intake stored', async () => {
        const portalSession = await portalLogin(request, {
          email: intakeIdentity.customer.email,
          password: intakeIdentity.customer.password,
          tenantId,
        })
        await page.context().addCookies([
          {
            name: 'customer_auth_token',
            value: portalSession.authToken,
            url: BASE_URL,
            sameSite: 'Lax',
          },
          {
            name: 'customer_session_token',
            value: portalSession.sessionToken,
            url: BASE_URL,
            sameSite: 'Lax',
          },
        ])
        // The primary TC002 journey proves signup and payment retry. Recovery needs only a real paid case.
        const created = await page.request.post(new URL('/api/agency/portal/purchases', BASE_URL).toString(), { data: {
          requestId: randomUUID(), offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion, acceptedTerms: true,
          buyer: { brandDisplayName: brand, brandWebsiteUrl: 'https://example.test', market: 'Polska', language: 'polski',
            contactName: 'Agency proof customer', contactEmail: intakeIdentity.customer.email, billingBuyerType: 'company',
            billingLegalName: brand, billingCountry: 'PL', billingAddress: 'Demo address, Warsaw', billingTaxId: 'DEMO-NOT-A-REAL-INVOICE',
            officialSocialUrl: '', purchaseGoal: 'Demonstrate supplementary materials and employee handoffs.' },
        } })
        expect(created.status(), await created.text()).toBe(201)
        const pending = demoPurchaseReceiptSchema.parse(await created.json())
        const confirmed = await page.request.post(new URL(`/api/agency/portal/purchases/${pending.orderId}/confirm`, BASE_URL).toString(), { data: {} })
        expect(confirmed.ok(), await confirmed.text()).toBeTruthy()
        purchase = demoPurchaseReceiptSchema.parse(await confirmed.json())
        expect(purchase).toMatchObject({ status: 'paid', caseId: expect.any(String), workflowInstanceId: expect.any(String),
          processing: { state: 'waiting_configuration' } })
        resources = await readCaseResourcesByTitle(title, tenantId, organizationId)
        expect(resources.caseId).toBe(purchase.caseId)
        const portalPath = `/${intakeIdentity.orgSlug}/portal/agency`
        await page.goto(new URL(portalPath, BASE_URL).toString(), {
          waitUntil: 'domcontentloaded',
        })
        await expect(page.getByRole('heading', { name: 'START KOMUNIKACJI', exact: true })).toBeVisible()
        await capture('portal-offer')
        await page.getByRole('link', { name: 'Send materials', exact: true }).click()
        await expect(page.locator('[data-material-form-ready="1"]')).toBeVisible()
        await capture('material-form')
        await page.locator('[data-material-form-ready="1"]').getByRole('combobox').click()
        await page.getByRole('option', { name: title, exact: true }).click()
        await page.getByLabel('Message about this material (optional)', { exact: true }).fill('Please help me clarify the next step.')
        await page.getByLabel('Material file', { exact: true }).setInputFiles({
          name: fileName,
          mimeType,
          buffer: sentinel,
        })
        await capture('material-form-filled')
        const submissionResponsePromise = page.waitForResponse((response) => {
          const url = new URL(response.url())
          return url.pathname === '/api/agency/portal/materials'
            && response.request().method() === 'POST'
        })
        await page.locator('form').filter({
          has: page.getByLabel('Message about this material (optional)', { exact: true }),
        }).getByRole('button', { name: 'Submit material', exact: true }).click()
        const submissionResponse = await submissionResponsePromise
        expect(submissionResponse.status(), 'Portal material submission should acknowledge native dispatch').toBe(
          202,
        )
        const result = supplementaryMaterialResultSchema.parse(await submissionResponse.json())
        expect(result).toMatchObject({
          caseId: purchase.caseId, replayed: false,
          state: provider ? 'submitted_to_native_triage' : 'saved_waiting_for_triage',
        })
        expect(result.attachmentId).not.toBe(resources.attachmentId)
        await expect(page.getByTestId('agency-material-case-id')).toContainText(result.caseId)
        await capture('material-submitted')
        return result
      })

      await runDemoPhase('Revisit client case', 'Client case revisited', async () => {
        await page.goto(new URL(`/${intakeIdentity.orgSlug}/portal/agency/cases`, BASE_URL).toString(), {
          waitUntil: 'domcontentloaded',
        })
        await page.getByRole('link', { name: title, exact: true }).click()
        await expect(page).toHaveURL(new RegExp(`/portal/agency/cases/${intakeResult.caseId}$`))
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByText(title, { exact: true })).toBeVisible()
        await expect(page.getByRole('status').filter({ hasText: 'The requested process is complete' })).toHaveCount(0)
        await capture('client-case')
      })

      await runDemoPhase('Route and reply to client submission', 'Clarification resumed once', async () => {
        const endpoint = new URL(`/api/agency/portal/cases/${intakeResult.caseId}/submissions`, BASE_URL).toString()
        type SavedSubmission = { submissionId: string; original: { eventId: string; text: string; materialAttachmentId?: string }; workflow: unknown; disposition: unknown }
        let result: { replayed: boolean; item: SavedSubmission }
        if (provider) {
          const saved = await page.request.get(endpoint)
          expect(saved.ok()).toBeTruthy()
          const body = await saved.json() as { items: SavedSubmission[] }
          const item = body.items.find((candidate) => candidate.submissionId === intakeResult.submissionId)
          expect(item?.original).toMatchObject({ text: 'Please help me clarify the next step.', materialAttachmentId: intakeResult.attachmentId })
          if (!item) throw new Error('[internal] Uploaded material submission is missing')
          result = { replayed: intakeResult.replayed, item }
          await drainIntegrationQueue('workflow-invoke-agent')
          await expect.poll(async () => {
            const saved = await page.request.get(endpoint)
            const body = await saved.json() as { items: Array<{ submissionId: string; workflow: unknown; disposition: unknown }> }
            return body.items.find((item) => item.submissionId === result.item.submissionId)
          }, { timeout: 30_000 }).toMatchObject({ workflow: { status: 'PAUSED', currentStep: 'client_reply' }, disposition: { kind: 'clarify', source: 'native_agent' } })
        } else {
          await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Please help me clarify the next step.')
          const submissionResponse = page.waitForResponse((response) => response.url() === endpoint && response.request().method() === 'POST')
          await page.getByRole('button', { name: 'Send message', exact: true }).click()
          const response = await submissionResponse
          expect(response.status(), 'Client submission should be persisted').toBe(201)
          result = await response.json() as { replayed: boolean; item: SavedSubmission }
        }
        const original = result.item.original
        expect(result).toMatchObject({ replayed: false, item: {
          original,
          ...(provider ? {} : {
            workflow: { status: 'PAUSED', currentStep: 'client_reply' },
            disposition: { kind: 'clarify', source: 'deterministic_scaffold', effectsApplied: false },
          }),
        } })
        const replayResponse = await page.request.post(endpoint, { data: original })
        expect(replayResponse.status()).toBe(200)
        expect(await replayResponse.json()).toMatchObject({ replayed: true, item: { submissionId: result.item.submissionId } })
        const replyEndpoint = `${endpoint}/${result.item.submissionId}/replies`
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId(`agency-client-submission-${result.item.submissionId}`)).toContainText(original.text)
        await capture('client-message-sent')
        await page.getByRole('textbox', { name: 'Your clarification', exact: true }).fill('Please prepare the next steps for my campaign.')
        const replyResult = page.waitForResponse((response) => response.url() === replyEndpoint && response.request().method() === 'POST')
        await page.getByRole('button', { name: 'Send clarification', exact: true }).click()
        const replyResponse = await replyResult
        const reply = replyResponse.request().postDataJSON() as { eventId: string; text: string }
        expect(replyResponse.status(), 'Clarification should resume its native workflow').toBe(201)
        const accepted = await replyResponse.json() as { item: { replyId: string } }
        const replyReplay = await page.request.post(replyEndpoint, { data: reply })
        expect(replyReplay.status()).toBe(200)
        expect(await replyReplay.json()).toMatchObject({ replayed: true, item: { replyId: accepted.item.replyId } })
        const savedReplies = await page.request.get(replyEndpoint)
        expect(savedReplies.ok()).toBeTruthy()
        expect(await savedReplies.json()).toMatchObject({ items: [{ original: reply, outcome: 'clarification_received' }] })
        const submissions = await page.request.get(endpoint)
        expect(submissions.ok()).toBeTruthy()
        const completed = await submissions.json() as { items: SavedSubmission[] }
        expect(completed.items.find((item) => item.submissionId === result.item.submissionId))
          .toMatchObject({ workflow: { status: 'COMPLETED', currentStep: 'reply_received' } })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId(`agency-client-reply-${accepted.item.replyId}`)).toContainText(reply.text)
        await capture('client-clarification-sent')
      })

      if (provider) {
        await runDemoPhase('Route native failure to employee', 'Native failure parked at its employee exception', async () => {
          expect(provider.calls).toHaveLength(1)
          provider.failNext()
          const endpoint = new URL(`/api/agency/portal/cases/${intakeResult.caseId}/submissions`, BASE_URL).toString()
          const response = await page.request.post(endpoint, { data: { eventId: randomUUID(), text: 'Fixture answer after recovery.' } })
          expect(response.status()).toBe(201)
          const result = await response.json() as { item: { submissionId: string } }
          const workflowInstanceId = await withClient(async (client) => {
            const rows = await client.query<{ workflow_instance_id: string }>('SELECT workflow_instance_id FROM agency_client_submissions WHERE id=$1 AND tenant_id=$2 AND organization_id=$3', [result.item.submissionId, tenantId, organizationId])
            return rows.rows[0].workflow_instance_id
          })
          nativeRecovery = { workflowInstanceId, submissionId: result.item.submissionId }
          await drainIntegrationQueue('workflow-invoke-agent')
          await pollWorkflowInstance(request, adminToken, workflowInstanceId, (instance) => instance.status === 'PAUSED' && instance.currentStepId === 'triage_exception')
          const employeeTask = await findInstanceUserTask(request, adminToken, workflowInstanceId)
          expect(employeeTask?.id).toBeTruthy()
          const forbidden = await page.request.post(new URL(`/api/workflows/tasks/${employeeTask!.id}/complete`, BASE_URL).toString(), { data: { decisionId: 'obstacle_resolved', formData: { triageRecoveryReason: 'Client is not staff', triageRecoveryEvidence: 'Not authorized' } } })
          expect(forbidden.ok()).toBe(false)
        })
      }

      await runDemoPhase('Read case artifacts', 'No unproduced artifacts exposed', async () => {
        const endpoint = new URL(`/api/agency/portal/cases/${intakeResult.caseId}/artifacts`, BASE_URL).toString()
        const response = await page.request.get(endpoint)
        expect(response.status()).toBe(200)
        expect(await response.json()).toEqual({ items: [] })
        expect((await page.request.get(`${endpoint}/${randomUUID()}`)).status()).toBe(404)
      })

      await runDemoPhase('Prepare employee research evidence', 'Saved research available for employee drilldown', async () => {
        briefReview = await createBriefReviewFixture({
          caseId: intakeResult.caseId, tenantId, organizationId, userId: provisioningUserId,
          customerEntityId: customerEntityId!, customerUserId: customerUserId!,
        })
      })

      if (provider && nativePost) {
        await runDemoPhase('Prepare native post QA exception', 'Client choice dispatched to the real post producer', async () => {
          planReview = await createPlanReviewFixture({ brief: briefReview!, userId: provisioningUserId, customerUserId: customerUserId! })
          provider.allowPlanApproval({ documentId: planReview.documentId, versionId: planReview.versionId,
            taskId: planReview.taskId, selectedTopicId: planReview.selectedTopicId })
          const response = await page.request.post(new URL(`/api/agency/plan-reviews/${planReview.taskId}`, BASE_URL).toString(), {
            data: { channel: 'portal', kind: 'approval', externalEventId: randomUUID(),
              plan: { documentId: planReview.documentId, versionId: planReview.versionId },
              approvePlan: true, selectedTopicId: planReview.selectedTopicId },
          })
          expect(response.ok(), await response.text()).toBeTruthy()
          const receipt = await response.json() as { requestId: string }
          planSubmissionId = receipt.requestId
          provider.allowPostProduction({ caseId: intakeResult.caseId, planVersion: planReview.version,
            selectedTopicId: planReview.selectedTopicId, selectionSubmissionId: receipt.requestId })
          await drainIntegrationQueue('workflow-invoke-agent')
        })
        await runDemoPhase('Ask about a native post QA exception', 'Exact-post answer received; native employee exception remains open', async () => {
          await drainIntegrationQueue('workflow-activities')
          const source = await withClient(async (client) => client.query<{ workflow_instance_id: string }>(
            'SELECT workflow_instance_id FROM agency_client_submissions WHERE id=$1 AND case_id=$2 AND tenant_id=$3 AND organization_id=$4',
            [planSubmissionId, intakeResult.caseId, tenantId, organizationId]))
          const workflowId = source.rows[0].workflow_instance_id
          await pollWorkflowInstance(request, adminToken, workflowId, (instance) => instance.status === 'PAUSED' && instance.currentStepId === 'research_exception')
          const saved = await withClient(async (client) => client.query<{ context: Record<string, { result: unknown }> }>(
            'SELECT context FROM workflow_instances WHERE id=$1 AND tenant_id=$2 AND organization_id=$3', [workflowId, tenantId, organizationId]))
          const production = postExecutionOutcomeSchema.parse(saved.rows[0].context[POST_EXECUTION_RESULT_KEY].result)
          expect(production).toMatchObject({ status: 'completed', readyForReview: false, qaVerdict: 'needs_fix', selectionSubmissionId: planSubmissionId })
          expect(production.postVersionId).toBeTruthy()
          expect(production.escalationVersionId).toBeTruthy()
          expect(saved.rows[0].context.agencyResearchException.result).toMatchObject({ kind: 'employee_exception', sourceWorkflowInstanceId: workflowId,
            exception: { versionId: production.escalationVersionId, data: { resolution: { state: 'open' } } } })
          expect(provider.postCalls.some((call) => call.agentId === 'agency_research.post_author' && call.status === 200)).toBe(true)
          expect(provider.postCalls.some((call) => call.agentId === 'agency_research.post_editor' && call.status === 200)).toBe(true)
          const task = await findInstanceUserTask(request, adminToken, workflowId)
          expect(task?.id).toBeTruthy()
          await loginEmployee(page, employeeEmail, employeePassword)
          employeeSignedIn = true
          await page.goto(new URL(`/backend/tasks/${task!.id}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
          await expect(page.getByText(/qa_exhausted/).first()).toBeVisible()
          await page.getByTestId('task-claim').click()
          await capture('post-qa-employee-exception')
          await page.goto(new URL(`/backend/agency-operations/cases/${intakeResult.caseId}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
          await page.locator('[data-crud-field-id="parentTaskId"]').getByRole('combobox').click()
          await page.getByRole('option', { name: 'Work exception / Wyjątek wykonania', exact: true }).click()
          const question = 'May we remove the duplicated opening from this exact post version?'
          await page.locator('[data-crud-field-id="question"]').getByRole('textbox').fill(question)
          await page.locator('[data-crud-field-id="documentVersionId"]').getByRole('combobox').click()
          await page.getByRole('option', { name: /^KLI-POST · / }).click()
          const questionResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency_operations/cases/${intakeResult.caseId}/questions` && response.request().method() === 'POST')
          await page.getByRole('button', { name: 'Ask the client', exact: true }).click()
          const asked = await questionResponse
          expect(asked.ok(), await asked.text()).toBeTruthy()
          const questionTask = await asked.json() as { customerTaskId: string; workflowInstanceId: string }
          await page.goto(new URL(`/${intakeIdentity.orgSlug}/portal/tasks/${questionTask.customerTaskId}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
          const answer = 'Remove the duplicated opening. Fixture answer after recovery.'
          await page.getByLabel('Your answer / Twoja odpowiedź').fill(answer)
          const completed = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/workflows/portal/tasks/${questionTask.customerTaskId}/complete` && response.request().method() === 'POST')
          await page.getByRole('button', { name: 'Complete task', exact: true }).click()
          const answered = await completed
          expect(answered.ok(), await answered.text()).toBeTruthy()
          await drainIntegrationQueue('workflow-invoke-agent')
          const retained = await withClient(async (client) => {
            const submission = await client.query<{ original: unknown }>(
              'SELECT original FROM agency_client_submissions WHERE case_id=$1 AND tenant_id=$2 AND organization_id=$3 AND event_id=$4',
              [intakeResult.caseId, tenantId, organizationId, `employee-question:${questionTask.customerTaskId}`])
            const parent = await client.query<{ status: string }>('SELECT status FROM user_tasks WHERE id=$1 AND workflow_instance_id=$2 AND tenant_id=$3 AND organization_id=$4',
              [task!.id, workflowId, tenantId, organizationId])
            const post = await client.query<{ approval_records: unknown[] }>('SELECT approval_records FROM agency_research_document_versions WHERE id=$1 AND tenant_id=$2 AND organization_id=$3',
              [production.postVersionId, tenantId, organizationId])
            const exception = await client.query<{ data: unknown }>('SELECT data FROM agency_research_document_versions WHERE id=$1 AND tenant_id=$2 AND organization_id=$3',
              [production.escalationVersionId, tenantId, organizationId])
            return { original: submission.rows[0]?.original, parent: parent.rows[0], post: post.rows[0], exception: exception.rows[0] }
          })
          expect(retained.original).toMatchObject({ text: answer, documentVersionReference: production.postVersionId })
          expect(retained.parent.status).toBe('IN_PROGRESS')
          expect(retained.post.approval_records).toEqual([])
          expect(retained.exception.data).toMatchObject({ resolution: { state: 'open' } })
          await capture('post-question-answer-received')
        })
      }

      await runDemoPhase('Sign in employee', 'Employee signed in', async () => {
        if (!employeeSignedIn) await loginEmployee(page, employeeEmail, employeePassword)
        else await page.goto(new URL('/backend', BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
        await capture('employee-signed-in')
      })

      await runDemoPhase('Open employee case', 'Case visible', async () => {
        await page.goto(new URL('/backend/agency-operations/cases', BASE_URL).toString(), {
          waitUntil: 'domcontentloaded',
        })
        await expect(page.getByRole('heading', { name: 'Agency cases', exact: true })).toBeVisible()
        const caseLink = page.getByRole('link', { name: title, exact: true })
        await expect(caseLink).toBeVisible()
        await caseLink.click()
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
        if (briefReview) {
          await expect(page.getByText('Persisted research work', { exact: true })).toBeVisible()
          await page.getByRole('button', { name: briefReview.versionId, exact: true }).first().click()
          await expect(page.getByText('Stored version, dependencies and quality evidence', { exact: true })).toBeVisible()
        }
        await capture('employee-case')
      })

      await runDemoPhase('Retrieve original purchase receipt', 'Original receipt preserved', async () => {
        const materialLink = page.getByRole('link', { name: 'Open material', exact: true })
        const downloadPromise = page.waitForEvent('download')
        await materialLink.click()
        const materialDownload = await downloadPromise
        const materialStream = await materialDownload.createReadStream()
        if (!materialStream) throw new Error('[internal] Material download returned no stream')
        const materialChunks: Buffer[] = []
        for await (const chunk of materialStream) {
          materialChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        expect(JSON.parse(Buffer.concat(materialChunks).toString('utf8'))).toMatchObject({
          demoOnly: true, caseId: intakeResult.caseId, orderId: purchase!.orderId, paymentId: purchase!.paymentId,
          originalPurchase: { buyer: { brandDisplayName: brand } },
        })
        await capture('material-retrieved')
      })

      await runDemoPhase('Escalate to employee inbox', 'Human attention completed', async () => {
        if (nativeRecovery && provider) {
          const task = await findInstanceUserTask(request, adminToken, nativeRecovery.workflowInstanceId)
          expect(task?.id).toBeTruthy()
          await page.goto(new URL(`/backend/tasks/${task!.id}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
          await page.getByTestId('task-claim').click()
          await page.getByLabel('Resolution rationale / Uzasadnienie').fill('Local provider fixture is available again.')
          await page.getByLabel('Resolution evidence / Dowody rozwiązania').fill('The controlled failure has been removed.')
          await capture('native-exception-claimed')
          await page.getByTestId('task-decision-obstacle_resolved').click()
          await drainIntegrationQueue('workflow-invoke-agent')
          await pollWorkflowInstance(request, adminToken, nativeRecovery.workflowInstanceId, (instance) => instance.status === 'COMPLETED' && instance.currentStepId === 'answered')
          expect(provider.calls.filter((call) => call.disposition === 'answer')).toHaveLength(nativePost ? 2 : 1)
          const duplicate = await page.request.post(new URL(`/api/workflows/tasks/${task!.id}/complete`, BASE_URL).toString(), { data: { decisionId: 'obstacle_resolved', formData: { triageRecoveryReason: 'Repeated', triageRecoveryEvidence: 'Repeated' } } })
          expect(duplicate.ok()).toBe(false)
          const runs = await withClient(async (client) => client.query<{ status: string }>(
            'SELECT status FROM agent_runs WHERE workflow_instance_id=$1 AND tenant_id=$2 AND organization_id=$3 ORDER BY created_at',
            [nativeRecovery!.workflowInstanceId, tenantId, organizationId],
          ))
          expect(runs.rows.map((run) => run.status)).toEqual(['error', 'ok'])
          expect(provider.calls.filter((call) => call.disposition === 'answer')).toHaveLength(nativePost ? 2 : 1)
          await capture('native-triage-recovered')
          return
        }
        await page.getByRole('button', { name: 'Request human attention', exact: true }).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByLabel('Reason', { exact: true }).fill(`Review requested for ${title}`)
        await capture('human-attention-request')
        const responsePromise = page.waitForResponse((response) =>
          new URL(response.url()).pathname === `/api/agency_operations/cases/${intakeResult.caseId}/escalate`
            && response.request().method() === 'POST',
          { timeout: 60_000 },
        )
        await dialog.getByRole('button', { name: 'Send to work inbox', exact: true }).click()
        const response = await responsePromise
        expect(response.ok(), 'Case escalation should succeed').toBeTruthy()
        const attention = await response.json() as { workflowInstanceId: string }
        const task = await findInstanceUserTask(request, adminToken, attention.workflowInstanceId)
        expect(task?.id, 'Escalation should create a native user task').toBeTruthy()
        await page.getByRole('link', { name: 'Open work inbox', exact: true }).click()
        await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
        await capture('employee-work-inbox')
        await page.goto(new URL(`/backend/tasks/${task!.id}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
        await page.getByTestId('task-claim').click()
        await capture('employee-task-claimed')
        await page.getByRole('button', { name: 'Complete', exact: true }).click()
        const completed = await pollWorkflowInstance(request, adminToken, attention.workflowInstanceId,
          (instance) => instance.status === 'COMPLETED')
        expect(completed?.status).toBe('COMPLETED')
        await capture('human-attention-completed')
      })
    }
  })
})
