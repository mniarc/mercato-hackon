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
  tasks: Array<{ id: string; step_id: string; status: string; output_version_id: string | null; input_versions: unknown }>
  versions: Array<{ id: string; document_id: string; version: string }>
  specialistVersions: Array<{ id: string; document_id: string; research_run_id: string; version: string }>
  reviews: Array<{ id: string; workflow_instance_id: string; workflow_id: string; context: Record<string, unknown> }>
}
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null
const nativePhase = (status: string): Phase => status === 'ok' ? 'completed'
  : ['error', 'cancelled'].includes(status) ? 'failed' : status === 'running' ? 'started' : 'waiting'

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
    const workflowRows = await client.query<{ id: string }>(`SELECT id FROM workflow_instances WHERE tenant_id=$1 AND organization_id=$2
      AND (context->>'caseId'=$4 OR (metadata->>'entityType'='agency_operations:agency_case' AND metadata->>'entityId'=$4)
        OR id IN (SELECT workflow_instance_id FROM agency_client_submissions WHERE tenant_id=$1 AND organization_id=$2 AND case_id=$4::uuid))
      AND $3::uuid IS NOT NULL`, args)
    const params = [scope.tenantId, scope.organizationId, workflowRows.rows.map((row) => row.id)]
    const runs = await client.query<NativeEvidenceRows['runs'][number]>(`SELECT id,agent_id,status,workflow_instance_id FROM agent_runs
      WHERE tenant_id=$1 AND organization_id=$2 AND workflow_instance_id=ANY($3::uuid[])`, params)
    const tasks = await client.query<NativeEvidenceRows['tasks'][number]>(`SELECT id,step_id,status,output_version_id,input_versions
      FROM agency_research_task_runs WHERE tenant_id=$1 AND organization_id=$2 AND order_ref=$3`, [scope.tenantId, scope.organizationId, caseId])
    const versions = await client.query<NativeEvidenceRows['versions'][number]>(`SELECT v.id,d.output_id||'@'||v.order_ref AS document_id,v.version_no::text||'.0' AS version
      FROM agency_research_document_versions v JOIN agency_research_documents d ON d.id=v.document_id AND d.tenant_id=v.tenant_id AND d.organization_id=v.organization_id
      WHERE v.tenant_id=$1 AND v.organization_id=$2 AND v.order_ref=$3`, [scope.tenantId, scope.organizationId, caseId])
    const reviews = await client.query<NativeEvidenceRows['reviews'][number]>(`SELECT t.id,t.workflow_instance_id,w.workflow_id,w.context FROM user_tasks t
      JOIN workflow_instances w ON w.id=t.workflow_instance_id AND w.tenant_id=t.tenant_id AND w.organization_id=t.organization_id
      WHERE t.tenant_id=$1 AND t.organization_id=$2 AND t.workflow_instance_id=ANY($3::uuid[])`, params)
    const specialistVersions = await client.query<NativeEvidenceRows['specialistVersions'][number]>(`SELECT v.id,v.document_id,v.research_run_id,v.version_no::text||'.0' AS version
      FROM agency_tov_document_versions v JOIN agency_tov_documents d ON d.id=v.document_id AND d.tenant_id=v.tenant_id AND d.organization_id=v.organization_id
      WHERE v.tenant_id=$1 AND v.organization_id=$2 AND d.kind='KLI-TOV' AND v.research_run_id IN
      (SELECT (context->'research_tov_result'->'result'->>'researchRunId')::uuid FROM workflow_instances
        WHERE tenant_id=$1 AND organization_id=$2 AND id=ANY($3::uuid[]) AND workflow_id='agency_operations.tov-research.v1')`, params)
    return { runs: runs.rows, tasks: tasks.rows, versions: versions.rows, specialistVersions: specialistVersions.rows, reviews: reviews.rows }
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
