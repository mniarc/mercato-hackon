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
  createCustomerUserFixture,
  deleteCustomerCompanyFixture,
  deleteCustomerUserFixture,
  portalLogin,
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'
import { findInstanceUserTask, pollWorkflowInstance } from '@open-mercato/core/helpers/integration/workflowsFixtures'
import { drainIntegrationQueue } from '@open-mercato/core/helpers/integration/queue'
import { workflowDefinitionDataSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { nativeClientSubmissionDefinition, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../agents/client-triage/workflow'
import { startNativeTriageProvider } from './support/nativeTriageProvider'
import { deleteNativeTriageFixtures } from './support/nativeTriageCleanup'

export const integrationMeta = {
  dependsOnModules: [
    'agency_operations',
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
       AND (id = $3 OR correlation_key = $4 OR id IN (
         SELECT workflow_instance_id FROM agency_client_submissions
         WHERE tenant_id = $1 AND organization_id = $2 AND case_id = $5
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

test.describe('TC-AGENCY-001: real agency operations vertical slice', () => {
  test('trusted intake becomes a completed employee-visible case with retrievable material', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000)

    let screenshotSequence = 0
    const capture = async (label: string) => {
      screenshotSequence += 1
      await captureDemoScreenshot(page, testInfo, screenshotSequence, label)
    }

    const adminToken = await getAuthToken(request, 'admin')
    const { tenantId, organizationId } = getTokenContext(adminToken)
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const title = `Agency proof ${suffix}`
    const fileName = `client-material-${suffix}.txt`
    const mimeType = 'text/plain'
    const sentinel = Buffer.from(`agency-operations-sentinel:${suffix}`, 'utf8')
    const employeeEmail = `agency-employee-${suffix}@test.local`
    const employeePassword = `AgencyProof-${suffix}!9a`

    let customerEntityId: string | null = null
    let customerUserId: string | null = null
    let employeeRoleId: string | null = null
    let employeeUserId: string | null = null
    const provider = process.env.AGENCY_TEST_NATIVE_TRIAGE === '1' ? await startNativeTriageProvider() : null
    let nativeRecovery: { workflowInstanceId: string; submissionId: string } | null = null
    let resources: CreatedResources = {
      caseId: null,
      attachmentId: null,
      workflowInstanceId: null,
    }

    try {
      if (provider) {
        await runDemoPhase('Check native triage configuration', 'Native triage ready with local intelligence only', async () => {
          expect(process.env.OPENROUTER_BASE_URL).toBe(provider.baseUrl)
          type NativeDefinition = {
            workflowId: string; version: number; tenantId: string | null; organizationId: string | null
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
        const customerUser = await createCustomerUserFixture(request, adminToken, {
          customerEntityId: createdCustomerEntityId,
          displayName: `Agency proof customer ${suffix}`,
        })
        customerUserId = customerUser.id
        employeeRoleId = await createRoleFixture(request, adminToken, {
          name: `Agency proof employee ${suffix}`,
          tenantId,
        })
        await setRoleAclFeatures(request, adminToken, {
          roleId: employeeRoleId,
          features: EMPLOYEE_FEATURES,
          organizations: [organizationId],
        })
        employeeUserId = await createUserFixture(request, adminToken, {
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

      await runDemoPhase('Sign in employee', 'Employee signed in', async () => {
        await loginEmployee(page, employeeEmail, employeePassword, capture)
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
          expect(provider.calls).toHaveLength(3)
          const duplicate = await page.request.post(new URL(`/api/workflows/tasks/${task!.id}/complete`, BASE_URL).toString(), { data: { decisionId: 'obstacle_resolved', formData: { triageRecoveryReason: 'Repeated', triageRecoveryEvidence: 'Repeated' } } })
          expect(duplicate.ok()).toBe(false)
          const runs = await withClient(async (client) => client.query<{ status: string }>(
            'SELECT status FROM agent_runs WHERE workflow_instance_id=$1 AND tenant_id=$2 AND organization_id=$3 ORDER BY created_at',
            [nativeRecovery!.workflowInstanceId, tenantId, organizationId],
          ))
          expect(runs.rows.map((run) => run.status)).toEqual(['error', 'ok'])
          expect(provider.calls).toHaveLength(3)
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
    } finally {
      try { await runDemoPhase('Clean up fixtures', 'Cleanup complete', async () => {
        if (!resources.caseId || !resources.attachmentId || !resources.workflowInstanceId) {
          resources = await readCaseResourcesByTitle(title, tenantId, organizationId).catch(
            () => resources,
          )
        }
        await deleteAttachmentIfExists(request, adminToken, resources.attachmentId)
        await deleteCreatedDatabaseRows(resources, tenantId, organizationId)
        await deleteCustomerUserFixture(request, adminToken, customerUserId)
        await deleteCustomerCompanyFixture(request, adminToken, customerEntityId)
        await deleteUserIfExists(request, adminToken, employeeUserId)
        await deleteRoleIfExists(request, adminToken, employeeRoleId)
      }) } finally { await provider?.close() }
    }
  })
})
