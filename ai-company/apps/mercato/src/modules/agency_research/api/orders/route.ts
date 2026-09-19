import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listOrders } from '../../lib/store'

/**
 * Staff list of every order that has research in the organization scope —
 * live runs, fixture runs and case-driven runs alike, newest activity first.
 * Documents, versions and the ledger of one order are read through the
 * existing `documents`, `document-versions` and `task-runs` routes.
 */

const orderItemSchema = z.object({
  orderRef: z.string(),
  brand: z.string(),
  documents: z.number().int(),
  taskRuns: z.number().int(),
  lastStep: z.string().nullable(),
  lastStatus: z.string().nullable(),
  totalPln: z.number(),
  firstRunAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['agency_research.documents.view'] },
}

export async function GET(request: Request): Promise<Response> {
  const auth = await getAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return NextResponse.json({ error: 'Organization scope is required' }, { status: 403 })
  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em')
  const orders = await listOrders(em, scope)
  const items = orders.map((order) => ({
    ...order,
    totalPln: Math.round(order.totalPln * 100) / 100,
    firstRunAt: order.firstRunAt ? order.firstRunAt.toISOString() : null,
    lastActivityAt: order.lastActivityAt ? order.lastActivityAt.toISOString() : null,
  }))
  return NextResponse.json({ items, total: items.length })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Research',
  methods: {
    GET: {
      summary: 'List the orders that have research documents or task runs',
      description: 'One row per order reference in the authenticated employee organization scope: document count, task runs, the last step and its status, spend and activity timestamps.',
      responses: [{ status: 200, schema: z.object({ items: z.array(orderItemSchema), total: z.number().int() }) }],
      errors: [
        { status: 401, description: 'Authentication required' },
        { status: 403, description: 'Organization scope required' },
      ],
    },
  },
}
