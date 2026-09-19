/** @jest-environment node */
import { AgencyCase } from '../../../data/entities'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { prepareMaterialContext } from '../source'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const submission = { id: uuid(1), caseId: uuid(2), customerEntityId: uuid(3), tenantId: uuid(4), organizationId: uuid(5),
  workflowInstanceId: uuid(6), createdAt: new Date('2026-09-19T10:00:00Z'), original: { eventId: 'upload', materialAttachmentId: uuid(7) } }
const readScoped = jest.fn(), status = jest.fn(), getBriefReview = jest.fn()
const services: Record<string, unknown> = { em: {}, attachmentService: { readScoped }, agencyResearchService: { status, getBriefReview } }
const container = { resolve: (key: string) => services[key] }
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity) => {
    if (entity === AgencyCase) return { materialAttachmentId: uuid(99) } as never
    if (entity === WorkflowInstance) return { id: uuid(6) } as never
    return null
  })
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(uuid(8))
  readScoped.mockResolvedValue({ fileName: 'client.txt', extractedText: '  Saved file evidence  ' })
  status.mockResolvedValue({ documents: [{ templateId: 'WZR-BRIEF', versionId: uuid(9) }] })
  getBriefReview.mockResolvedValue({ versionId: uuid(9), clientViewMd: 'Original brief', isCurrent: true,
    documentStatus: 'ready_for_review', versionStatus: 'ready_for_review' })
})

test('supplies native private extracted evidence with exact submission provenance, not raw file parsing', async () => {
  const result = await prepareMaterialContext(container as never, submission as never)
  expect(result).toEqual({ state: 'eligible', brief: { versionId: uuid(9), clientViewMd: 'Original brief' },
    material: { attachmentId: uuid(7), submissionId: uuid(1), fileName: 'client.txt', text: '  Saved file evidence  ', submittedAt: '2026-09-19T10:00:00.000Z' } })
  expect(readScoped).toHaveBeenCalledWith({ attachmentId: uuid(7), auth: { sub: uuid(8), tenantId: uuid(4), orgId: uuid(5) },
    expectedOwner: { entityId: 'agency_operations:agency_case', recordId: uuid(2) },
    expectedAssignment: { type: 'agency_operations:agency_case', id: uuid(2) },
    expectedPartitionCode: 'privateAttachments', requirePrivatePartition: true })
})

test('keeps non-material input unchanged and approved foundations outside evidence revision', async () => {
  await expect(prepareMaterialContext(container as never, { ...submission, original: { eventId: 'message', text: 'Hello' } } as never)).resolves.toBeUndefined()
  expect(readScoped).not.toHaveBeenCalled()
  getBriefReview.mockResolvedValue({ versionId: uuid(9), clientViewMd: 'Approved brief', isCurrent: true, documentStatus: 'approved', versionStatus: 'approved' })
  expect(await prepareMaterialContext(container as never, submission as never)).toMatchObject({ state: 'impact_review_required' })
})
