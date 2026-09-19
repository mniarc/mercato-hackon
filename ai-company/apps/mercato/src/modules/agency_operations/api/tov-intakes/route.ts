import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  STAFF_TOV_INTAKE_SERVICE,
  staffTovIntakeRequestSchema,
  staffTovIntakeStatusSchema,
  type StaffTovIntakeService,
} from '../../lib/tovIntake/contracts'

const features = ['agency_operations.cases.view', 'customers.companies.view', 'agency_tov.manage']
export const metadata = { POST: { requireAuth: true, requireFeatures: features } }

export async function POST(req: Request): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return Response.json({ error: 'api.errors.unauthorized' }, { status: 401 })
  if (!auth.tenantId || !auth.orgId) return Response.json({ error: 'api.errors.forbidden' }, { status: 403 })
  const container = await createRequestContainer()
  const attachments = container.resolve<AttachmentService>('attachmentService')
  if (!attachments.readUploadForm) throw new Error('[internal] Bounded attachment upload reader is unavailable')
  try {
    const form = await attachments.readUploadForm(req)
    const parsed = staffTovIntakeRequestSchema.safeParse({
      caseId: form.get('caseId'), eventId: form.get('eventId'), brand: form.get('brand'), outputLanguage: form.get('outputLanguage'),
    })
    const file = form.get('file')
    if (!parsed.success || !file || typeof file === 'string' || file.size === 0) {
      return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
    }
    attachments.validateUpload({ fileName: file.name, fileSize: file.size })
    const guard = await runRouteMutationGuards({
      container, req,
      auth: { userId: auth.sub, tenantId: auth.tenantId, organizationId: auth.orgId },
      input: {
        resourceKind: 'agency_operations:agency_case', resourceId: parsed.data.caseId,
        operation: 'update', mutationPayload: parsed.data,
      },
    })
    if (!guard.ok) return guard.response
    const guarded = staffTovIntakeRequestSchema.safeParse({ ...parsed.data, ...guard.modifiedPayload })
    if (!guarded.success) return Response.json({ error: 'api.errors.invalidRequest' }, { status: 400 })
    const result = await container.resolve<StaffTovIntakeService>(STAFF_TOV_INTAKE_SERVICE).start({
      ...guarded.data,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      userId: auth.sub,
      file: { buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, mimeType: file.type || 'application/json' },
    })
    await guard.runAfterSuccess()
    return Response.json(result, {
      status: result.replayed ? 200 : 202,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Operations',
  methods: { POST: {
    summary: 'Start the configured native tone-of-voice specialist for a paid agency case',
    description: 'Staff-only. Pins a normalized public-post corpus to the existing paid case without replacing its original material or impersonating its customer.',
    requestBody: { contentType: 'multipart/form-data', schema: staffTovIntakeRequestSchema.extend({ file: z.string().meta({ format: 'binary' }) }) },
    responses: [{ status: 202, description: 'Native workflow accepted', schema: staffTovIntakeStatusSchema },
      { status: 200, description: 'Existing idempotent intake returned', schema: staffTovIntakeStatusSchema }],
    errors: [{ status: 400, description: 'Invalid normalized corpus or request' }, { status: 401, description: 'Staff authentication required' },
      { status: 403, description: 'Insufficient staff permissions' }, { status: 404, description: 'Paid case not found in scope' },
      { status: 409, description: 'Paid case or native ToV workflow is not eligible/configured' }],
  } },
}
