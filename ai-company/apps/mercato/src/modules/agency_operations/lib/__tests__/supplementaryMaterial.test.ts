/** @jest-environment node */
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { createClientMaterialIntakeService } from '../clientMaterialIntakeService'

const findOne = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: (...args: unknown[]) => findOne(...args) }))
jest.mock('@open-mercato/shared/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    child: jest.fn().mockReturnThis(),
  }),
}))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const identity = { tenantId: uuid(1), organizationId: uuid(2), customerEntityId: uuid(3), customerUserId: uuid(4) }
const caseId = uuid(5), receiptId = uuid(6), attachmentId = uuid(7), submissionId = uuid(8)
const input = { identity, caseId, eventId: 'upload-1', text: '  My original material  ',
  file: { buffer: Buffer.from('raw material'), fileName: 'client.txt', mimeType: 'text/plain' } }
let saved: AgencyClientSubmission | null
let agencyCase: Record<string, unknown>
const createScoped = jest.fn(), submit = jest.fn(), findById = jest.fn(), processCase = jest.fn()
const tx = { create: jest.fn((_type, data) => Object.assign(new AgencyClientSubmission(), { id: submissionId, ...data })),
  persist: jest.fn((value) => { saved = value }) }
const services: Record<string, unknown> = { em: tx, attachmentService: { createScoped },
  customerUserService: { findById }, agencyCaseWorkflowService: { processCase }, agencyClientSubmissionService: { submit } }
const container = { resolve: (key: string) => services[key] }
beforeEach(() => {
  jest.clearAllMocks()
  saved = null
  agencyCase = { id: caseId, tenantId: identity.tenantId, organizationId: identity.organizationId,
    customerEntityId: identity.customerEntityId, deletedAt: null, materialAttachmentId: receiptId }
  findById.mockResolvedValue({ isActive: true, customerEntityId: identity.customerEntityId })
  findOne.mockImplementation((_em, entity, where) => {
    const row = entity === AgencyCase ? agencyCase : entity === AgencyClientSubmission ? saved : null
    return row && Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value) ? row : null
  })
  createScoped.mockImplementation(async (options) => { await options.persistLink(tx, attachmentId); return { id: attachmentId } })
  submit.mockResolvedValue({ item: { workflow: null }, replayed: true })
})

it('saves a supplementary native attachment and original submission without replacing the purchase receipt or creating a case', async () => {
  const result = await createClientMaterialIntakeService(container as never).submitSupplement(input)
  expect(result).toEqual({ caseId, attachmentId, submissionId, replayed: false, state: 'saved_waiting_for_triage' })
  expect(createScoped).toHaveBeenCalledWith(expect.objectContaining({
    entityId: 'agency_operations:agency_case', recordId: caseId, partitionCode: 'privateAttachments',
    assignments: [{ type: 'agency_operations:agency_case', id: caseId }], buffer: input.file.buffer,
  }))
  expect(saved!.original).toEqual({ eventId: input.eventId, text: input.text, materialAttachmentId: attachmentId })
  expect(agencyCase.materialAttachmentId).toBe(receiptId)
  expect(tx.create).toHaveBeenCalledWith(AgencyClientSubmission, expect.anything())
  expect(processCase).not.toHaveBeenCalled()
  expect(submit).toHaveBeenCalledWith(identity, caseId, expect.objectContaining(saved!.original), { requireNative: true, startPending: true })
})

it('replays the saved material without another upload and preserves it on a dispatch failure', async () => {
  const service = createClientMaterialIntakeService(container as never)
  await service.submitSupplement(input)
  submit.mockRejectedValueOnce(new Error('Native configuration unavailable'))
  const result = await service.submitSupplement({ ...input, text: 'Replacement' })
  expect(result).toMatchObject({ replayed: true, state: 'saved_dispatch_failed', submissionId, attachmentId })
  expect(createScoped).toHaveBeenCalledTimes(1)
  expect(saved!.original.text).toBe(input.text)
})

it('rejects a foreign case before storing bytes or a submission', async () => {
  agencyCase.customerEntityId = uuid(99)
  await expect(createClientMaterialIntakeService(container as never).submitSupplement(input)).rejects.toMatchObject({ status: 404 })
  expect(createScoped).not.toHaveBeenCalled()
  expect(submit).not.toHaveBeenCalled()
})
