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
import { workflowDefinitionDataSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { nativeClientSubmissionDefinition, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../agents/client-triage/workflow'
import { startNativeTriageProvider } from './support/nativeTriageProvider'
import { deleteNativeTriageFixtures } from './support/nativeTriageCleanup'
import { createBriefReviewFixture, deleteBriefReviewFixture, type BriefReviewFixture } from './support/briefReview'
import { createPlanReviewFixture, createPostReviewFixture, deletePlanReviewFixture, type PlanReviewFixture } from './support/planReview'
import { publicationPreparationPreparedSchema } from '../../agency_research/lib/publicationPreparation/contracts'
import { postExecutionOutcomeSchema } from '../../agency_research/lib/postExecution/contracts'
import { POST_EXECUTION_RESULT_KEY } from '../lib/postExecution/contracts'

export const integrationMeta = {
  dependsOnModules: [
    'agency_operations',
    'agency_research',
    'attachments',
    'auth',
    'customer_accounts',
    'customers',
    'workflows',
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

type PortalMaterialSubmission = {
  caseId: string
  workflowInstanceId: string
  status: 'COMPLETED'
}

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
  if (process.env.PW_CAPTURE_SCREENSHOTS !== '1') return
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const fileName = `${String(sequence).padStart(2, '0')}-${slug}.png`
  const screenshotPath = testInfo.outputPath('demo-screenshots', fileName)
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })
  await testInfo.attach(`demo-${fileName}`, { path: screenshotPath, contentType: 'image/png' })
  console.log(`[TC-AGENCY-001] Screenshot saved: ${fileName}`)
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
  capture: (label: string) => Promise<void>,
): Promise<void> {
  await page.context().addCookies([
    { name: 'om_demo_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' as const },
    { name: 'om_cookie_notice_ack', value: 'ack', url: BASE_URL, sameSite: 'Lax' as const },
    { name: 'om_feedback_suppress', value: '1', url: BASE_URL, sameSite: 'Lax' as const },
  ])
  await page.goto(new URL('/login', BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
  await capture('employee-login-form')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await capture('employee-login-filled')
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
    await cleanup?.()
  })

  test('trusted intake becomes a completed employee-visible case with retrievable material', async ({
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
    const title = `Agency proof ${suffix}`
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
    let nativeProcess: { workflowDefinitionId: string; workflowId: string; version: number } | undefined
    let postInstruction: { instructionVersionId: string; selectionSubmissionId: string } | undefined
    let planSubmissionId: string | undefined
    let publicationPreparation: ReturnType<typeof publicationPreparationPreparedSchema.parse> | undefined
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
        await deleteAttachmentIfExists(request, adminToken, resources.attachmentId)
        await deleteCreatedDatabaseRows(resources, tenantId, organizationId)
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
          type NativeDefinition = {
            id: string; workflowId: string; version: number; tenantId: string | null; organizationId: string | null
            enabled: boolean; lifecycle: string; definition: unknown; grantedFeatures: string[] | null
          }
          let selected: NativeDefinition | undefined
          for (let offset = 0; ; offset += 100) {
            const query = new URLSearchParams({ workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, enabled: 'true', lifecycle: 'published', limit: '100', offset: String(offset) })
            const response = await apiRequest(request, 'GET', `/api/workflows/definitions?${query}`, { token: adminToken })
            expect(response.ok(), 'Native triage definition lookup should succeed').toBeTruthy()
            const definitions = await response.json() as { data: NativeDefinition[]; pagination: { hasMore: boolean } }
            for (const definition of definitions.data) {
              if (definition.workflowId === NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID
                && definition.tenantId === tenantId && definition.organizationId === organizationId
                && definition.enabled && definition.lifecycle === 'published'
                && (!selected || definition.version > selected.version)) selected = definition
            }
            if (!definitions.pagination.hasMore) break
          }
          if (!selected) throw new Error('Native triage has no enabled published definition in this scope. Run agency_operations configure-triage for the persistent development runtime before the demo.')
          expect(workflowDefinitionDataSchema.parse(selected.definition)).toEqual(workflowDefinitionDataSchema.parse(nativeClientSubmissionDefinition))
          expect(selected.grantedFeatures).toContain('agent_orchestrator.agents.run')
          nativeProcess = { workflowDefinitionId: selected.id, workflowId: selected.workflowId, version: selected.version }
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
        const portalPath = `/${intakeIdentity.orgSlug}/portal/agency`
        await page.goto(new URL(portalPath, BASE_URL).toString(), {
          waitUntil: 'domcontentloaded',
        })
        await expect(page.getByRole('heading', { name: 'START KOMUNIKACJI', exact: true })).toBeVisible()
        await capture('portal-offer')
        await page.getByRole('link', { name: 'Send materials', exact: true }).click()
        await expect(page.locator('[data-material-form-ready="1"]')).toBeVisible()
        await capture('material-form')
        await page.getByLabel('Title', { exact: true }).fill(title)
        await page.getByLabel('Material file', { exact: true }).setInputFiles({
          name: fileName,
          mimeType,
          buffer: sentinel,
        })
        await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title)
        await capture('material-form-filled')
        const submissionResponsePromise = page.waitForResponse((response) => {
          const url = new URL(response.url())
          return url.pathname === '/api/agency/portal/materials'
            && response.request().method() === 'POST'
        })
        await page.getByRole('button', { name: 'Submit material', exact: true }).click()
        const submissionResponse = await submissionResponsePromise
        expect(submissionResponse.status(), 'Portal material submission should return 201').toBe(
          201,
        )
        const result = (await submissionResponse.json()) as PortalMaterialSubmission
        expect(result).toMatchObject({
          caseId: expect.any(String),
          workflowInstanceId: expect.any(String),
          status: 'COMPLETED',
        })
        await expect(page.getByTestId('agency-material-case-id')).toContainText(result.caseId)
        await capture('material-submitted')
        resources = {
          caseId: result.caseId,
          attachmentId: null,
          workflowInstanceId: result.workflowInstanceId,
        }
        return result
      })

      await runDemoPhase('Complete workflow', 'Workflow complete', async () => {
        const completedInstance = await pollWorkflowInstance(
          request,
          adminToken,
          intakeResult.workflowInstanceId,
          (instance) => instance.status === 'COMPLETED' && instance.currentStepId === 'end',
          { timeoutMs: 30_000 },
        )
        expect(completedInstance).toMatchObject({
          id: intakeResult.workflowInstanceId,
          status: 'COMPLETED',
          currentStepId: 'end',
        })
      })

      await runDemoPhase('Revisit client case', 'Client case revisited', async () => {
        await page.goto(new URL(`/${intakeIdentity.orgSlug}/portal/agency/cases`, BASE_URL).toString(), {
          waitUntil: 'domcontentloaded',
        })
        await page.getByRole('link', { name: title, exact: true }).click()
        await expect(page).toHaveURL(new RegExp(`/portal/agency/cases/${intakeResult.caseId}$`))
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByText(title, { exact: true })).toBeVisible()
        await expect(page.getByRole('status').filter({ hasText: 'The requested process is complete' })).toBeVisible()
        await capture('client-case')
      })

      await runDemoPhase('Route and reply to client submission', 'Clarification resumed once', async () => {
        const endpoint = new URL(`/api/agency/portal/cases/${intakeResult.caseId}/submissions`, BASE_URL).toString()
        await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Please help me clarify the next step.')
        const submissionResponse = page.waitForResponse((response) => response.url() === endpoint && response.request().method() === 'POST')
        await page.getByRole('button', { name: 'Send message', exact: true }).click()
        const response = await submissionResponse
        const original = response.request().postDataJSON() as { eventId: string; text: string }
        expect(response.status(), 'Client submission should be persisted').toBe(201)
        const result = await response.json() as { replayed: boolean; item: { submissionId: string; original: unknown; workflow: unknown; disposition: unknown } }
        if (provider) {
          await drainIntegrationQueue('workflow-invoke-agent')
          await expect.poll(async () => {
            const saved = await page.request.get(endpoint)
            const body = await saved.json() as { items: Array<{ submissionId: string; workflow: unknown; disposition: unknown }> }
            return body.items.find((item) => item.submissionId === result.item.submissionId)
          }, { timeout: 30_000 }).toMatchObject({ workflow: { status: 'PAUSED', currentStep: 'client_reply' }, disposition: { kind: 'clarify', source: 'native_agent' } })
        }
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
        expect(await submissions.json()).toMatchObject({ items: [{
          submissionId: result.item.submissionId,
          workflow: { status: 'COMPLETED', currentStep: 'reply_received' },
        }] })
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

      await runDemoPhase('Review the saved brief', 'Exact brief response received once', async () => {
        briefReview = await createBriefReviewFixture({
          caseId: intakeResult.caseId, tenantId, organizationId, userId: provisioningUserId,
          customerEntityId: customerEntityId!, customerUserId: customerUserId!,
        })
        await page.goto(new URL(`/${intakeIdentity.orgSlug}/portal/tasks/${briefReview.taskId}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
        await expect(page.getByTitle('Brief — version 1.0', { exact: true }).contentFrame()
          .getByRole('heading', { name: 'Demo brief ready for your review' })).toBeVisible()
        await capture('brief-review')
        const received = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency/cases/${intakeResult.caseId}/requests` && response.request().method() === 'POST')
        await page.getByRole('button', { name: 'Accept', exact: true }).click()
        const response = await received
        expect(response.status(), await response.text()).toBe(201)
        const receipt = await response.json() as { requestId: string; status: string }
        expect(receipt.status).toBe('response_received')
        await expect(page.getByText('Your decision has been sent and is awaiting processing.')).toBeVisible()
        const replay = await page.request.post(response.url(), { data: response.request().postDataJSON() })
        expect(replay.status()).toBe(200)
        expect(await replay.json()).toMatchObject({ requestId: receipt.requestId, replayed: true })
        const original = await withClient(async (client) => client.query<{ original: { reviewResponse: { versionId: string; documentId: string; kind: string } } }>(
          'SELECT original FROM agency_client_submissions WHERE id=$1 AND case_id=$2 AND tenant_id=$3 AND organization_id=$4',
          [receipt.requestId, intakeResult.caseId, tenantId, organizationId],
        ))
        expect(original.rows[0].original.reviewResponse).toMatchObject({ versionId: briefReview.versionId, documentId: briefReview.documentId, kind: 'approval' })
        await capture('brief-response-received')
      })

      if (provider) {
        await runDemoPhase('Approve plan and choose a topic', 'Exact plan choice compiled into a saved post instruction', async () => {
          planReview = await createPlanReviewFixture({ brief: briefReview!, userId: provisioningUserId, customerUserId: customerUserId! })
          provider.allowPlanApproval({ documentId: planReview.documentId, versionId: planReview.versionId,
            taskId: planReview.taskId, selectedTopicId: planReview.selectedTopicId })
          await page.goto(new URL(`/${intakeIdentity.orgSlug}/portal/tasks/${planReview.taskId}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
          await expect(page.getByRole('heading', { name: 'Review your content plan', exact: true })).toBeVisible()
          expect(planReview.selectedTopicId).not.toBe(planReview.recommendedTopicId)
          await page.getByRole('checkbox', { name: 'I approve this exact plan version', exact: true }).check()
          await page.locator('[data-crud-field-id="selectedTopicId"]').getByRole('combobox').click()
          await page.getByRole('option', { name: new RegExp(`\\(${planReview.selectedTopicId}\\)$`) }).click()
          await capture('plan-explicit-topic-choice')
          const endpoint = `/api/agency/plan-reviews/${planReview.taskId}`
          const received = page.waitForResponse((response) => new URL(response.url()).pathname === endpoint && response.request().method() === 'POST')
          await page.getByRole('button', { name: 'Send response', exact: true }).click()
          const response = await received
          expect(response.ok(), await response.text()).toBeTruthy()
          const receipt = await response.json() as { requestId: string; status: string }
          expect(receipt.status).toBe('response_received')
          planSubmissionId = receipt.requestId
          if (nativePost) provider.allowPostProduction({ caseId: intakeResult.caseId, planVersion: planReview.version,
            selectedTopicId: planReview.selectedTopicId, selectionSubmissionId: receipt.requestId })
          await drainIntegrationQueue('workflow-invoke-agent')
          const plan = planReview
          await expect.poll(async () => withClient(async (client) => {
            const rows = await client.query<{ status: string; summary: { result?: unknown } }>(
              "SELECT status,summary FROM agency_research_task_runs WHERE tenant_id=$1 AND organization_id=$2 AND order_ref=$3 AND step_id='6.7' ORDER BY created_at DESC LIMIT 1",
              [tenantId, organizationId, intakeResult.caseId])
            return rows.rows[0]
          }), { timeout: 30_000 }).toMatchObject({ status: 'done', summary: { result: {
            status: 'ready', planVersionId: plan.versionId, selectedTopicId: plan.selectedTopicId, selectionSubmissionId: receipt.requestId,
          } } })
          const saved = await withClient(async (client) => {
            const approved = await client.query<{ approval_records: unknown[] }>(
              'SELECT approval_records FROM agency_research_document_versions WHERE id=$1 AND tenant_id=$2 AND organization_id=$3 AND order_ref=$4',
              [plan.versionId, tenantId, organizationId, intakeResult.caseId])
            const instruction = await client.query<{ id: string; data: unknown; input_versions: unknown[]; simulation_flag: boolean; approval_records: unknown[] }>(
              "SELECT id,data,input_versions,simulation_flag,approval_records FROM agency_research_document_versions WHERE tenant_id=$1 AND organization_id=$2 AND order_ref=$3 AND template_id='WZR-ZLECENIE-POSTU' ORDER BY version_no DESC LIMIT 1",
              [tenantId, organizationId, intakeResult.caseId])
            return { approved: approved.rows[0], instruction: instruction.rows[0] }
          })
          expect(saved.approved.approval_records).toEqual(expect.arrayContaining([expect.objectContaining({
            documentVersionId: plan.versionId, selectedTopicId: plan.selectedTopicId, approvePlan: true,
            source: expect.objectContaining({ submissionId: receipt.requestId, invitationTaskId: plan.taskId }),
          })]))
          expect(saved.instruction).toMatchObject({ data: { selected_item: { topic_id: plan.selectedTopicId } }, simulation_flag: false, approval_records: [] })
          expect(saved.instruction.input_versions).toEqual(expect.arrayContaining([
            expect.objectContaining({ document_id: `KLI-PLAN@${intakeResult.caseId}`, version: plan.version }),
          ]))
          expect(provider.calls.filter((call) => call.disposition === 'approve')).toHaveLength(1)
          postInstruction = { instructionVersionId: saved.instruction.id, selectionSubmissionId: receipt.requestId }
          await capture('plan-response-compiled')
        })
        if (nativePost) await runDemoPhase('Ask about a native post QA exception', 'Exact-post answer received; native employee exception remains open', async () => {
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
          await loginEmployee(page, employeeEmail, employeePassword, capture)
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
        await runDemoPhase('Review post content', 'Exact post content accepted without publication permission', async () => {
          if (nativePost) console.log('[TC-AGENCY-001] Separate successful producer fixture follows; the employee answer did not resolve or resume the native exception')
          const post = await createPostReviewFixture({ plan: planReview!, ...postInstruction!, process: nativeProcess!, userId: provisioningUserId })
          provider.allowPostApproval(post)
          const taskUrl = new URL(`/${intakeIdentity.orgSlug}/portal/tasks/${post.taskId}`, BASE_URL).toString()
          await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
          await expect(page.getByRole('heading', { name: 'Review your post', exact: true })).toBeVisible()
          await expect(page.getByText('Content approval applies only to this version. It does not authorize publication.', { exact: true })).toBeVisible()
          await page.getByRole('checkbox', { name: 'I approve the content of this exact post version', exact: true }).check()
          await capture('post-content-review')
          const endpoint = `/api/agency/post-reviews/${post.taskId}`
          const received = page.waitForResponse((response) => new URL(response.url()).pathname === endpoint && response.request().method() === 'POST')
          await page.getByRole('button', { name: 'Send response', exact: true }).click()
          const response = await received
          expect(response.ok(), await response.text()).toBeTruthy()
          const receipt = await response.json() as { requestId: string; status: string }
          expect(receipt.status).toBe('response_received')
          await drainIntegrationQueue('workflow-invoke-agent')
          const accepted = () => withClient(async (client) => {
            const row = await client.query<{ status: string; approval_records: unknown[]; data: unknown }>(
              'SELECT status,approval_records,data FROM agency_research_document_versions WHERE id=$1 AND tenant_id=$2 AND organization_id=$3 AND order_ref=$4',
              [post.versionId, tenantId, organizationId, intakeResult.caseId])
            return row.rows[0]
          })
          await expect.poll(accepted, { timeout: 30_000 }).toMatchObject({ status: 'approved', approval_records: [expect.objectContaining({
            scope: 'post_content', documentId: post.documentId, documentVersionId: post.versionId, version: post.version,
            person: customerUserId, qaTaskRunId: post.qaTaskRunId,
            source: expect.objectContaining({ kind: 'agency_post_acceptance', submissionId: receipt.requestId, invitationTaskId: post.taskId }),
          })] })
          expect((await accepted()).data).toMatchObject({ target: { publication_allowed: false, publication_status: 'not_requested', target_account_id: null }, qa: { publication_gate: 'blocked' } })
          const readPreparation = () => withClient(async (client) => {
            const rows = await client.query<{ result: unknown }>(
              `SELECT w.context->'agencyPublicationPreparation'->'result' AS result
               FROM workflow_instances w JOIN agency_client_submissions s ON s.workflow_instance_id=w.id
               WHERE s.id=$1 AND s.case_id=$2 AND s.tenant_id=$3 AND s.organization_id=$4
                 AND w.tenant_id=$3 AND w.organization_id=$4`,
              [receipt.requestId, intakeResult.caseId, tenantId, organizationId])
            return rows.rows[0]?.result
          })
          await expect.poll(readPreparation, { timeout: 30_000 }).toMatchObject({ status: 'prepared',
            orderRef: intakeResult.caseId, postVersionId: post.versionId, acceptanceSubmissionId: receipt.requestId,
            contentHash: post.contentHash, contentApproval: 'valid', publicationConsent: 'missing', canSend: false })
          const preparation = publicationPreparationPreparedSchema.parse(await readPreparation())
          publicationPreparation = preparation
          const publication = await withClient(async (client) => {
            const rows = await client.query<{ id: string; template_id: string; data: unknown; input_versions: unknown[] }>(
              'SELECT id,template_id,data,input_versions FROM agency_research_document_versions WHERE id=ANY($1::uuid[]) AND tenant_id=$2 AND organization_id=$3 AND order_ref=$4',
              [[preparation.instructionVersionId, preparation.configVersionId], tenantId, organizationId, intakeResult.caseId])
            const confirmations = await client.query<{ count: string }>(
              "SELECT count(*) FROM agency_research_document_versions WHERE tenant_id=$1 AND organization_id=$2 AND order_ref=$3 AND template_id='WZR-POTWIERDZENIE-PUBLIKACJI'",
              [tenantId, organizationId, intakeResult.caseId])
            return { rows: rows.rows, confirmations: Number(confirmations.rows[0].count) }
          })
          const instruction = publication.rows.find((row) => row.id === preparation.instructionVersionId)!
          expect(instruction).toMatchObject({ template_id: 'WZR-ZLECENIE-PUBLIKACJI', data: {
            post_ref: { document_ref: `KLI-POST@${intakeResult.caseId}`, content_version: post.version, content_hash: post.contentHash },
            payload: { text: post.text }, content_approval_check: { state: 'valid', checked_content_version: post.version },
            publication_consent_check: { state: 'missing', consent_ref_or_null: null },
            execution_guard: { reservation_state: 'none', attempt_refs: [], prior_outcome: 'none' },
            preflight: { state: 'not_ready' },
          } })
          expect(instruction.input_versions).toEqual(expect.arrayContaining([expect.objectContaining({
            document_id: `KLI-POST@${intakeResult.caseId}`, version: post.version, status: 'approved',
          })]))
          expect(publication.rows.find((row) => row.id === preparation.configVersionId)?.template_id).toBe('WZR-KONFIG-PUBLIKACJI')
          expect(publication.confirmations).toBe(0)
          console.log('[TC-AGENCY-001] Publication instruction prepared from accepted content; consent missing, no send or reservation')
          await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
          await expect(page.getByText(`Acceptance recorded for version ${post.version}.`, { exact: true })).toBeVisible()
          expect(provider.calls.filter((call) => call.disposition === 'approve')).toHaveLength(2)
          await capture('post-content-acceptance-recorded')
        })
      }

      await runDemoPhase('Sign in employee', 'Employee signed in', async () => {
        if (!employeeSignedIn) await loginEmployee(page, employeeEmail, employeePassword, capture)
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
        if (publicationPreparation) {
          const response = await page.request.get(new URL(`/api/agency_operations/cases/${intakeResult.caseId}`, BASE_URL).toString())
          expect(response.ok(), 'Employee case projection should expose publication preparation').toBeTruthy()
          const projection = await response.json() as { submissions: Array<{ submissionId: string; publicationPreparation?: unknown }> }
          expect(projection.submissions.find((submission) => submission.submissionId === publicationPreparation!.acceptanceSubmissionId)?.publicationPreparation)
            .toMatchObject({ status: 'prepared', instructionVersionId: publicationPreparation.instructionVersionId,
              contentApproval: 'valid', publicationConsent: 'missing', canSend: false })
          await expect(page.getByRole('heading', { name: 'Publication preparation', level: 3, exact: true })).toBeVisible()
          await expect(page.getByText('Preparation does not authorize sending. Missing destination, access and publication consent remain explicit.', { exact: true })).toBeVisible()
        }
        if (briefReview) {
          await expect(page.getByText('Persisted research work', { exact: true })).toBeVisible()
          await page.getByRole('button', { name: briefReview.versionId, exact: true }).first().click()
          await expect(page.getByText('Stored version, dependencies and quality evidence', { exact: true })).toBeVisible()
        }
        await capture('employee-case')
      })

      await runDemoPhase('Retrieve material', 'Material retrieved', async () => {
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
        expect(Buffer.concat(materialChunks)).toEqual(sentinel)
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
