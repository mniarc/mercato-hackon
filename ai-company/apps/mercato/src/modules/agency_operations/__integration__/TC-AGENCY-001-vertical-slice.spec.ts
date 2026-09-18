import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
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

async function loginEmployee(page: Page, email: string, password: string): Promise<void> {
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

test.describe('TC-AGENCY-001: real agency operations vertical slice', () => {
  test('trusted intake becomes a completed employee-visible case with retrievable material', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)

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
    let resources: CreatedResources = {
      caseId: null,
      attachmentId: null,
      workflowInstanceId: null,
    }

    try {
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
        await page.getByRole('link', { name: 'Send materials', exact: true }).click()
        await expect(page.locator('[data-material-form-ready="1"]')).toBeVisible()
        await page.getByLabel('Title', { exact: true }).fill(title)
        await page.getByLabel('Material file', { exact: true }).setInputFiles({
          name: fileName,
          mimeType,
          buffer: sentinel,
        })
        await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title)
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
        await expect(page.getByRole('status')).toContainText('The requested process is complete')
      })

      await runDemoPhase('Route client submission', 'Clarification saved once', async () => {
        const endpoint = new URL(`/api/agency/portal/cases/${intakeResult.caseId}/submissions`, BASE_URL).toString()
        const original = { eventId: `demo-message-${suffix}`, text: 'Please help me clarify the next step.', scaffoldScenario: 'clarify' }
        const response = await page.request.post(endpoint, { data: original })
        expect(response.status(), 'Client submission should be persisted').toBe(201)
        const result = await response.json() as { replayed: boolean; item: { submissionId: string; original: unknown; workflow: unknown; disposition: unknown } }
        expect(result).toMatchObject({ replayed: false, item: {
          original,
          workflow: { status: 'PAUSED', currentStep: 'client_reply' },
          disposition: { kind: 'clarify', source: 'deterministic_scaffold', effectsApplied: false },
        } })
        const replayResponse = await page.request.post(endpoint, { data: original })
        expect(replayResponse.status()).toBe(200)
        expect(await replayResponse.json()).toMatchObject({ replayed: true, item: { submissionId: result.item.submissionId } })
      })

      await runDemoPhase('Sign in employee', 'Employee signed in', async () => {
        await loginEmployee(page, employeeEmail, employeePassword)
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
      })

      await runDemoPhase('Escalate to employee inbox', 'Human attention completed', async () => {
        await page.getByRole('button', { name: 'Request human attention', exact: true }).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByLabel('Reason', { exact: true }).fill(`Review requested for ${title}`)
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
        await page.goto(new URL(`/backend/tasks/${task!.id}`, BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
        await page.getByTestId('task-claim').click()
        await page.getByRole('button', { name: 'Complete', exact: true }).click()
        const completed = await pollWorkflowInstance(request, adminToken, attention.workflowInstanceId,
          (instance) => instance.status === 'COMPLETED')
        expect(completed?.status).toBe('COMPLETED')
      })
    } finally {
      await runDemoPhase('Clean up fixtures', 'Cleanup complete', async () => {
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
      })
    }
  })
})
