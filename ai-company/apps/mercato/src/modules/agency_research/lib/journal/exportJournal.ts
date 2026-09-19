import type { EntityManager } from '@mikro-orm/postgresql'
import type { ResearchScope } from '../store'

/**
 * Integration-evidence journal of one order, built from what the platform
 * persisted (`.dev-docs/integrations/usage.md`): task runs become checkpoints,
 * their orchestrator `agent_runs` become agent observations, and a handoff is
 * recorded only from saved lineage — the producer step's last agent run and the
 * consumer step's first, or the client review task the brief was handed to.
 *
 * Nothing here is inferred from prompts or outputs; refs are native ids only.
 * A consumer whose input the CLI approved on the client's behalf
 * (`simulation_flag`) gets a `simulated-client-acceptance` checkpoint and its
 * handoff stays `started`: the agents ran live, the native decision did not.
 */
export type JournalEvent = {
  schemaVersion: 1
  runId: string
  time: string
  journey: string
  mode: 'fixture' | 'live'
  agentId?: string
  integrationId?: string
  checkpointId?: string
  phase: 'started' | 'completed' | 'waiting' | 'failed'
  reason?: 'human' | 'input' | 'budget' | 'configuration' | 'execution'
  refs?: Partial<Record<'agentRunId' | 'workflowInstanceId' | 'taskRunId' | 'outputVersionId' | 'producerRunId' | 'consumerRunId' | 'userTaskId', string>>
}

type TaskRunRow = {
  id: string
  step_id: string
  attempt: number
  status: string
  runner: string
  output_version_id: string | null
  agent_run_ids: unknown
  created_at: Date
  finished_at: Date | null
}
type AgentRunRow = { id: string; agent_id: string; status: string; workflow_instance_id: string | null; created_at: Date; completed_at: Date | null }
type UserTaskRow = { id: string; workflow_instance_id: string; created_at: Date }

/** Producer step → consumer step, as `.dev-docs/integrations/expected.json` names the handoffs. */
const HANDOFFS: { id: string; producer: string; consumer: string }[] = [
  { id: 'research-sources-to-audit', producer: '3.2', consumer: '3.3' },
  { id: 'research-audit-to-findings', producer: '3.3', consumer: '3.6' },
  { id: 'research-competitors-to-findings', producer: '3.5', consumer: '3.6' },
  { id: 'research-findings-to-brief', producer: '3.6', consumer: '4.1' },
  { id: 'accepted-brief-to-strategy-pair-review', producer: '4.2', consumer: '5.2' },
  { id: 'accepted-pair-to-plan-review', producer: '5.4', consumer: '6.2' },
  { id: 'accepted-plan-to-post-review', producer: '6.3', consumer: '7.2' },
]
/** 3.2a runs inside the 3.2 task run: the people agents hand their result to the page agents of the same step. */
const PEOPLE_HANDOFF = { id: 'research-people-to-sources', producers: ['agency_research.people_finder', 'agency_research.channel_selector'], consumers: ['agency_research.page_extractor', 'agency_research.proof_builder', 'agency_research.content_seeder'] }
/** Consumers whose input is a client decision — a simulated approval keeps the handoff unproven. */
const CLIENT_DECISION_CONSUMERS = new Set(['5.2', '6.2', '7.2'])

const iso = (value: Date | string) => new Date(value).toISOString()
const token = /^[A-Za-z0-9_.:/-]{1,200}$/
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && token.test(id)) : [])

function phaseOf(status: string): Pick<JournalEvent, 'phase' | 'reason'> {
  if (status === 'done' || status === 'to_fix') return { phase: 'completed' }
  if (status === 'failed') return { phase: 'failed', reason: 'execution' }
  if (status === 'paused_budget') return { phase: 'waiting', reason: 'budget' }
  if (status === 'running') return { phase: 'started' }
  return { phase: 'waiting', reason: 'human' }
}

export async function exportOrderJournal(
  em: EntityManager,
  scope: ResearchScope,
  orderRef: string,
  journey: string,
): Promise<{ events: JournalEvent[]; agentRuns: number; unknownAgentRuns: number }> {
  const connection = em.getConnection()
  const taskRuns = (await connection.execute(
    `select id, step_id, attempt, status, runner, output_version_id, agent_run_ids, created_at, finished_at
       from agency_research_task_runs where tenant_id = ? and organization_id = ? and order_ref = ? and runner in ('orchestrator', 'fixture')
       order by created_at asc`,
    [scope.tenantId, scope.organizationId, orderRef],
  )) as TaskRunRow[]
  const allAgentRunIds = [...new Set(taskRuns.flatMap((run) => ids(run.agent_run_ids)))]
  const agentRuns = new Map<string, AgentRunRow>()
  for (let i = 0; i < allAgentRunIds.length; i += 500) {
    const chunk = allAgentRunIds.slice(i, i + 500)
    const rows = (await connection.execute(
      `select id, agent_id, status, workflow_instance_id, created_at, completed_at from agent_runs where tenant_id = ? and id in (${chunk.map(() => '?').join(',')})`,
      [scope.tenantId, ...chunk],
    )) as AgentRunRow[]
    for (const row of rows) agentRuns.set(row.id, row)
  }
  const simulatedVersions = new Set(
    ((await connection.execute(
      `select id from agency_research_document_versions where tenant_id = ? and organization_id = ? and order_ref = ? and simulation_flag = true`,
      [scope.tenantId, scope.organizationId, orderRef],
    )) as { id: string }[]).map((row) => row.id),
  )
  const reviewTasks = (await connection.execute(
    `select ut.id, ut.workflow_instance_id, ut.created_at from user_tasks ut
       join workflow_instances wi on wi.id = ut.workflow_instance_id
      where ut.tenant_id = ? and ut.organization_id = ? and wi.workflow_id = 'agency_operations.brief-review.v1' and wi.context::text like ?
      order by ut.created_at asc`,
    [scope.tenantId, scope.organizationId, `%${orderRef}%`],
  )) as UserTaskRow[]

  const events: JournalEvent[] = []
  const emittedAgentRuns = new Set<string>()
  let unknownAgentRuns = 0
  const base = (mode: JournalEvent['mode']): Pick<JournalEvent, 'schemaVersion' | 'runId' | 'journey' | 'mode'> => ({ schemaVersion: 1, runId: orderRef, journey, mode })

  for (const run of taskRuns) {
    const mode: JournalEvent['mode'] = run.runner === 'orchestrator' ? 'live' : 'fixture'
    const checkpointId = `research.step.${run.step_id}`
    const refs: JournalEvent['refs'] = { taskRunId: run.id, ...(run.output_version_id ? { outputVersionId: run.output_version_id } : {}) }
    events.push({ ...base(mode), time: iso(run.created_at), checkpointId, phase: 'started', refs })
    for (const agentRunId of ids(run.agent_run_ids)) {
      if (emittedAgentRuns.has(agentRunId)) continue
      emittedAgentRuns.add(agentRunId)
      const agentRun = agentRuns.get(agentRunId)
      if (!agentRun) { unknownAgentRuns += 1; continue }
      const phase: JournalEvent['phase'] = agentRun.status === 'ok' ? 'completed' : agentRun.status === 'error' ? 'failed' : 'started'
      events.push({
        ...base('live'), time: iso(agentRun.completed_at ?? agentRun.created_at), agentId: agentRun.agent_id, phase,
        ...(phase === 'failed' ? { reason: 'execution' as const } : {}),
        refs: { agentRunId, taskRunId: run.id, ...(agentRun.workflow_instance_id ? { workflowInstanceId: agentRun.workflow_instance_id } : {}) },
      })
    }
    events.push({ ...base(mode), time: iso(run.finished_at ?? run.created_at), checkpointId, ...phaseOf(run.status), refs })
  }

  const okRunsOf = (run: TaskRunRow) => ids(run.agent_run_ids).filter((id) => agentRuns.get(id)?.status === 'ok')
  const lastDoneBefore = (step: string, before: Date, runner: string) =>
    [...taskRuns].reverse().find((run) => run.step_id === step && run.runner === runner && (run.status === 'done' || run.status === 'to_fix') && run.created_at < before && okRunsOf(run).length > 0)
  for (const run of taskRuns) {
    if (run.status !== 'done' && run.status !== 'to_fix') continue
    const mode: JournalEvent['mode'] = run.runner === 'orchestrator' ? 'live' : 'fixture'
    for (const handoff of HANDOFFS.filter((entry) => entry.consumer === run.step_id)) {
      const producer = lastDoneBefore(handoff.producer, run.created_at, run.runner)
      const consumerRunId = okRunsOf(run)[0]
      if (!producer || !consumerRunId) continue
      const producerRunId = okRunsOf(producer).at(-1) as string
      const time = iso(run.finished_at ?? run.created_at)
      const simulated = CLIENT_DECISION_CONSUMERS.has(run.step_id) && run.output_version_id !== null && simulatedVersions.has(run.output_version_id)
      if (simulated) events.push({ ...base(mode), time, checkpointId: `simulated-client-acceptance.${run.step_id}`, phase: 'completed', refs: { taskRunId: run.id } })
      events.push({ ...base(mode), time, integrationId: handoff.id, phase: simulated ? 'started' : 'completed', refs: { producerRunId, consumerRunId, taskRunId: run.id } })
    }
    if (run.step_id === '3.2') {
      const rows = okRunsOf(run).map((id) => agentRuns.get(id) as AgentRunRow)
      const producer = rows.filter((row) => PEOPLE_HANDOFF.producers.includes(row.agent_id)).at(-1)
      const consumer = producer && rows.find((row) => PEOPLE_HANDOFF.consumers.includes(row.agent_id) && row.created_at >= producer.created_at)
      if (producer && consumer) events.push({ ...base(mode), time: iso(consumer.completed_at ?? consumer.created_at), integrationId: PEOPLE_HANDOFF.id, phase: 'completed', refs: { producerRunId: producer.id, consumerRunId: consumer.id, taskRunId: run.id } })
    }
    if (run.step_id === '4.2' && run.runner === 'orchestrator') {
      const producerRunId = okRunsOf(run).at(-1)
      const next = taskRuns.find((candidate) => candidate.step_id === '4.2' && candidate.created_at > run.created_at)
      const task = reviewTasks.find((candidate) => candidate.created_at >= run.created_at && (!next || candidate.created_at < next.created_at))
      if (producerRunId && task) {
        events.push({ ...base('live'), time: iso(task.created_at), integrationId: 'research-brief-to-client-review', phase: 'completed', refs: { producerRunId, userTaskId: task.id, workflowInstanceId: task.workflow_instance_id, taskRunId: run.id } })
        events.push({ ...base('live'), time: iso(task.created_at), checkpointId: 'client-review.brief', phase: 'waiting', reason: 'human', refs: { userTaskId: task.id, workflowInstanceId: task.workflow_instance_id } })
      }
    }
  }
  events.sort((a, b) => a.time.localeCompare(b.time))
  return { events, agentRuns: emittedAgentRuns.size - unknownAgentRuns, unknownAgentRuns }
}
