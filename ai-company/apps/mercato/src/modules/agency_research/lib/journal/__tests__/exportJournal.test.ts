import type { EntityManager } from '@mikro-orm/postgresql'
import { exportOrderJournal } from '../exportJournal'

const scope = { tenantId: 'tenant', organizationId: 'organization' }
const at = (second: number) => new Date(Date.UTC(2026, 8, 19, 12, 0, second))
const task = (step: string, second: number, runner = 'orchestrator') => ({
  id: `task-${step}`, step_id: step, attempt: 1, status: 'done', runner,
  output_version_id: `version-${step}`, agent_run_ids: [`agent-run-${step}`],
  created_at: at(second), finished_at: at(second + 1),
})

function database(runner = 'orchestrator', simulated = false) {
  const tasks = [task('3.2', 0, runner), task('3.3', 2, runner), task('4.2', 4, runner), task('5.2', 6, runner)]
  const agents = tasks.map((run) => ({
    id: run.agent_run_ids[0], agent_id: `agency_research.step-${run.step_id}`, status: 'ok',
    workflow_instance_id: 'workflow', created_at: run.created_at, completed_at: run.finished_at,
  }))
  const execute = jest.fn(async (sql: string) => {
    if (sql.includes('from agency_research_task_runs')) return tasks
    if (sql.includes('from agent_runs')) return agents
    if (sql.includes('from agency_research_document_versions')) return simulated ? [{ id: 'version-5.2' }] : []
    if (sql.includes('from user_tasks')) return [{ id: 'review', workflow_instance_id: 'review-workflow', created_at: at(5) }]
    throw new Error(`Unexpected query: ${sql}`)
  })
  return { em: { getConnection: () => ({ execute }) } as unknown as EntityManager, execute }
}

describe('order journal intelligence mode', () => {
  it('requires explicit intelligence for native orchestrator runs instead of claiming live proof', async () => {
    const { em } = database()
    await expect(exportOrderJournal(em, scope, 'order', 'demo')).rejects.toThrow('--intelligence fixture|live is required')
  })

  it.each(['fixture', 'live'] as const)('propagates explicit %s mode to native agents, checkpoints and review handoffs', async (mode) => {
    const { em, execute } = database()
    const result = await exportOrderJournal(em, scope, 'order', 'demo', mode)
    expect(result.agentRuns).toBe(4)
    expect(result.events.every((event) => event.mode === mode)).toBe(true)
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentId: 'agency_research.step-3.2', phase: 'completed', mode }),
      expect.objectContaining({ integrationId: 'research-sources-to-audit', phase: 'completed', mode }),
      expect.objectContaining({ integrationId: 'research-brief-to-client-review', phase: 'completed', mode }),
      expect.objectContaining({ checkpointId: 'client-review.brief', phase: 'waiting', mode }),
    ]))
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('from agent_runs where tenant_id = ? and organization_id = ?'),
      [scope.tenantId, scope.organizationId, 'agent-run-3.2', 'agent-run-3.3', 'agent-run-4.2', 'agent-run-5.2'],
    )
  })

  it('never upgrades a known fixture runner to live intelligence', async () => {
    const { em } = database('fixture')
    const inferred = await exportOrderJournal(em, scope, 'order', 'demo')
    const explicit = await exportOrderJournal(em, scope, 'order', 'demo', 'live')
    expect(inferred.events.length).toBeGreaterThan(0)
    expect([...inferred.events, ...explicit.events].every((event) => event.mode === 'fixture')).toBe(true)
  })

  it('keeps a simulated client approval unproved even with explicitly live intelligence', async () => {
    const { em } = database('orchestrator', true)
    const { events } = await exportOrderJournal(em, scope, 'order', 'demo', 'live')
    expect(events).toContainEqual(expect.objectContaining({
      integrationId: 'accepted-brief-to-strategy-pair-review', phase: 'started', mode: 'live',
    }))
  })
})
