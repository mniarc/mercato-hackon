import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AgencyCase } from '../../../../data/entities'
import {
  AGENCY_CASE_ATTACHMENT_ENTITY_ID,
  AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
} from '../../../../lib/contracts'

type RouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

const pathParamsSchema = z.object({ id: z.string().uuid() })
const binaryResponseSchema = z.unknown().describe('Binary file content')
const errorResponseSchema = z.object({ error: z.string() })

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['agency_operations.cases.view'],
  },
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const params = pathParamsSchema.safeParse(await context.params)
    if (!params.success) {
      return NextResponse.json({ error: 'Invalid agency case id' }, { status: 400 })
    }

    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!auth.tenantId || !auth.orgId) {
      return NextResponse.json({ error: 'Organization scope is required' }, { status: 403 })
    }

    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }
    const agencyCase = await findOneWithDecryption(
      em,
      AgencyCase,
      {
        id: params.data.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      },
      undefined,
      scope,
    )
    if (!agencyCase || !agencyCase.materialAttachmentId) {
      return NextResponse.json({ error: 'Agency case material not found' }, { status: 404 })
    }

    const attachmentService = container.resolve<AttachmentService>('attachmentService')
    const result = await attachmentService.readScoped({
      attachmentId: agencyCase.materialAttachmentId,
      auth,
      expectedOwner: {
        entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID,
        recordId: agencyCase.id,
      },
      expectedAssignment: {
        type: AGENCY_CASE_ATTACHMENT_ENTITY_ID,
        id: agencyCase.id,
      },
      expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
      requirePrivatePartition: true,
      forceDownload: new URL(request.url).searchParams.get('download') === '1',
    })

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Type': result.contentType,
        'Content-Disposition': result.contentDisposition,
        'Content-Length': String(result.buffer.length),
        Expires: '0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (isCrudHttpError(error)) {
      return NextResponse.json(error.body, { status: error.status })
    }
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Agency Operations',
  summary: 'Read agency case material',
  pathParams: pathParamsSchema,
  methods: {
    GET: {
      summary: 'Read material attached to an agency case',
      responses: [
        { status: 200, description: 'Agency case material bytes', schema: binaryResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Invalid agency case id', schema: errorResponseSchema },
        { status: 401, description: 'Authentication required', schema: errorResponseSchema },
        { status: 403, description: 'Agency case or attachment scope is forbidden', schema: errorResponseSchema },
        { status: 404, description: 'Agency case material not found', schema: errorResponseSchema },
        { status: 500, description: 'Attachment partition is unavailable', schema: errorResponseSchema },
      ],
    },
  },
}

const route = { GET }

export default route
