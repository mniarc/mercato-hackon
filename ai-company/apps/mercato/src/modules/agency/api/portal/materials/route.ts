import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { submitPortalMaterial } from '../../../lib/materialIntakeBridge'

export const metadata = { POST: { requireAuth: false } }

const titleSchema = z.object({ title: z.string().trim().min(1).max(200) })

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
    const parsed = titleSchema.safeParse({ title: form.get('title') })
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
    const guarded = titleSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) {
      return Response.json({ error: translate('agency.materials.invalid') }, { status: 400 })
    }
    const result = await submitPortalMaterial(
      container,
      { ...auth, customerEntityId: auth.customerEntityId },
      guarded.data.title,
      file,
    )
    await guard.runAfterSuccess()
    return Response.json(result, { status: 201 })
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
        schema: titleSchema.extend({ file: z.string().meta({ format: 'binary' }) }),
      },
      responses: [{
        status: 201,
        schema: z.object({ caseId: z.uuid(), workflowInstanceId: z.uuid(), status: z.literal('COMPLETED') }),
      }],
      errors: [
        { status: 400, description: 'Invalid title or material' },
        { status: 401, description: 'Customer authentication required' },
        { status: 403, description: 'Customer account not linked or mutation denied' },
        { status: 413, description: 'Attachment upload limit exceeded' },
      ],
    },
  },
}
