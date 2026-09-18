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
import {
  getTokenContext,
} from '@open-mercato/core/helpers/integration/generalFixtures'
import { pollWorkflowInstance } from '@open-mercato/core/helpers/integration/workflowsFixtures'
import {
  CLIENT_MATERIAL_INTAKE_SERVICE,
  type ClientMaterialIntakeService,
} from '../lib/contracts'
import {
  AGENCY_AGENT_FUNCTION_NAME,
  AGENCY_AGENT_RESULT_CONTEXT_KEY,
  AGENCY_AGENT_WORKER_ID,
  AGENCY_CASE_WORKFLOW_ID,
} from '../workflows'

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
const CASE_ENTITY_ID = 'agency_operations:agency_case'
const PRIVATE_PARTITION_CODE = 'privateAttachments'
const EMPLOYEE_FEATURES = [
  'agency_operations.cases.view',
  'workflows.instances.view',
]

type AgencyCaseRow = {
  id: string
  tenant_id: string
  organization_id: string
  customer_entity_id: string
  submitted_by_customer_user_id: string
  title: string
  agent_worker_id: string
  material_attachment_id: string
  material_file_name: string
  material_mime_type: string
  material_file_size: number
  workflow_instance_id: string
}

type AttachmentRow = {
  id: string
  entity_id: string
  record_id: string
  tenant_id: string
  organization_id: string
  partition_code: string
  file_name: string
  mime_type: string
  file_size: number
  is_public: boolean
}

type WorkflowInstanceRow = {
  id: string
  workflow_id: string
  status: string
  current_step_id: string
  tenant_id: string
  organization_id: string
  context: unknown
  metadata: unknown
}

type StepInstanceRow = {
  step_id: string
  status: string
}

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

async function submitThroughProductionIntake(input: Parameters<ClientMaterialIntakeService['submitMaterial']>[0]) {
  await ensureTargetAppBootstrap()
  const container = await createRequestContainer()
  const intake = container.resolve<ClientMaterialIntakeService>(CLIENT_MATERIAL_INTAKE_SERVICE)
  return intake.submitMaterial(input)
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  expect(value, label).not.toBeNull()
  expect(typeof value, label).toBe('object')
  expect(Array.isArray(value), label).toBe(false)
  return value as Record<string, unknown>
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
  test('agency operations vertical slice persists intake, deterministic work, and employee evidence', async ({
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
      customerEntityId = await createCustomerCompanyFixture(
        request,
        adminToken,
        `Agency proof client ${suffix}`,
      )
      const customerUser = await createCustomerUserFixture(request, adminToken, {
        customerEntityId,
        displayName: `Agency proof customer ${suffix}`,
      })
      customerUserId = customerUser.id

      const intakeResult = await submitThroughProductionIntake({
        identity: {
          tenantId,
          organizationId,
          customerEntityId,
          customerUserId,
        },
        title,
        file: {
          buffer: sentinel,
          fileName,
          mimeType,
        },
      })
      resources = {
        caseId: intakeResult.caseId,
        attachmentId: null,
        workflowInstanceId: intakeResult.workflowInstanceId,
      }

      expect(intakeResult.status).toBe('COMPLETED')

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

      const databaseEvidence = await withClient(async (client) => {
        const agencyCase = await client.query<AgencyCaseRow>(
          `SELECT id, tenant_id, organization_id, customer_entity_id,
                  submitted_by_customer_user_id, title, agent_worker_id,
                  material_attachment_id, material_file_name, material_mime_type,
                  material_file_size, workflow_instance_id
           FROM agency_cases
           WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
          [intakeResult.caseId, tenantId, organizationId],
        )
        const attachment = await client.query<AttachmentRow>(
          `SELECT a.id, a.entity_id, a.record_id, a.tenant_id, a.organization_id,
                  a.partition_code, a.file_name, a.mime_type, a.file_size, p.is_public
           FROM attachments a
           INNER JOIN attachment_partitions p ON p.code = a.partition_code
           WHERE a.entity_id = $1 AND a.record_id = $2
             AND a.tenant_id = $3 AND a.organization_id = $4`,
          [CASE_ENTITY_ID, intakeResult.caseId, tenantId, organizationId],
        )
        const workflow = await client.query<WorkflowInstanceRow>(
          `SELECT id, workflow_id, status, current_step_id, tenant_id, organization_id,
                  context, metadata
           FROM workflow_instances
           WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
          [intakeResult.workflowInstanceId, tenantId, organizationId],
        )
        const workerSteps = await client.query<StepInstanceRow>(
          `SELECT step_id, status
           FROM step_instances
           WHERE workflow_instance_id = $1 AND tenant_id = $2 AND organization_id = $3
             AND step_id = 'agent_worker'`,
          [intakeResult.workflowInstanceId, tenantId, organizationId],
        )
        const workflowEvents = await client.query<{ event_count: string }>(
          `SELECT count(*)::text AS event_count
           FROM workflow_events
           WHERE workflow_instance_id = $1 AND tenant_id = $2 AND organization_id = $3`,
          [intakeResult.workflowInstanceId, tenantId, organizationId],
        )
        return {
          agencyCase: agencyCase.rows[0],
          attachment: attachment.rows[0],
          workflow: workflow.rows[0],
          workerSteps: workerSteps.rows,
          eventCount: Number(workflowEvents.rows[0]?.event_count ?? 0),
        }
      })
      resources.attachmentId = databaseEvidence.attachment?.id ?? null
      expect(resources.attachmentId).toBeTruthy()

      expect(databaseEvidence.agencyCase).toMatchObject({
        id: intakeResult.caseId,
        tenant_id: tenantId,
        organization_id: organizationId,
        customer_entity_id: customerEntityId,
        submitted_by_customer_user_id: customerUserId,
        title,
        agent_worker_id: AGENCY_AGENT_WORKER_ID,
        material_attachment_id: resources.attachmentId,
        material_file_name: fileName,
        material_mime_type: mimeType,
        material_file_size: sentinel.length,
        workflow_instance_id: intakeResult.workflowInstanceId,
      })
      expect(databaseEvidence.attachment).toMatchObject({
        id: resources.attachmentId,
        entity_id: CASE_ENTITY_ID,
        record_id: intakeResult.caseId,
        tenant_id: tenantId,
        organization_id: organizationId,
        partition_code: PRIVATE_PARTITION_CODE,
        file_name: fileName,
        mime_type: mimeType,
        file_size: sentinel.length,
        is_public: false,
      })
      expect(databaseEvidence.workflow).toMatchObject({
        id: intakeResult.workflowInstanceId,
        workflow_id: AGENCY_CASE_WORKFLOW_ID,
        status: 'COMPLETED',
        current_step_id: 'end',
        tenant_id: tenantId,
        organization_id: organizationId,
      })
      expect(databaseEvidence.workerSteps).toContainEqual({
        step_id: 'agent_worker',
        status: 'COMPLETED',
      })
      expect(databaseEvidence.eventCount).toBeGreaterThan(0)

      const workflowMetadata = readRecord(databaseEvidence.workflow.metadata, 'workflow metadata')
      expect(workflowMetadata).toMatchObject({
        entityType: CASE_ENTITY_ID,
        entityId: intakeResult.caseId,
        labels: { agentWorkerId: AGENCY_AGENT_WORKER_ID },
      })
      const workflowContext = readRecord(databaseEvidence.workflow.context, 'workflow context')
      const workerEnvelope = readRecord(
        workflowContext[AGENCY_AGENT_RESULT_CONTEXT_KEY],
        'agent worker result envelope',
      )
      expect(workerEnvelope).toMatchObject({
        executed: true,
        functionName: AGENCY_AGENT_FUNCTION_NAME,
      })
      const workerResult = readRecord(workerEnvelope.result, 'agent worker result')
      expect(workerResult).toMatchObject({
        kind: 'no_op',
        unchanged: true,
        input: {
          caseId: intakeResult.caseId,
          tenantId,
          organizationId,
          customerEntityId,
          submittedByCustomerUserId: customerUserId,
          title,
          agentWorkerId: AGENCY_AGENT_WORKER_ID,
          materialFileName: fileName,
          materialMimeType: mimeType,
          materialFileSize: sentinel.length,
        },
      })

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

      await loginEmployee(page, employeeEmail, employeePassword)
      await page.goto('/backend/agency-operations/cases', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Agency cases', exact: true })).toBeVisible()
      const caseLink = page.getByRole('link', { name: title, exact: true })
      await expect(caseLink).toBeVisible()
      await caseLink.click()
      await expect(page).toHaveURL(
        new RegExp(`/backend/agency-operations/cases/${intakeResult.caseId}$`),
      )
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByText(fileName, { exact: true })).toBeVisible()
      await expect(page.getByText(AGENCY_AGENT_WORKER_ID, { exact: true })).toBeVisible()
      await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('"no_op"', { exact: true })).toBeVisible()

      const materialPath = `/api/agency_operations/cases/${intakeResult.caseId}/material`
      const materialLink = page.getByRole('link', { name: 'Open material', exact: true })
      await expect(materialLink).toHaveAttribute('href', materialPath)
      const employeeMaterialResponse = await page.request.get(materialPath)
      expect(employeeMaterialResponse.status()).toBe(200)
      expect(employeeMaterialResponse.headers()['cache-control']).toContain('no-store')
      expect(await employeeMaterialResponse.body()).toEqual(sentinel)

      const workflowLink = page.getByRole('link', { name: 'Open workflow run', exact: true })
      await expect(workflowLink).toHaveAttribute(
        'href',
        `/backend/instances/${intakeResult.workflowInstanceId}`,
      )
      await workflowLink.click()
      await expect(page).toHaveURL(
        new RegExp(`/backend/instances/${intakeResult.workflowInstanceId}$`),
      )
      await expect(page.getByText(AGENCY_CASE_WORKFLOW_ID, { exact: true }).first()).toBeVisible()
      await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible()
    } finally {
      if (!resources.caseId || !resources.attachmentId || !resources.workflowInstanceId) {
        resources = await readCaseResourcesByTitle(title, tenantId, organizationId).catch(() => resources)
      }
      await deleteAttachmentIfExists(request, adminToken, resources.attachmentId)
      await deleteCreatedDatabaseRows(resources, tenantId, organizationId)
      await deleteCustomerUserFixture(request, adminToken, customerUserId)
      await deleteCustomerCompanyFixture(request, adminToken, customerEntityId)
      await deleteUserIfExists(request, adminToken, employeeUserId)
      await deleteRoleIfExists(request, adminToken, employeeRoleId)
    }
  })
})
