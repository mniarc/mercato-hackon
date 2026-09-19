import { z } from 'zod'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { demoPurchaseRequestSchema, demoPurchaseReceiptSchema } from '@/modules/agency_operations/lib/orderBootstrap/contracts'
import { readDemoOffer } from '@/modules/agency_operations/lib/orderBootstrap/demoOffer'
import { resolveDemoPurchase, readPurchaseBody } from '../../../lib/demoPurchaseBridge'
import { clientCaseErrorResponse, clientCaseResponseHeaders } from '../../../lib/clientCaseStatusBridge'

export const metadata = { GET: { requireAuth: false }, POST: { requireAuth: false } }

export async function GET(request: Request) {
  try {
    await resolveDemoPurchase(request)
    return Response.json(readDemoOffer(), { headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const { auth, identity, container, service } = await resolveDemoPurchase(request)
    const parsed = demoPurchaseRequestSchema.safeParse(await readPurchaseBody(request))
    if (!parsed.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const guard = await runRouteMutationGuards({
      container, req: request,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, userFeatures: auth.resolvedFeatures },
      input: { resourceKind: 'sales:sales_order', operation: 'create', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const guarded = demoPurchaseRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) throw new CrudHttpError(400, { error: 'api.errors.badRequest' })
    const result = await service.start(identity, guarded.data)
    await guard.runAfterSuccess()
    return Response.json(result, { status: 201, headers: clientCaseResponseHeaders })
  } catch (error) { return clientCaseErrorResponse(error) }
}

const errors = [{ status: 401, description: 'Customer session required' }, { status: 403, description: 'Linked active customer required or demo disabled' }]
export const openApi: OpenApiRouteDoc = {
  tag: 'Agency', methods: {
    GET: { summary: 'Read the server-owned demo offer and versioned terms', responses: [{ status: 200, schema: z.object({
      enabled: z.boolean(), demoOnly: z.literal(true), sku: z.string(), name: z.string(), amount: z.number(), currency: z.string(),
      offerVersion: z.string(), termsVersion: z.string(), terms: z.object({ en: z.string(), pl: z.string() }), provider: z.string(),
    }) }], errors },
    POST: { summary: 'Start a zero-charge native demo order and test payment', requestBody: { contentType: 'application/json', schema: demoPurchaseRequestSchema },
      responses: [{ status: 201, schema: demoPurchaseReceiptSchema }], errors: [...errors, { status: 400, description: 'Invalid purchase input' }, { status: 409, description: 'Offer or request conflict' }, { status: 413, description: 'Request exceeds 20 KB' }] },
  },
}
