import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { portalMaterialRequestSchema } from '../../../data/validators'
import { submitPortalMaterial } from '../../../lib/materialIntakeBridge'

export const metadata = { POST: { requireAuth: false } }

export async function POST(req: Request) {
  const { translate } = await resolveTranslations()
  const auth = await getCustomerAuthFromRequest(req)
  if (!auth) {
    return Response.json({ error: translate('agency.materials.unauthorized') }, { status: 401 })
  }
  if (!auth.customerEntityId) {
    return Response.json({ error: translate('agency.materials.unlinked') }, { status: 403 })
  }
  const container = await createRequestContainer()
  const attachments = container.resolve<AttachmentService>('attachmentService')
  if (!attachments.readUploadForm) throw new Error('[internal] Bounded attachment upload reader is unavailable')

  try {
    const form = await attachments.readUploadForm(req)
    const processField = form.get('process')
    let process: unknown
    if (processField !== null) {
      if (typeof processField !== 'string') {
        return Response.json({ error: translate('agency.materials.invalidProcess') }, { status: 400 })
      }
      try {
        process = JSON.parse(processField)
      } catch {
        return Response.json({ error: translate('agency.materials.invalidProcess') }, { status: 400 })
      }
    }
    const parsed = portalMaterialRequestSchema.safeParse({ title: form.get('title'), process })
    const file = form.get('file')
    if (!parsed.success || !file || typeof file === 'string' || file.size === 0) {
      return Response.json({ error: translate('agency.materials.invalid') }, { status: 400 })
    }
    attachments.validateUpload({ fileName: file.name, fileSize: file.size })
    const guard = await runRouteMutationGuards({
      container,
      req,
      auth: {
        userId: auth.sub,
        tenantId: auth.tenantId,
        organizationId: auth.orgId,
        userFeatures: auth.resolvedFeatures,
      },
      input: {
        resourceKind: 'agency_operations:agency_case',
        operation: 'create',
        mutationPayload: parsed.data,
      },
    })
    if (!guard.ok) return guard.response
    const guarded = portalMaterialRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) {
      return Response.json({ error: translate('agency.materials.invalid') }, { status: 400 })
    }
    const result = await submitPortalMaterial(
      container,
      { ...auth, customerEntityId: auth.customerEntityId },
      guarded.data.title,
      file,
      guarded.data.process,
    )
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.status === 'COMPLETED' ? 201 : 202 })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency',
  methods: {
    POST: {
      summary: 'Submit material for the signed-in customer',
      requestBody: {
        contentType: 'multipart/form-data',
        schema: z.object({
          title: z.string().min(1).max(200),
          file: z.string().meta({ format: 'binary' }),
          process: z.string().optional().describe('JSON object: {kind:"tone_of_voice",brand:string,outputLanguage:"en"|"pl"} or {kind:"analysis"} using the configured staff execution policy. Omit for deterministic intake.'),
        }),
      },
      responses: [{
        status: 201,
        schema: z.object({ caseId: z.uuid(), workflowInstanceId: z.uuid(), status: z.literal('COMPLETED') }),
      }, {
        status: 202,
        schema: z.object({
          caseId: z.uuid(), workflowInstanceId: z.uuid(),
          status: z.enum(['RUNNING', 'WAITING_FOR_ACTIVITIES', 'PAUSED', 'FAILED', 'CANCELLED']),
        }),
      }],
      errors: [
        { status: 400, description: 'Invalid title or material' },
        { status: 401, description: 'Customer authentication required' },
        { status: 403, description: 'Customer account not linked or mutation denied' },
        { status: 413, description: 'Attachment upload limit exceeded' },
        { status: 503, description: 'Requested process is not configured or enabled' },
      ],
    },
  },
}
