import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { liveAgentRuns, orderStatus } from '../../lib/store'

/**
 * Staff read of an order's process state: every step execution with its
 * status, produced version, agent runs and spend — the ledger STD-LIMITY talks
 * about, summed per order.
 */

const querySchema = z.object({ order_ref: z.string().trim().min(1).max(200) })

const taskRunSchema = z.object({
  id: z.string(),
  stepId: z.string(),
  attempt: z.number().int(),
  status: z.string(),
  runner: z.string(),
  costPln: z.number(),
  agentRuns: z.number().int(),
  outputVersionId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
})

const agentRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  stepId: z.string().nullable(),
  status: z.string(),
  model: z.string().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  costMinor: z.number().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['agency_research.documents.view'] },
}

export async function GET(request: Request): Promise<Response> {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return NextResponse.json({ error: 'order_ref is required' }, { status: 400 })
  const auth = await getAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return NextResponse.json({ error: 'Organization scope is required' }, { status: 403 })
  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em')
  const [status, agentRuns] = await Promise.all([orderStatus(em, scope, query.data.order_ref), liveAgentRuns(em, scope, query.data.order_ref)])
  return NextResponse.json({
    orderRef: query.data.order_ref,
    totalPln: status.totalPln,
    sources: status.sources,
    documents: status.documents.map((d) => ({ ...d, updatedAt: d.updatedAt ? d.updatedAt.toISOString() : null })),
    taskRuns: status.taskRuns.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null })),
    // The calls behind the steps, newest first, running ones included — what a ledger row cannot show until its step closes.
    agentRuns: agentRuns.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), completedAt: r.completedAt ? r.completedAt.toISOString() : null })),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Research',
  methods: {
    GET: {
      summary: 'Read the process state and spend of an order',
      query: querySchema,
      responses: [
        {
          status: 200,
          schema: z.object({
            orderRef: z.string(),
            totalPln: z.number(),
            sources: z.number().int(),
            documents: z.array(
              z.object({ templateId: z.string(), outputId: z.string(), status: z.string(), versionNo: z.number().int().nullable(), versionId: z.string().nullable(), updatedAt: z.string().nullable() }),
            ),
            taskRuns: z.array(taskRunSchema),
            agentRuns: z.array(agentRunSchema),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'order_ref missing' },
        { status: 401, description: 'Authentication required' },
        { status: 403, description: 'Organization scope required' },
      ],
    },
  },
}
