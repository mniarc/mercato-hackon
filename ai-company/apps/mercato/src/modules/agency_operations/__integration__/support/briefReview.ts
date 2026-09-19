import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { briefDataSchema } from '../../../agency_research/data/schemas/brief'
import { configureBriefReviewWorkflow } from '../../lib/briefStrategyProcess/configure'
import { BRIEF_REVIEW_SERVICE, BRIEF_REVIEW_WORKFLOW_ID, type BriefReviewService } from '../../lib/briefStrategyProcess/contracts'

const inputSchema = z.object({
  caseId: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(),
  customerEntityId: z.uuid(), customerUserId: z.uuid(),
  appRoot: z.string().optional(),
})
type FixtureInput = z.infer<typeof inputSchema>
export type BriefReviewFixture = {
  caseId: string; tenantId: string; organizationId: string;
  documentId: string; versionId: string; taskRunId: string;
  workflowInstanceId: string | null; taskId: string | null;
  clientViewMd: string;
}

let bootstrap: Promise<unknown> | undefined

function fixtureBrief() {
  const undecided = { decision_state: 'awaiting_client', decision_ref: null, fact_ids: [] }
  return briefDataSchema.parse({
    priority_offer: { ...undecided, value: 'Demo campaign planning', result_for_audience: 'A clear next step', excluded_from_scope: ['Publication'] },
    priority_audience: { ...undecided, value: 'Agency clients', priority_choice: { segment: 'B2B', target_role: ['Owner'], decision_ref: null, decision_version: null, decision_state: 'awaiting_client' }, buyer_claims: [], secondary_groups: null },
    business_direction: { ...undecided, value: 'Clarify the campaign', from_to: 'From materials to a reviewable proposal', horizon: null, baseline: null, communication_role: 'Explain the offer', not_promised: ['Measured business results'] },
    buyer_reality: [],
    promise_constraints: { capabilities: 'Planning', result_limits: 'Demonstration only', prohibited_claims: ['Guaranteed results'], allowed_proof_ids: [], rights_by_proof: [], fact_ids: [] },
    voice_preferences: { desired_traits: [], unwanted_traits: [], style_preferences: { jargon: null, humor: null, formalness: null }, proposed_examples: [], client_selection: null, decision_version: null, decision_state: 'awaiting_client', sample_ids: [] },
    channel_and_cta: { channel: 'Not selected', audience_context: 'B2B', cta_goal: 'Discuss the proposal', cta_text: null, destination: null, destination_visibility: 'unknown', destination_functionality: 'not_checked', owner: null, required_owner_before_publish: true, draft_readiness: 'conditional', publication_readiness: 'blocked', limits: ['No publication'], fact_ids: [], decision_state: 'awaiting_client' },
    success_and_limits: { directional_goal: 'An agreed next step', measurement_proposals: [], baseline: null, numerical_target: null, scope_limit: 'Review fixture only' },
    assets_and_permissions: [], open_assumptions: [],
  })
}

export async function createBriefReviewFixture(rawInput: FixtureInput): Promise<BriefReviewFixture> {
  const input = inputSchema.parse(rawInput)
  const fixture: BriefReviewFixture = {
    caseId: input.caseId, tenantId: input.tenantId, organizationId: input.organizationId,
    documentId: randomUUID(), versionId: randomUUID(), taskRunId: randomUUID(),
    workflowInstanceId: null, taskId: null,
    clientViewMd: '# Demo brief ready for your review\n\nA saved proposal for agency clients. Please review the campaign direction.\n\nThis is deterministic demonstration content, not a live research result. No publication or approval has occurred.',
  }
  const qa = { verdict: 'ready_for_approval', fixture: true }
  try {
    await withClient(async (client) => {
      await client.query('BEGIN')
      try {
        const ownedCase = await client.query<{ id: string }>(
          `SELECT id FROM agency_cases WHERE id=$1 AND tenant_id=$2 AND organization_id=$3
           AND customer_entity_id=$4 AND submitted_by_customer_user_id=$5 AND deleted_at IS NULL FOR UPDATE`,
          [input.caseId, input.tenantId, input.organizationId, input.customerEntityId, input.customerUserId],
        )
        if (ownedCase.rows.length !== 1) throw new Error('[internal] Brief fixture requires its existing test-owned case and customer')
        await client.query(
          `INSERT INTO agency_research_documents
           (id,tenant_id,organization_id,order_ref,brand,template_id,output_id,status,current_version_id,created_at,updated_at)
           VALUES ($1,$2,$3,$4,'Agency review fixture','WZR-BRIEF','KLI-BRIEF','ready_for_review',$5,now(),now())`,
          [fixture.documentId, input.tenantId, input.organizationId, input.caseId, fixture.versionId],
        )
        await client.query(
          `INSERT INTO agency_research_task_runs
           (id,tenant_id,organization_id,order_ref,brand,step_id,attempt,status,runner,models,input_versions,output_version_id,qa_result,agent_run_ids,created_at,finished_at)
           VALUES ($1,$2,$3,$4,'Agency review fixture','4.2',1,'done','fixture','{}'::jsonb,'[]'::jsonb,$5,$6::jsonb,'[]'::jsonb,now(),now())`,
          [fixture.taskRunId, input.tenantId, input.organizationId, input.caseId, fixture.versionId, JSON.stringify(qa)],
        )
        await client.query(
          `INSERT INTO agency_research_document_versions
           (id,tenant_id,organization_id,document_id,order_ref,template_id,version_no,schema_version,status,input_versions,field_evidence,approval_records,simulation_flag,data,issues,rendered_md,client_view_md,task_run_id,qa_result,created_at)
           VALUES ($1,$2,$3,$4,$5,'WZR-BRIEF',1,'1.1','ready_for_review','[]'::jsonb,'{}'::jsonb,'[]'::jsonb,true,$6::jsonb,'[]'::jsonb,$7,$7,$8,$9::jsonb,now())`,
          [fixture.versionId, input.tenantId, input.organizationId, fixture.documentId, input.caseId, JSON.stringify(fixtureBrief()), fixture.clientViewMd, fixture.taskRunId, JSON.stringify(qa)],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    })
    const appRoot = path.resolve(input.appRoot ?? process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
    bootstrap ??= bootstrapFromAppRoot(appRoot)
    await bootstrap
    const container = await createRequestContainer()
    try {
      await configureBriefReviewWorkflow(container, input)
      const invitation = await container.resolve<BriefReviewService>(BRIEF_REVIEW_SERVICE).invite({ ...input, versionId: fixture.versionId })
      fixture.workflowInstanceId = invitation.workflowInstanceId
      fixture.taskId = invitation.taskId
    } finally {
      await container.dispose()
    }
    return fixture
  } catch (error) {
    await deleteBriefReviewFixture(fixture)
    throw error
  }
}

export async function deleteBriefReviewFixture(fixture: BriefReviewFixture): Promise<void> {
  await withClient(async (client) => {
    const scope = [fixture.tenantId, fixture.organizationId]
    const workflows = await client.query<{ id: string }>(
      `SELECT id FROM workflow_instances WHERE tenant_id=$1 AND organization_id=$2
       AND workflow_id=$3 AND correlation_key=$4`,
      [...scope, BRIEF_REVIEW_WORKFLOW_ID, `agency-brief:${fixture.caseId}:${fixture.versionId}`],
    )
    for (const workflow of workflows.rows) {
      for (const table of ['workflow_events', 'user_tasks', 'step_instances', 'workflow_branch_instances']) {
        await client.query(`DELETE FROM ${table} WHERE workflow_instance_id=$1 AND tenant_id=$2 AND organization_id=$3`, [workflow.id, ...scope])
      }
      await client.query('DELETE FROM workflow_instances WHERE id=$1 AND tenant_id=$2 AND organization_id=$3', [workflow.id, ...scope])
    }
    await client.query('DELETE FROM agency_research_document_versions WHERE id=$1 AND tenant_id=$2 AND organization_id=$3 AND order_ref=$4', [fixture.versionId, ...scope, fixture.caseId])
    await client.query('DELETE FROM agency_research_task_runs WHERE id=$1 AND tenant_id=$2 AND organization_id=$3 AND order_ref=$4', [fixture.taskRunId, ...scope, fixture.caseId])
    await client.query('DELETE FROM agency_research_documents WHERE id=$1 AND tenant_id=$2 AND organization_id=$3 AND order_ref=$4', [fixture.documentId, ...scope, fixture.caseId])
  })
}
