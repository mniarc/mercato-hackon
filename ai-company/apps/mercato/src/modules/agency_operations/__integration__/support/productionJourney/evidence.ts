import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import type { JourneyScope } from './records'
import type { JourneyMode } from './mode'

type Phase = 'started' | 'completed' | 'waiting' | 'failed'
type Observation = {
  agentId?: string; integrationId?: string; checkpointId?: string; phase: Phase;
  reason?: 'human' | 'input' | 'budget' | 'configuration' | 'execution';
  refs?: Record<string, string>;
}
export type NativeEvidenceRows = {
  runs: Array<{ id: string; agent_id: string; status: string; workflow_instance_id: string | null }>
  tasks: Array<{ id: string; step_id: string; status: string; output_version_id: string | null; input_versions: unknown; agent_run_ids?: unknown; people?: unknown }>
  versions: Array<{ id: string; document_id: string; version: string }>
  specialistVersions: Array<{ id: string; document_id: string; research_run_id: string; version: string }>
  reviews: Array<{ id: string; workflow_instance_id: string; workflow_id: string; context: Record<string, unknown> }>
  workflows?: Array<{ id: string; workflow_id: string; status: string; context: Record<string, unknown> }>
  captures?: Array<{ id: string; payment_id: string; order_id: string }>
  submissions?: Array<{ id: string; workflow_instance_id: string; previous_version_id: string }>
  corpusAttachments?: Array<{ id: string; record_id: string }>
}
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null
const nativePhase = (status: string): Phase => status === 'ok' ? 'completed'
  : ['error', 'cancelled'].includes(status) ? 'failed' : status === 'running' ? 'started' : 'waiting'
const contains = (value: unknown, id: unknown) => typeof id === 'string' && Array.isArray(value) && value.includes(id)

export function observationsFromRows(rows: NativeEvidenceRows): Observation[] {
  const observations: Observation[] = rows.runs.map((run) => ({ agentId: run.agent_id, phase: nativePhase(run.status),
    ...(nativePhase(run.status) === 'failed' ? { reason: 'execution' as const } : {}),
    refs: { agentRunId: run.id, ...(run.workflow_instance_id ? { workflowInstanceId: run.workflow_instance_id } : {}) } }))
  const reviewTypes = [
    ['agency_operations.brief-review.v1', 'briefReviewInvitation', 'research-brief-to-client-review', 'versionId'],
    ['agency_operations.strategy-pair-review.v1', 'strategyPairInvitation', 'accepted-brief-to-strategy-pair-review', 'strategy'],
    ['agency_operations.plan-review.v1', 'planInvitation', 'accepted-pair-to-plan-review', 'plan'],
    ['agency_operations.post-review.v1', 'postInvitation', 'accepted-plan-to-post-review', 'post'],
  ]
  for (const review of rows.reviews) {
    const kind = reviewTypes.find(([workflow]) => workflow === review.workflow_id)
    if (!kind) continue
    const snapshot = record(record(review.context[kind[1]])?.review)
    const versionId = kind[3] === 'versionId' ? snapshot?.versionId : record(snapshot?.[kind[3]])?.versionId
    const producer = rows.tasks.find((task) => task.status === 'done' && task.output_version_id === versionId)
    if (producer && typeof versionId === 'string') observations.push({ integrationId: kind[2], phase: 'completed',
      refs: { producerRunId: producer.id, userTaskId: review.id, workflowInstanceId: review.workflow_instance_id, outputVersionId: versionId } })
  }
  const stepEdges = [
    ['3.2', '3.3', 'research-sources-to-audit'],
    ['3.3', '3.6', 'research-audit-to-findings'], ['3.5', '3.6', 'research-competitors-to-findings'],
    ['3.6', '4.1', 'research-findings-to-brief'],
  ]
  for (const [from, to, integrationId] of stepEdges) {
    for (const producer of rows.tasks.filter((task) => task.step_id === from && task.status === 'done')) {
      const version = rows.versions.find((row) => row.id === producer.output_version_id)
      if (!version) continue
      for (const consumer of rows.tasks.filter((task) => task.step_id === to && task.status === 'done')) {
        const pins = Array.isArray(consumer.input_versions) ? consumer.input_versions : []
        if (pins.some((pin) => record(pin)?.document_id === version.document_id && record(pin)?.version === version.version)) {
          observations.push({ integrationId, phase: 'completed', refs: { producerRunId: producer.id,
            consumerRunId: consumer.id, outputVersionId: version.id } })
        }
      }
    }
  }
  for (const task of rows.tasks.filter((item) => item.step_id === '3.2' && item.status === 'done' && record(item.people))) {
    const version = rows.versions.find((item) => item.id === task.output_version_id)
    if (!version) continue
    for (const run of rows.runs.filter((item) => item.status === 'ok'
      && ['agency_research.people_finder', 'agency_research.channel_selector'].includes(item.agent_id)
      && contains(task.agent_run_ids, item.id))) {
      observations.push({ integrationId: 'research-people-to-sources', phase: 'completed',
        refs: { producerRunId: run.id, consumerRunId: task.id, outputVersionId: version.id } })
    }
  }
  for (const workflow of rows.workflows ?? []) {
    if (workflow.workflow_id === 'agency_operations.analysis.v1') {
      const origin = record(workflow.context.purchase) ?? record(workflow.context.paidPurchaseOrigin)
      const capture = rows.captures?.find((item) => item.order_id === origin?.orderId && item.payment_id === origin?.paymentId)
      const result = record(record(workflow.context.research_result ?? workflow.context.agencyAnalysisResult)?.result)
      const activation = rows.tasks.find((item) => item.step_id === '3.1' && item.status === 'done'
        && contains(result?.taskRunIds, item.id))
      if (capture && activation) observations.push({ integrationId: 'paid-capture-to-analysis', phase: 'completed',
        refs: { producerRunId: capture.id, consumerRunId: activation.id, workflowInstanceId: workflow.id } })
    }
    if (workflow.workflow_id === 'agency_operations.client-submission.native.v1') {
      const result = record(record(workflow.context.execute_brief_revision_result)?.result)
      const submission = rows.submissions?.find((item) => item.workflow_instance_id === workflow.id
        && item.id === result?.submissionId && item.previous_version_id === result?.previousBriefVersionId)
      if (!submission || result?.status !== 'completed' || result.briefVersionId === result.previousBriefVersionId) continue
      const producer = rows.tasks.find((item) => item.status === 'done' && item.output_version_id === result.briefVersionId
        && contains(result.taskRunIds, item.id) && contains(result.documentVersionIds, item.output_version_id))
      if (!producer) continue
      for (const review of rows.reviews.filter((item) => item.workflow_id === 'agency_operations.brief-review.v1'
        && record(record(item.context.briefReviewInvitation)?.review)?.versionId === result.briefVersionId)) {
        observations.push({ integrationId: 'brief-answer-to-revised-review', phase: 'completed', refs: {
          producerRunId: producer.id, userTaskId: review.id, workflowInstanceId: workflow.id, outputVersionId: producer.output_version_id!,
        } })
      }
    }
    if (workflow.workflow_id === 'agency_operations.tov-research.v1' && workflow.status === 'COMPLETED') {
      const intake = record(workflow.context.staffTovIntake)
      const corpus = rows.corpusAttachments?.find((item) => item.id === intake?.corpusAttachmentId && item.record_id === intake?.intakeId)
      const result = record(record(workflow.context.research_tov_result)?.result)
      const version = rows.specialistVersions.find((item) => item.research_run_id === result?.researchRunId
        && contains(result?.documentVersionIds, item.id))
      if (corpus && version) observations.push({ integrationId: 'material-to-tov-profile', phase: 'completed', refs: {
        producerRunId: workflow.id, consumerRunId: version.research_run_id, outputVersionId: version.id,
      } })
    }
  }
  for (const version of rows.specialistVersions) {
    for (const consumer of rows.tasks.filter((task) => task.status === 'done' && task.step_id === '5.4')) {
      const pins = Array.isArray(consumer.input_versions) ? consumer.input_versions : []
      if (pins.some((pin) => {
        const reference = record(record(pin)?.specialistTov)
        return reference?.owner === 'agency_tov' && reference.versionId === version.id
          && reference.researchRunId === version.research_run_id && reference.documentId === version.document_id
          && record(pin)?.version === version.version
      })) observations.push({ integrationId: 'specialist-tov-to-strategy', phase: 'completed',
        refs: { producerRunId: version.research_run_id, consumerRunId: consumer.id, outputVersionId: version.id } })
    }
  }
  return observations
}

export async function readNativeEvidence(scope: JourneyScope, caseId: string): Promise<NativeEvidenceRows> {
  return withClient(async (client) => {
    const args = [scope.tenantId, scope.organizationId, scope.customerEntityId, caseId]
    const owned = await client.query(`SELECT id FROM agency_cases WHERE tenant_id=$1 AND organization_id=$2 AND customer_entity_id=$3 AND id=$4`, args)
    if (!owned.rows.length) return { runs: [], tasks: [], versions: [], specialistVersions: [], reviews: [] }
    const workflowRows = await client.query<NonNullable<NativeEvidenceRows['workflows']>[number]>(`SELECT id,workflow_id,status,context FROM workflow_instances WHERE tenant_id=$1 AND organization_id=$2
      AND deleted_at IS NULL AND (context->>'caseId'=$4 OR context->'staffTovIntake'->>'caseId'=$4 OR (metadata->>'entityType'='agency_operations:agency_case' AND metadata->>'entityId'=$4)
        OR id IN (SELECT workflow_instance_id FROM agency_client_submissions WHERE tenant_id=$1 AND organization_id=$2 AND case_id=$4::uuid))
      AND $3::uuid IS NOT NULL`, args)
    const params = [scope.tenantId, scope.organizationId, workflowRows.rows.map((row) => row.id)]
    const runs = await client.query<NativeEvidenceRows['runs'][number]>(`SELECT id,agent_id,status,workflow_instance_id FROM agent_runs
      WHERE tenant_id=$1 AND organization_id=$2 AND workflow_instance_id=ANY($3::uuid[])`, params)
    const tasks = await client.query<NativeEvidenceRows['tasks'][number]>(`SELECT id,step_id,status,output_version_id,input_versions,agent_run_ids,summary->'people' AS people
      FROM agency_research_task_runs WHERE tenant_id=$1 AND organization_id=$2 AND order_ref=$3`, [scope.tenantId, scope.organizationId, caseId])
    const versions = await client.query<NativeEvidenceRows['versions'][number]>(`SELECT v.id,d.output_id||'@'||v.order_ref AS document_id,v.version_no::text||'.0' AS version
      FROM agency_research_document_versions v JOIN agency_research_documents d ON d.id=v.document_id AND d.tenant_id=v.tenant_id AND d.organization_id=v.organization_id
      WHERE v.tenant_id=$1 AND v.organization_id=$2 AND v.order_ref=$3`, [scope.tenantId, scope.organizationId, caseId])
    const reviews = await client.query<NativeEvidenceRows['reviews'][number]>(`SELECT t.id,t.workflow_instance_id,w.workflow_id,w.context FROM user_tasks t
      JOIN workflow_instances w ON w.id=t.workflow_instance_id AND w.tenant_id=t.tenant_id AND w.organization_id=t.organization_id
      WHERE t.tenant_id=$1 AND t.organization_id=$2 AND t.workflow_instance_id=ANY($3::uuid[])`, params)
    const specialistVersions = await client.query<NativeEvidenceRows['specialistVersions'][number]>(`SELECT v.id,v.document_id,v.research_run_id,v.version_no::text||'.0' AS version
      FROM agency_tov_document_versions v JOIN agency_tov_documents d ON d.id=v.document_id AND d.tenant_id=v.tenant_id AND d.organization_id=v.organization_id
      JOIN agency_tov_research_runs r ON r.id=v.research_run_id AND r.tenant_id=v.tenant_id AND r.organization_id=v.organization_id
      WHERE v.tenant_id=$1 AND v.organization_id=$2 AND d.kind='KLI-TOV' AND d.deleted_at IS NULL AND r.status='done' AND v.research_run_id::text IN
      (SELECT context->'research_tov_result'->'result'->>'researchRunId' FROM workflow_instances
        WHERE tenant_id=$1 AND organization_id=$2 AND id=ANY($3::uuid[]) AND workflow_id='agency_operations.tov-research.v1')`, params)
    const captures = await client.query<NonNullable<NativeEvidenceRows['captures']>[number]>(`SELECT g.id,g.payment_id,p.order_id
      FROM gateway_transactions g JOIN sales_payments p ON p.id=g.payment_id AND p.tenant_id=g.tenant_id AND p.organization_id=g.organization_id
      JOIN sales_orders o ON o.id=p.order_id AND o.tenant_id=p.tenant_id AND o.organization_id=p.organization_id
      WHERE g.tenant_id=$1 AND g.organization_id=$2 AND o.customer_entity_id=$3 AND g.deleted_at IS NULL
        AND g.unified_status='captured' AND g.captured_amount>0 AND p.captured_amount=g.captured_amount
        AND EXISTS (SELECT 1 FROM workflow_instances w WHERE w.tenant_id=$1 AND w.organization_id=$2 AND w.context->>'caseId'=$4
          AND (w.context->'purchase'->>'paymentId'=p.id::text OR w.context->'paidPurchaseOrigin'->>'paymentId'=p.id::text))`, args)
    const submissions = await client.query<NonNullable<NativeEvidenceRows['submissions']>[number]>(`SELECT id,workflow_instance_id,
      original->'reviewResponse'->>'versionId' AS previous_version_id FROM agency_client_submissions
      WHERE tenant_id=$1 AND organization_id=$2 AND customer_entity_id=$3 AND case_id=$4 AND deleted_at IS NULL`, args)
    const corpusAttachments = await client.query<NonNullable<NativeEvidenceRows['corpusAttachments']>[number]>(`SELECT a.id,a.record_id FROM attachments a
      JOIN workflow_instances w ON w.tenant_id=a.tenant_id AND w.organization_id=a.organization_id
        AND w.context->'staffTovIntake'->>'corpusAttachmentId'=a.id::text AND w.context->'staffTovIntake'->>'intakeId'=a.record_id
      WHERE a.tenant_id=$1 AND a.organization_id=$2 AND a.entity_id='agency_operations:tov_intake' AND w.id=ANY($3::uuid[])`, params)
    return { runs: runs.rows, tasks: tasks.rows, versions: versions.rows, specialistVersions: specialistVersions.rows, reviews: reviews.rows,
      workflows: workflowRows.rows, captures: captures.rows, submissions: submissions.rows, corpusAttachments: corpusAttachments.rows }
  })
}

export function createJourneyEvidence(appRoot: string, mode: JourneyMode) {
  const runId = randomUUID()
  const teamRoot = path.resolve(appRoot, '../../..')
  const file = path.join(teamRoot, '.dev-docs/integrations/journals', `${runId}.jsonl`)
  let writer: Promise<{ appendEvent: (file: string, event: unknown) => Promise<void> }> | undefined
  const observed = new Set<string>()
  async function write(observation: Observation) {
    try {
      writer ??= import(pathToFileURL(path.join(teamRoot, '.dev-docs/integrations/src/journal.mjs')).href)
      const key = JSON.stringify(observation)
      if (observed.has(key)) return
      await (await writer).appendEvent(file, { schemaVersion: 1, runId, time: new Date().toISOString(), journey: 'TC-AGENCY-002', mode, ...observation })
      observed.add(key)
    } catch {
      console.warn('[TC-AGENCY-002] Integration journal could not retain an observation; application outcome is unchanged.')
    }
  }
  return { file,
    checkpoint: (checkpointId: string, phase: Phase) => write({ checkpointId, phase, ...(phase === 'failed' ? { reason: 'execution' as const } : {}) }),
    collect: async (scope: JourneyScope, caseId: string) => {
      try { for (const observation of observationsFromRows(await readNativeEvidence(scope, caseId))) await write(observation) }
      catch { console.warn('[TC-AGENCY-002] Native journal collection incomplete before owned fixture cleanup.') }
    },
  }
}
