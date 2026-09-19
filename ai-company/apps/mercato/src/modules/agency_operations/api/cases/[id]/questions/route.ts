import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { EMPLOYEE_QUESTION_SERVICE, employeeQuestionRequestSchema, type EmployeeQuestionService } from '../../../../lib/employeeQuestions/contracts'

const pathSchema = z.object({ id: z.uuid() })
const features = ['agency_operations.cases.view', 'customers.companies.view']
export const metadata = {
  GET: { requireAuth: true, requireFeatures: features },
  POST: { requireAuth: true, requireFeatures: [...features, 'agency_operations.cases.escalate'] },
}
type RouteContext = { params: Promise<{ id: string }> | { id: string } }

export async function GET(req: Request, context: RouteContext) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const params = pathSchema.safeParse(await context.params)
  if (!params.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
  try {
    const container = await createRequestContainer()
    const result = await container.resolve<EmployeeQuestionService>(EMPLOYEE_QUESTION_SERVICE).list({
      caseId: params.data.id, userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, roleNames: auth.roles ?? [],
    })
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export async function POST(req: Request, context: RouteContext) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const params = pathSchema.safeParse(await context.params)
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 }) }
  const parsed = employeeQuestionRequestSchema.safeParse(body)
  if (!params.success || !parsed.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
  const container = await createRequestContainer()
  try {
    const guard = await runRouteMutationGuards({ container, req,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId },
      input: { resourceKind: 'agency_operations:agency_case', resourceId: params.data.id, operation: 'update', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const input = employeeQuestionRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!input.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
    const result = await container.resolve<EmployeeQuestionService>(EMPLOYEE_QUESTION_SERVICE).ask({
      ...input.data, caseId: params.data.id, userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId, roleNames: auth.roles ?? [],
    })
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.replayed ? 200 : 201 })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = { tag: 'Agency Operations', pathParams: pathSchema, methods: {
  GET: { summary: 'Read employee questions and native task state for an owned case', responses: [{ status: 200, description: 'Questions linked to visible employee tasks' }] },
  POST: { summary: 'Ask the customer without resolving the employee exception', requestBody: { contentType: 'application/json', schema: employeeQuestionRequestSchema }, responses: [{ status: 201, description: 'Native customer task created' }, { status: 200, description: 'Existing question returned' }] },
} }
