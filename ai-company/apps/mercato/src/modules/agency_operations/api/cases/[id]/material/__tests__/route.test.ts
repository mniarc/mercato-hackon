/** @jest-environment node */

import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: jest.fn(),
}))

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(),
}))

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: jest.fn(),
}))

import * as route from '../route'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002'
const CASE_ID = '00000000-0000-4000-8000-000000000003'
const ATTACHMENT_ID = '00000000-0000-4000-8000-000000000004'
const auth = {
  sub: '00000000-0000-4000-8000-000000000005',
  tenantId: TENANT_ID,
  orgId: ORGANIZATION_ID,
  roles: ['employee'],
}

const getAuthMock = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>
const createContainerMock = createRequestContainer as jest.MockedFunction<typeof createRequestContainer>
const findCaseMock = findOneWithDecryption as jest.MockedFunction<typeof findOneWithDecryption>
const readScoped = jest.fn()
const resolve = jest.fn((name: string) => {
  if (name === 'em') return { id: 'em' }
  if (name === 'attachmentService') return { readScoped }
  throw new Error(`[internal] Unexpected container dependency: ${name}`)
})

function request(query = ''): Request {
  return new Request(`http://localhost/api/agency_operations/cases/${CASE_ID}/material${query}`)
}

function context(id = CASE_ID) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  jest.clearAllMocks()
  getAuthMock.mockResolvedValue(auth)
  createContainerMock.mockResolvedValue({ resolve } as never)
  findCaseMock.mockResolvedValue({ id: CASE_ID, materialAttachmentId: ATTACHMENT_ID } as never)
  readScoped.mockResolvedValue({
    buffer: Buffer.from('client brief'),
    contentType: 'application/pdf',
    contentDisposition: 'inline; filename="brief.pdf"',
    fileName: 'brief.pdf',
    mimeType: 'application/pdf',
  })
})

describe('agency case material route', () => {
  it('requires employee authentication and the agency case view feature', () => {
    expect(route.metadata).toEqual({
      GET: {
        requireAuth: true,
        requireFeatures: ['agency_operations.cases.view'],
      },
    })
  })

  it('loads the scoped case and reads only its privately assigned attachment', async () => {
    const response = await route.GET(request('?download=1'), context())

    expect(findCaseMock).toHaveBeenCalledWith(
      { id: 'em' },
      expect.any(Function),
      {
        id: CASE_ID,
        tenantId: TENANT_ID,
        organizationId: ORGANIZATION_ID,
        deletedAt: null,
      },
      undefined,
      { tenantId: TENANT_ID, organizationId: ORGANIZATION_ID },
    )
    expect(readScoped).toHaveBeenCalledWith({
      attachmentId: ATTACHMENT_ID,
      auth,
      expectedOwner: {
        entityId: 'agency_operations:agency_case',
        recordId: CASE_ID,
      },
      expectedAssignment: {
        type: 'agency_operations:agency_case',
        id: CASE_ID,
      },
      expectedPartitionCode: 'privateAttachments',
      requirePrivatePartition: true,
      forceDownload: true,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe('inline; filename="brief.pdf"')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('client brief')
  })

  it('fails closed before attachment access when the scoped case or material is missing', async () => {
    findCaseMock.mockResolvedValueOnce(null)
    const missingCaseResponse = await route.GET(request(), context())

    expect(missingCaseResponse.status).toBe(404)
    expect(readScoped).not.toHaveBeenCalled()

    findCaseMock.mockResolvedValueOnce({ id: CASE_ID, materialAttachmentId: null } as never)
    const missingMaterialResponse = await route.GET(request(), context())

    expect(missingMaterialResponse.status).toBe(404)
    expect(readScoped).not.toHaveBeenCalled()
  })

  it('returns attachment-service access failures without weakening them', async () => {
    readScoped.mockRejectedValueOnce(new CrudHttpError(404, { error: 'Attachment not found' }))

    const response = await route.GET(request(), context())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Attachment not found' })
  })

  it('does not create a container or query data for an unauthenticated request', async () => {
    getAuthMock.mockResolvedValueOnce(null)

    const response = await route.GET(request(), context())

    expect(response.status).toBe(401)
    expect(createContainerMock).not.toHaveBeenCalled()
    expect(findCaseMock).not.toHaveBeenCalled()
    expect(readScoped).not.toHaveBeenCalled()
  })
})
