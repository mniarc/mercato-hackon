import type { EntityManager } from '@mikro-orm/postgresql'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { CLIENT_CASE_QUERY_SERVICE, type ClientCaseQueryService } from '@/modules/agency_operations/lib/contracts/clientCaseQuery'

/**
 * The customer portal's view of the work behind their own case: one row per
 * research task run (step, attempt, verdict, when) and the agents that ran in
 * it — ids and outcomes only. Never prompts, inputs, outputs, costs or QA text;
 * those stay on the employee side. Ownership is the spine's case query (the
 * same check the case page uses), so a foreign or unknown case is a 404.
 */

const querySchema = z.object({ order_ref: z.uuid() })

export const portalProgressSchema = z.object({
  order_ref: z.string(),
  runs: z.array(z.object({
    step_id: z.string(),
    attempt: z.number().int(),
    status: z.string(),
    runner: z.string(),
    verdict: z.string().nullable(),
    started_at: z.string(),
    finished_at: z.string().nullable(),
    agents: z.array(z.object({ agent_id: z.string(), status: z.string() })),
  })),
})
export type PortalProgress = z.infer<typeof portalProgressSchema>

type TaskRunRow = { id: string; step_id: string; attempt: number; status: string; runner: string; qa_result: { verdict?: string } | null; agent_run_ids: unknown; created_at: Date; finished_at: Date | null }
type AgentRunRow = { id: string; agent_id: string; status: string }

export const metadata = { GET: { requireAuth: false } }

export async function GET(request: Request): Promise<Response> {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return NextResponse.json({ error: 'order_ref must be a case id' }, { status: 400 })
  const auth = await getCustomerAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Customer authentication required' }, { status: 401 })
  if (!auth.customerEntityId) return NextResponse.json({ error: 'Customer account not linked' }, { status: 403 })
  try {
    const container = await createRequestContainer()
    const cases = container.resolve<ClientCaseQueryService>(CLIENT_CASE_QUERY_SERVICE)
    const owned = await cases.get({ customerUserId: auth.sub, customerEntityId: auth.customerEntityId, tenantId: auth.tenantId, organizationId: auth.orgId }, query.data.order_ref)
    if (!owned) throw new CrudHttpError(404, { error: 'Case not found' })
    const em = container.resolve<EntityManager>('em')
    const connection = em.getConnection()
    const taskRuns = (await connection.execute(
      `select id, step_id, attempt, status, runner, qa_result, agent_run_ids, created_at, finished_at
         from agency_research_task_runs where tenant_id = ? and organization_id = ? and order_ref = ? order by created_at asc`,
      [auth.tenantId, auth.orgId, query.data.order_ref],
    )) as TaskRunRow[]
    const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
    const allIds = [...new Set(taskRuns.flatMap((run) => idsOf(run.agent_run_ids)))]
    const agentRuns = new Map<string, AgentRunRow>()
    for (let i = 0; i < allIds.length; i += 500) {
      const chunk = allIds.slice(i, i + 500)
      const rows = (await connection.execute(
        `select id, agent_id, status from agent_runs where tenant_id = ? and id in (${chunk.map(() => '?').join(',')})`,
        [auth.tenantId, ...chunk],
      )) as AgentRunRow[]
      for (const row of rows) agentRuns.set(row.id, row)
    }
    // The ledger of agent run ids is cumulative per order; each task run shows only the runs first seen in it.
    const seen = new Set<string>()
    const runs: PortalProgress['runs'] = taskRuns.map((run) => {
      const agents: { agent_id: string; status: string }[] = []
      for (const id of idsOf(run.agent_run_ids)) {
        if (seen.has(id)) continue
        seen.add(id)
        const row = agentRuns.get(id)
        if (row) agents.push({ agent_id: row.agent_id, status: row.status })
      }
      return {
        step_id: run.step_id, attempt: run.attempt, status: run.status, runner: run.runner,
        verdict: run.qa_result?.verdict ?? null,
        started_at: new Date(run.created_at).toISOString(), finished_at: run.finished_at ? new Date(run.finished_at).toISOString() : null,
        agents,
      }
    })
    return NextResponse.json({ order_ref: query.data.order_ref, runs } satisfies PortalProgress, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isCrudHttpError(error)) return NextResponse.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Research',
  methods: {
    GET: {
      summary: 'Progress of the research and production steps of the customer\'s own case',
      description: 'Native customer session required; ownership through the spine\'s case query. Step ids, attempts, verdicts, timestamps and agent ids with outcomes only — no prompts, outputs, evidence or costs.',
      query: querySchema,
      responses: [{ status: 200, schema: portalProgressSchema }],
      errors: [
        { status: 400, description: 'order_ref is not a case id' },
        { status: 401, description: 'Customer authentication required' },
        { status: 403, description: 'Customer account not linked' },
        { status: 404, description: 'Case not found in the customer scope' },
      ],
    },
  },
}
