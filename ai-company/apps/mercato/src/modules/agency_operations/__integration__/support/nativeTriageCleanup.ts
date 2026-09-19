import type { IntegrationDbClient } from '@open-mercato/core/helpers/integration/dbFixtures'

export async function deleteNativeTriageFixtures(
  client: IntegrationDbClient,
  workflowInstanceId: string,
  tenantId: string,
  organizationId: string,
): Promise<void> {
  const runs = await client.query<{ id: string }>(
    `SELECT id FROM agent_runs WHERE workflow_instance_id = $1
     AND tenant_id = $2 AND organization_id = $3 AND agent_id = ANY($4::text[])`,
    [workflowInstanceId, tenantId, organizationId, ['agency_operations.client_triage', 'agency_research.post_author', 'agency_research.post_editor']],
  )
  const runIds = runs.rows.map((run) => run.id)
  if (runIds.length) {
    for (const table of ['agent_tool_calls', 'agent_spans', 'agent_eval_results', 'agent_guardrail_checks', 'agent_context_bundles']) {
      await client.query(
        `DELETE FROM ${table} WHERE agent_run_id = ANY($1::uuid[]) AND tenant_id = $2 AND organization_id = $3`,
        [runIds, tenantId, organizationId],
      )
    }
    await client.query(
      'DELETE FROM agent_runs WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND organization_id = $3',
      [runIds, tenantId, organizationId],
    )
  }
  await client.query(
    'DELETE FROM process_instances WHERE workflow_instance_id = $1 AND tenant_id = $2 AND organization_id = $3',
    [workflowInstanceId, tenantId, organizationId],
  )
}
