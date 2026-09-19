/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { loadSubmissionMaterial } from '../source'
import { createMaterialRevisionBinding } from '../binding'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../source', () => ({ loadSubmissionMaterial: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const material = { attachmentId: uuid(7), submissionId: uuid(1), fileName: 'client.txt', text: 'Evidence', submittedAt: '2026-09-19T10:00:00.000Z' }
const submission = { id: uuid(1), caseId: uuid(2), customerEntityId: uuid(3), tenantId: uuid(4), organizationId: uuid(5),
  workflowInstanceId: uuid(6), submittedByCustomerUserId: uuid(8), eventId: 'upload', original: { eventId: 'upload', materialAttachmentId: uuid(7) } }
const interpretation = { parts: [{ intent: 'material', summary: 'New evidence', rationale: 'Supplied file', needsClarification: false, recommendedDisposition: 'change' }],
  rationale: 'Review evidence', recommendedDisposition: 'change', responseMessage: null,
  materialDirective: { question: 'What does the file establish?', briefField: 'priority_offer' } }
const findById = jest.fn()
const container = { resolve: (key: string) => key === 'em' ? {} : { findById } }
const run = () => ({ id: uuid(10), input: { original: submission.original,
  materialContext: { material, brief: { versionId: uuid(9), clientViewMd: 'Brief' }, state: 'eligible' } },
  output: { kind: 'research', data: interpretation } })
beforeEach(() => {
  jest.clearAllMocks()
  findById.mockResolvedValue({ isActive: true, customerEntityId: uuid(3) })
  jest.mocked(loadSubmissionMaterial).mockResolvedValue(material)
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: uuid(11) } as never).mockResolvedValueOnce(run() as never)
})

test('binds the exact persisted native material directive, source and brief without treating evidence as client approval', async () => {
  const result = await createMaterialRevisionBinding(container as never).load(submission as never, interpretation)
  expect(result).toMatchObject({ orderRef: uuid(2), directive: interpretation.materialDirective,
    source: { submissionId: uuid(1), eventId: 'upload', customerUserId: uuid(8), workflowInstanceId: uuid(6) },
    materialContext: { material, brief: { versionId: uuid(9) } } })
})

test('rejects another native input source instead of trusting a model directive', async () => {
  const foreign = run()
  foreign.input.materialContext.material = { ...material, attachmentId: uuid(99) }
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValueOnce({ id: uuid(11) } as never).mockResolvedValueOnce(foreign as never)
  expect(await createMaterialRevisionBinding(container as never).load(submission as never, interpretation)).toBeNull()
})
