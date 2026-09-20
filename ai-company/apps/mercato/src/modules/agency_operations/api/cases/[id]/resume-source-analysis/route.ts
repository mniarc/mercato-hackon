import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgencyCase } from '../../../../data/entities'
import { restartAnalysisCase } from '../../../../lib/analysisProcess/restart'
import { AGENCY_ANALYSIS_WORKFLOW_ID } from '../../../../lib/analysisProcess/workflow'
import { SOURCE_RESPONSE_STEP } from '../../../../lib/sourceClarification/contracts'
import { readCompletedSourceCorrection } from '../../../../lib/sourceClarification/recovery'

const pathSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ workflowInstanceId: z.uuid() }).strict()
const responseSchema = z.object({ caseId: z.uuid(), previousWorkflowInstanceId: z.uuid().nullable(),
  workflowInstanceId: z.uuid(), status: z.string(), currentStep: z.string() })

export const metadata = { POST: { requireAuth: true,
  requireFeatures: ['agency_operations.cases.view', 'agency_research.manage', 'workflows.manage'],
} }

export async function POST(req: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const params = pathSchema.safeParse(await context.params)
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(body)
  if (!params.success || !parsed.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
  const container = await createRequestContainer()
  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
  try {
    const guard = await runRouteMutationGuards({ container, req,
      auth: { ...scope, userId: auth.sub },
      input: { resourceKind: 'agency_operations:agency_case', resourceId: params.data.id, operation: 'update', mutationPayload: parsed.data },
    })
    if (!guard.ok) return guard.response
    const guarded = bodySchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
    const em = container.resolve<EntityManager>('em')
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: params.data.id, deletedAt: null }, undefined, scope)
    if (!agencyCase) return Response.json({ error: 'api.errors.notFound' }, { status: 404 })
    const workflow = agencyCase.workflowInstanceId === guarded.data.workflowInstanceId
      ? await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: guarded.data.workflowInstanceId,
        workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, status: 'COMPLETED', currentStepId: SOURCE_RESPONSE_STEP, deletedAt: null }, undefined, scope)
      : null
    if (!workflow || !await readCompletedSourceCorrection(em, scope, agencyCase, workflow)) {
      return Response.json({ error: 'agencyOperations.cases.process.sourceRecovery.unavailable' }, { status: 409 })
    }
    const result = await restartAnalysisCase(container, { ...scope, userId: auth.sub, caseId: agencyCase.id,
      expectedWorkflowInstanceId: workflow.id, resumeFrom: '3.2' })
    await guard.runAfterSuccess()
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = { tag: 'Agency Operations', pathParams: pathSchema, methods: {
  POST: { summary: 'Resume source analysis after a saved customer source correction',
    requestBody: { contentType: 'application/json', schema: bodySchema },
    responses: [{ status: 200, description: 'Source analysis resumed under its original configured policy', schema: responseSchema }],
    errors: [{ status: 400, description: 'Invalid request' }, { status: 401, description: 'Staff authentication required' },
      { status: 403, description: 'Insufficient native permissions' }, { status: 404, description: 'Case outside scope' },
      { status: 409, description: 'Source correction is absent, stale or no longer resumable' }],
  },
} }
