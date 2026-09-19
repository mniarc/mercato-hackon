import { z } from 'zod'
import { supplementaryMaterialResultSchema } from '@/modules/agency_operations/lib/contracts'
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
    if (form.has('process')) return Response.json({ error: translate('agency.materials.invalidProcess') }, { status: 400 })
    const parsed = portalMaterialRequestSchema.safeParse({
      caseId: form.get('caseId'), eventId: form.get('eventId'),
      ...(form.get('text') !== null ? { text: form.get('text') } : {}),
    })
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
        resourceKind: 'agency_operations:agency_client_submission', resourceId: parsed.data.caseId,
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
      guarded.data,
      file,
    )
    await guard.runAfterSuccess()
    return Response.json(result, { status: result.replayed ? 200 : 202 })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency',
  methods: { POST: {
    summary: 'Save supplementary material to an existing customer-owned case',
    description: 'Preserves the original purchase receipt. Saves a native private attachment and immutable client submission, then dispatches to native triage when configured. Does not start research or create another case.',
    requestBody: { contentType: 'multipart/form-data', schema: portalMaterialRequestSchema.extend({ file: z.string().meta({ format: 'binary' }) }) },
    responses: [200, 202].map((status) => ({ status, schema: supplementaryMaterialResultSchema })),
    errors: [{ status: 400, description: 'Invalid case, event or material' }, { status: 401, description: 'Customer authentication required' },
      { status: 403, description: 'Inactive or unlinked customer' }, { status: 404, description: 'Case not owned by this customer' },
      { status: 413, description: 'Attachment upload limit exceeded' }],
  } },
}
