import type { APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { deleteAttachmentIfExists } from '@open-mercato/core/helpers/integration/attachmentsFixtures'

export type JourneyScope = { tenantId: string; organizationId: string; customerEntityId: string }
export async function readInvitation(scope: JourneyScope, caseId: string, workflowId: string) {
  return withClient(async (client) => {
    const result = await client.query<{ task_id: string; context: Record<string, unknown> }>(
      `SELECT t.id AS task_id,w.context FROM workflow_instances w JOIN user_tasks t ON t.workflow_instance_id=w.id
       AND t.tenant_id=w.tenant_id AND t.organization_id=w.organization_id
       WHERE w.tenant_id=$1 AND w.organization_id=$2 AND w.workflow_id=$3
       AND w.metadata->>'entityType'='agency_operations:agency_case' AND w.metadata->>'entityId'=$4
       AND t.status='PENDING' ORDER BY t.created_at DESC LIMIT 1`,
      [scope.tenantId, scope.organizationId, workflowId, caseId])
    if (!result.rows[0]) {
      const diagnostics = await client.query<{ id: string }>(`SELECT id,workflow_id,status,current_step_id,error_message,error_details,context FROM workflow_instances
        WHERE tenant_id=$1 AND organization_id=$2 AND (metadata->>'entityId'=$3 OR id IN
        (SELECT workflow_instance_id FROM agency_client_submissions WHERE tenant_id=$1 AND organization_id=$2 AND case_id=$3::uuid))`,
      [scope.tenantId, scope.organizationId, caseId])
      const failures = await client.query(`SELECT workflow_instance_id,event_type,event_data FROM workflow_events
        WHERE workflow_instance_id=ANY($1::uuid[]) AND tenant_id=$2 AND organization_id=$3
        AND event_type IN ('ACTIVITY_FAILED','WORKFLOW_FAILED','STEP_FAILED') ORDER BY occurred_at DESC LIMIT 5`,
      [diagnostics.rows.map((row) => row.id), scope.tenantId, scope.organizationId])
      // Capture the native cause in the test artifact before scoped cleanup removes it.
      throw new Error(`Missing customer invitation ${workflowId}: ${JSON.stringify({ workflows: diagnostics.rows, failures: failures.rows })}`)
    }
    return { taskId: result.rows[0].task_id, context: result.rows[0].context }
  })
}

export async function assertLoopbackOverrides(scope: Pick<JourneyScope, 'tenantId' | 'organizationId'>, baseUrl: string) {
  await withClient(async (client) => {
    const result = await client.query<{ count: string }>(`SELECT count(*) FROM ai_agent_runtime_overrides
      WHERE tenant_id=$1 AND deleted_at IS NULL AND (organization_id IS NULL OR organization_id=$2)
      AND (agent_id IS NULL OR agent_id LIKE 'agency_research.%' OR agent_id='agency_operations.client_triage')
      AND NULLIF(btrim(base_url),'') IS NOT NULL AND btrim(base_url)<>$3`, [scope.tenantId, scope.organizationId, baseUrl])
    if (Number(result.rows[0].count)) throw new Error('Production journey refuses non-loopback research/triage overrides')
  })
}

export async function deleteProductionJourneyRecords(request: APIRequestContext, token: string, scope: JourneyScope) {
  const cases = await withClient(async (client) => (await client.query<{ id: string; material_attachment_id: string; workflow_instance_id: string }>(
    'SELECT id,material_attachment_id,workflow_instance_id FROM agency_cases WHERE tenant_id=$1 AND organization_id=$2 AND customer_entity_id=$3',
    [scope.tenantId, scope.organizationId, scope.customerEntityId])).rows)
  for (const item of cases) {
    await deleteAttachmentIfExists(request, token, item.material_attachment_id)
    await withClient(async (client) => {
      const workflows = await client.query<{ id: string }>(`SELECT id FROM workflow_instances WHERE tenant_id=$1 AND organization_id=$2
        AND (id=$3 OR (metadata->>'entityType'='agency_operations:agency_case' AND metadata->>'entityId'=$4) OR id IN
        (SELECT workflow_instance_id FROM agency_client_submissions WHERE tenant_id=$1 AND organization_id=$2 AND case_id=$4::uuid))`,
      [scope.tenantId, scope.organizationId, item.workflow_instance_id, item.id])
      const ids = workflows.rows.map((row) => row.id)
      const parameters = [ids, scope.tenantId, scope.organizationId]
      const runs = await client.query<{ id: string }>('SELECT id FROM agent_runs WHERE workflow_instance_id=ANY($1::uuid[]) AND tenant_id=$2 AND organization_id=$3', parameters)
      const runParameters = [runs.rows.map((row) => row.id), scope.tenantId, scope.organizationId]
      for (const table of ['agent_tool_calls', 'agent_spans', 'agent_eval_results', 'agent_guardrail_checks', 'agent_context_bundles']) {
        await client.query(`DELETE FROM ${table} WHERE agent_run_id=ANY($1::uuid[]) AND tenant_id=$2 AND organization_id=$3`, runParameters)
      }
      await client.query('DELETE FROM agent_runs WHERE id=ANY($1::uuid[]) AND tenant_id=$2 AND organization_id=$3', runParameters)
      for (const table of ['process_instances', 'workflow_events', 'user_tasks', 'step_instances', 'workflow_branch_instances']) {
        await client.query(`DELETE FROM ${table} WHERE workflow_instance_id=ANY($1::uuid[]) AND tenant_id=$2 AND organization_id=$3`, parameters)
      }
      await client.query('DELETE FROM workflow_instances WHERE id=ANY($1::uuid[]) AND tenant_id=$2 AND organization_id=$3', parameters)
      for (const table of ['agency_research_document_versions', 'agency_research_task_runs', 'agency_research_sources', 'agency_research_documents']) {
        await client.query(`DELETE FROM ${table} WHERE order_ref=$1 AND tenant_id=$2 AND organization_id=$3`, [item.id, scope.tenantId, scope.organizationId])
      }
      for (const table of ['agency_client_replies', 'agency_client_submissions']) {
        await client.query(`DELETE FROM ${table} WHERE case_id=$1 AND tenant_id=$2 AND organization_id=$3`, [item.id, scope.tenantId, scope.organizationId])
      }
      await client.query('DELETE FROM agency_cases WHERE id=$1 AND tenant_id=$2 AND organization_id=$3', [item.id, scope.tenantId, scope.organizationId])
    })
  }
}
