/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../../data/entities'
import { documentIdFor } from '../../research/envelope'
import { acceptPost } from '../accept'
import { readPostAcceptance } from '../read'
import type { AcceptPostInput } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const input: AcceptPostInput = { context: { ...scope, userId: uuid(3) }, request: { orderRef: 'case', documentId: uuid(4), versionId: uuid(5), customerUserId: uuid(6),
  source: { submissionId: uuid(7), eventId: 'approve-content', workflowInstanceId: uuid(8), agentRunId: uuid(9), invitationTaskId: uuid(10) } } }
const flush = jest.fn()
const em: EntityManager = { flush, transactional: (work: (manager: EntityManager) => Promise<unknown>) => work(em) } as unknown as EntityManager
let document: AgencyResearchDocument
let version: AgencyResearchDocumentVersion
let runs: Record<string, unknown>[]
const read = () => readPostAcceptance(em, scope, { orderRef: 'case', postVersionId: version.id })

beforeEach(() => {
  jest.clearAllMocks()
  document = Object.assign(new AgencyResearchDocument(), { ...scope, orderRef: 'case', id: uuid(4), templateId: 'WZR-POST', deletedAt: null, currentVersionId: uuid(5), status: 'ready_for_review' })
  version = Object.assign(new AgencyResearchDocumentVersion(), { ...scope, orderRef: 'case', id: uuid(5), documentId: uuid(4), templateId: 'WZR-POST', versionNo: 2, status: 'ready_for_review', simulationFlag: false, clientViewMd: 'Exact full post text.', data: { body: 'Exact full post text.' }, approvalRecords: [] })
  const brief = Object.assign(new AgencyResearchDocument(), { ...scope, orderRef: 'case', id: uuid(11), templateId: 'WZR-BRIEF', deletedAt: null })
  runs = [{ id: uuid(20), status: 'done', outputVersionId: version.id, qaResult: { verdict: 'pass_for_draft' }, inputVersions: [] }]
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    const candidates = entity === AgencyResearchDocument ? [document, brief] : [version]
    return (candidates.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
})

test('records exact current content and positive QA, never publication consent or a new content version', async () => {
  const bytes = version.clientViewMd
  const data = version.data
  const receipt = await acceptPost(em, input)
  expect(receipt).toMatchObject({ status: 'post_accepted', replayed: false, record: { scope: 'post_content', documentVersionId: version.id, version: '2.0', qaTaskRunId: uuid(20), source: { kind: 'agency_post_acceptance' } } })
  expect(Object.keys(receipt.record).sort()).toEqual(['at', 'documentId', 'documentVersionId', 'person', 'qaTaskRunId', 'scope', 'source', 'version'])
  expect(version.clientViewMd).toBe(bytes)
  expect(version.data).toBe(data)
  expect(version.versionNo).toBe(2)
  expect(version.status).toBe('approved')
  expect(await read()).toMatchObject({ status: 'ready', receipt: receipt.record })
  for (const call of jest.mocked(findOneWithDecryption).mock.calls) expect(call[2]).toMatchObject({ ...scope, orderRef: 'case' })
})
test('same original replays once and cannot be reassigned to a different actor or origin', async () => {
  const receipt = await acceptPost(em, input)
  expect(await acceptPost(em, input)).toEqual({ ...receipt, replayed: true })
  await expect(acceptPost(em, { ...input, request: { ...input.request, customerUserId: uuid(30) } })).rejects.toMatchObject({ status: 409 })
  await expect(acceptPost(em, { ...input, request: { ...input.request, source: { ...input.request.source, eventId: 'another-origin' } } })).rejects.toMatchObject({ status: 409 })
  expect(flush).toHaveBeenCalledTimes(1)
})
test('stale version never approves replacement; its saved historical receipt can replay', async () => {
  const receipt = await acceptPost(em, input)
  document.currentVersionId = uuid(31)
  expect(await read()).toMatchObject({ status: 'not_ready', reason: 'post_not_current' })
  expect(await acceptPost(em, input)).toEqual({ ...receipt, replayed: true })
  await expect(acceptPost(em, { ...input, request: { ...input.request, source: { ...input.request.source, submissionId: uuid(32) } } })).rejects.toMatchObject({ status: 409 })
})
test('foreign scope and document identity are rejected', async () => {
  await expect(acceptPost(em, { ...input, context: { ...input.context, tenantId: uuid(33) } })).rejects.toMatchObject({ status: 404 })
  await expect(acceptPost(em, { ...input, request: { ...input.request, documentId: uuid(34) } })).rejects.toMatchObject({ status: 404 })
  expect(flush).not.toHaveBeenCalled()
})
test.each(['failed', 'running'])('a newer exact QA %s blocks an older positive result', async (status) => {
  runs.unshift({ id: uuid(40), status, outputVersionId: null, qaResult: null,
    inputVersions: [{ document_id: documentIdFor('WZR-POST', 'case'), version: '2.0' }] })
  expect(await read()).toMatchObject({ status: 'not_ready', reason: 'post_qa_not_ready' })
  await expect(acceptPost(em, input)).rejects.toMatchObject({ status: 409 })
  expect(flush).not.toHaveBeenCalled()
})
test('simulated or unreviewed content cannot acquire acceptance', async () => {
  version.simulationFlag = true
  expect(await read()).toMatchObject({ status: 'not_ready', reason: 'post_not_reviewable' })
  version.simulationFlag = false
  runs = []
  expect(await read()).toMatchObject({ status: 'not_ready', reason: 'post_qa_not_ready' })
  expect(flush).not.toHaveBeenCalled()
})
test('conditional message and publication fields are not accepted by this content mutation', async () => {
  await expect(acceptPost(em, { ...input, request: { ...input.request, body: 'Approve, but change the ending' } })).rejects.toBeDefined()
  await expect(acceptPost(em, { ...input, request: { ...input.request, publicationConsent: true } })).rejects.toBeDefined()
  expect(flush).not.toHaveBeenCalled()
})
