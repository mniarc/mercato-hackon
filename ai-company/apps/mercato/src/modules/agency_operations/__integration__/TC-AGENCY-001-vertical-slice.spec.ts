import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
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
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'
import { pollWorkflowInstance } from '@open-mercato/core/helpers/integration/workflowsFixtures'
import {
  CLIENT_MATERIAL_INTAKE_SERVICE,
  type ClientMaterialIntakeService,
} from '../lib/contracts'

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

const APP_ROOT = path.resolve(
  process.env.OM_TEST_APP_ROOT?.trim() || path.resolve(process.cwd(), 'apps/mercato'),
)
const EMPLOYEE_FEATURES = [
  'agency_operations.cases.view',
  'workflows.instances.view',
]

type CreatedResources = {
  caseId: string | null
  attachmentId: string | null
  workflowInstanceId: string | null
}

let bootstrapPromise: Promise<void> | null = null

async function ensureTargetAppBootstrap(): Promise<void> {
  bootstrapPromise ??= bootstrapFromAppRoot(APP_ROOT).then(() => undefined)
  await bootstrapPromise
}

async function submitThroughProductionIntake(
  input: Parameters<ClientMaterialIntakeService['submitMaterial']>[0],
) {
  await ensureTargetAppBootstrap()
  const container = await createRequestContainer()
  const intake = container.resolve<ClientMaterialIntakeService>(CLIENT_MATERIAL_INTAKE_SERVICE)
  return intake.submitMaterial(input)
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
    if (resources.workflowInstanceId) {
      const scopedWorkflowParams = [resources.workflowInstanceId, tenantId, organizationId]
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
        [resources.workflowInstanceId, tenantId, organizationId],
      )
    }
    if (resources.caseId) {
      await client.query(
        'DELETE FROM agency_cases WHERE id = $1 AND tenant_id = $2 AND organization_id = $3',
        [resources.caseId, tenantId, organizationId],
      )
    }
  })
}

async function loginEmployee(page: Page, email: string, password: string): Promise<void> {
  const baseUrl = process.env.BASE_URL?.trim() || 'http://localhost:3000'
  await page.context().addCookies([
    { name: 'om_demo_notice_ack', value: 'ack', url: baseUrl, sameSite: 'Lax' as const },
    { name: 'om_cookie_notice_ack', value: 'ack', url: baseUrl, sameSite: 'Lax' as const },
    { name: 'om_feedback_suppress', value: '1', url: baseUrl, sameSite: 'Lax' as const },
  ])
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Password', { exact: true }).press('Enter')
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
          roles: [employeeRoleId],
          name: `Agency proof employee ${suffix}`,
        })
        return {
          customerEntityId: createdCustomerEntityId,
          customerUserId: customerUser.id,
        }
      })

      const intakeResult = await runDemoPhase('Store intake', 'Intake stored', async () => {
        const result = await submitThroughProductionIntake({
          identity: {
            tenantId,
            organizationId,
            customerEntityId: intakeIdentity.customerEntityId,
            customerUserId: intakeIdentity.customerUserId,
          },
          title,
          file: {
            buffer: sentinel,
            fileName,
            mimeType,
          },
        })
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

      await runDemoPhase('Sign in employee', 'Employee signed in', async () => {
        await loginEmployee(page, employeeEmail, employeePassword)
      })

      await runDemoPhase('Open employee case', 'Case visible', async () => {
        await page.goto('/backend/agency-operations/cases', { waitUntil: 'domcontentloaded' })
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
