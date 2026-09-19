/** @jest-environment node */
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { loadCaseMaterialSources } from '../materialSources'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const caseId = uuid(3), customerEntityId = uuid(4), userId = uuid(5), receiptId = uuid(6), materialId = uuid(7)
const readScoped = jest.fn()
const container = { resolve: (name: string) => name === 'attachmentService' ? { readScoped } : {} }
const submittedAt = new Date('2026-09-19T12:00:00.000Z')
function submission(id: number, attachmentId?: string) {
  return { id: uuid(id), ...scope, customerEntityId, caseId, channel: 'portal', deletedAt: null,
    original: { ...(attachmentId ? { materialAttachmentId: attachmentId } : {}), text: 'Original customer words' }, createdAt: submittedAt }
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(findOneWithDecryption).mockResolvedValue({ id: caseId, ...scope, customerEntityId, materialAttachmentId: receiptId } as never)
  jest.mocked(findWithDecryption).mockResolvedValue([submission(8, materialId)] as never)
  readScoped.mockResolvedValue({ fileName: 'evidence.pdf', extractedText: '  Real native extracted text.  ', buffer: Buffer.from('unused raw bytes') })
})

it('loads one private case-bound source with original submission provenance, never the primary receipt or duplicate references', async () => {
  jest.mocked(findWithDecryption).mockResolvedValue([
    submission(8, receiptId), submission(9, materialId), submission(10, materialId), submission(11),
  ] as never)
  await expect(loadCaseMaterialSources(container as never, scope, caseId, userId)).resolves.toEqual([{
    attachmentId: materialId, submissionId: uuid(9), fileName: 'evidence.pdf', submittedAt: submittedAt.toISOString(), text: '  Real native extracted text.  ',
  }])
  expect(findOneWithDecryption).toHaveBeenCalledWith(expect.anything(), AgencyCase, { ...scope, id: caseId, deletedAt: null }, undefined, scope)
  expect(findWithDecryption).toHaveBeenCalledWith(expect.anything(), AgencyClientSubmission,
    { ...scope, customerEntityId, caseId, channel: 'portal', deletedAt: null }, { orderBy: { createdAt: 'asc', id: 'asc' } }, scope)
  expect(readScoped).toHaveBeenCalledTimes(1)
  expect(readScoped).toHaveBeenCalledWith({ attachmentId: materialId, auth: { sub: userId, tenantId: scope.tenantId, orgId: scope.organizationId },
    expectedOwner: { entityId: 'agency_operations:agency_case', recordId: caseId },
    expectedAssignment: { type: 'agency_operations:agency_case', id: caseId }, expectedPartitionCode: 'privateAttachments', requirePrivatePartition: true })
})

it('reports unextracted material as unavailable without interpreting raw bytes or the client message as file content', async () => {
  readScoped.mockResolvedValue({ fileName: 'image.png', extractedText: null, buffer: Buffer.from('not extracted') })
  await expect(loadCaseMaterialSources(container as never, scope, caseId, userId)).resolves.toEqual([{
    attachmentId: materialId, submissionId: uuid(8), fileName: 'image.png', submittedAt: submittedAt.toISOString(), text: null,
  }])
})

it('fails closed for an absent scoped case or a foreign attachment reference', async () => {
  jest.mocked(findOneWithDecryption).mockResolvedValueOnce(null)
  await expect(loadCaseMaterialSources(container as never, scope, caseId, userId)).rejects.toMatchObject({ status: 404 })
  expect(readScoped).not.toHaveBeenCalled()
  readScoped.mockRejectedValueOnce({ status: 404 })
  await expect(loadCaseMaterialSources(container as never, scope, caseId, userId)).rejects.toMatchObject({ status: 404 })
})
