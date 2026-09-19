import fs from 'node:fs'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AgentRunCtx, AgentRuntimeService } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/runtime/agentRuntime'
import type { ResearchAgentRunner } from './research/pipeline'
import type { Usage } from './research/ledger'

type Container = { resolve(name: string): unknown }

/**
 * The Enterprise Agent Orchestrator is the runner: every call is a persisted
 * `agent_runs` row (admission gate, provider budget, guardrails, traces, cockpit).
 * Usage is read back from that row — the platform's pricing is the ledger's source
 * of truth — and the run ids are collected for the task run.
 */
export function createOrchestratorRunner(container: Container, context: AgentRunCtx, agentRunIds: string[] = []): ResearchAgentRunner {
  const runtime = container.resolve('agentRuntime') as AgentRuntimeService
  const em = (container.resolve('em') as EntityManager).fork()
  let invocation = 0
  return async (agentId, input, options) => {
    let runId: string | null = null
    const result = await runtime.run(agentId, input, {
      ...context,
      invocationId: context.invocationId ? `${context.invocationId}:${invocation++}` : undefined,
      runTimeoutMs: options.runTimeoutMs,
      onRunPersisted(id) {
        runId = id
        if (!agentRunIds.includes(id)) agentRunIds.push(id)
        context.onRunPersisted?.(id)
      },
    })
    return { result, usage: runId ? await readRunUsage(em, runId) : null }
  }
}

async function readRunUsage(em: EntityManager, runId: string): Promise<Usage | null> {
  const rows = await em
    .getConnection()
    .execute(`select model, input_tokens, output_tokens, cost_minor, currency from agent_runs where id = ?`, [runId])
  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined
  if (!row) return { model: null, inputTokens: 0, outputTokens: 0, costMinor: null, currency: null, agentRunId: runId }
  return {
    model: typeof row.model === 'string' ? row.model : null,
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    costMinor: row.cost_minor === null || row.cost_minor === undefined ? null : Number(row.cost_minor),
    currency: typeof row.currency === 'string' ? row.currency : null,
    agentRunId: runId,
  }
}

/**
 * Test runner: canned outputs from a fixture directory, selected by agent id and,
 * for the page extractor, by the page's source id. Every call is recorded so a
 * test can assert what was asked. Zero network, zero spend.
 */
export function createFixtureRunner(dir: string, opts: { calls?: { agentId: string; input: unknown }[]; usage?: Partial<Usage> } = {}): ResearchAgentRunner {
  const sequence = new Map<string, number>()
  return async (agentId, input) => {
    opts.calls?.push({ agentId, input })
    const typed = input as { page?: { source_id?: string }; section?: string }
    // Most specific first: per page (extractor), per section (brief writer), then the agent's default file.
    const candidates = [
      typed.page?.source_id ? `${agentId}.${typed.page.source_id}.json` : null,
      typed.section ? `${agentId}.${typed.section}.json` : null,
      `${agentId}.json`,
    ].filter((name): name is string => name !== null)
    for (const name of candidates) {
      const file = path.join(dir, name)
      if (!fs.existsSync(file)) continue
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
      // A file holding an array is a sequence: call n gets element min(n, last).
      const result = Array.isArray(raw) ? raw[Math.min(sequence.get(name) ?? 0, raw.length - 1)] : raw
      sequence.set(name, (sequence.get(name) ?? 0) + 1)
      return {
        result,
        usage: { model: 'fixture', inputTokens: JSON.stringify(input).length / 4, outputTokens: 500, costMinor: null, currency: null, agentRunId: null, ...opts.usage },
      }
    }
    throw new Error(`[internal] fixture runner: no canned output for ${candidates.join(' | ')} in ${dir}`)
  }
}
