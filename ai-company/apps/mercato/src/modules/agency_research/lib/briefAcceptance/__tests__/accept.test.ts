/** @jest-environment node */
import { LockMode } from '@mikro-orm/core'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../../data/entities'
import { readBriefReview } from '../../briefReview/read'
import { acceptBrief } from '../accept'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../briefReview/read', () => ({ readBriefReview: jest.fn() }))

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const context = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3) }
const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
const request = { orderRef: uuid(4), documentId: uuid(5), versionId: uuid(6), customerUserId: uuid(7),
  source: { submissionId: uuid(8), eventId: 'portal-approval-1', workflowInstanceId: uuid(9), agentRunId: uuid(10), invitationTaskId: uuid(11) } }
const legacy = { person: 'Previous reviewer', at: '2026-01-01T00:00:00.000Z', scope: 'historical-note', version: '1.0' }
let document: AgencyResearchDocument
let version: AgencyResearchDocumentVersion
const flush = jest.fn()
const allowed = jest.fn()
const em: { fork: jest.Mock; transactional: jest.Mock; flush: jest.Mock } = {
  fork: jest.fn(), transactional: jest.fn(), flush,
}
const container = { resolve: (name: string) => name === 'em' ? em : { userHasAllFeatures: allowed } } as unknown as AppContainer
const review = { ...request, version: '2.0', templateId: 'WZR-BRIEF' as const, isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'draft', clientViewMd: '# Saved exact brief', questions: [],
  qa: { state: 'assessed' as const, taskRunId: uuid(12), status: 'done' as const, verdict: 'ready_for_approval' as const } }

beforeEach(() => {
  jest.clearAllMocks()
  document = Object.assign(new AgencyResearchDocument(), { ...scope, id: request.documentId, orderRef: request.orderRef, currentVersionId: request.versionId, status: 'ready_for_review' })
  version = Object.assign(new AgencyResearchDocumentVersion(), { ...scope, id: request.versionId, documentId: document.id, orderRef: request.orderRef, versionNo: 2, status: 'draft', approvalRecords: [legacy], data: { unchanged: true }, clientViewMd: review.clientViewMd })
  allowed.mockResolvedValue(true)
  em.fork.mockReturnValue(em)
  em.transactional.mockImplementation(async (run: (manager: typeof em) => Promise<unknown>) => run(em))
  jest.mocked(findOneWithDecryption).mockImplementation(async (_manager, entity, rawWhere) => {
    const where = rawWhere as Record<string, unknown>
    if (where.tenantId !== context.tenantId || where.organizationId !== context.organizationId || where.orderRef !== request.orderRef) return null
    if (entity === AgencyResearchDocument && where.id === document.id) return document as never
    if (entity === AgencyResearchDocumentVersion && where.id === version.id && where.documentId === document.id) return version as never
    return null
  })
  jest.mocked(readBriefReview).mockResolvedValue(review)
})

test('records one exact acceptance atomically, retaining prior history and unchanged brief content', async () => {
  const result = await acceptBrief(container, { context, request })
  expect(result).toMatchObject({ status: 'accepted', documentId: document.id, versionId: version.id, customerUserId: request.customerUserId, replayed: false, source: { kind: 'agency_brief_acceptance', ...request.source } })
  expect(version.approvalRecords).toEqual([legacy, { person: request.customerUserId, at: result.acceptedAt, scope: 'brief', version: '2.0', documentVersionId: version.id, source: result.source }])
  expect(version.data).toEqual({ unchanged: true })
  expect(version.clientViewMd).toBe(review.clientViewMd)
  expect([document.status, version.status]).toEqual(['approved', 'approved'])
  expect(flush).toHaveBeenCalledTimes(1)
  expect(findOneWithDecryption).toHaveBeenNthCalledWith(1, em, AgencyResearchDocument, expect.objectContaining({ ...scope, id: document.id }), { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
})

test('same persisted source replays its original timestamp without another record or write', async () => {
  const first = await acceptBrief(container, { context, request })
  document.currentVersionId = uuid(20)
  const second = await acceptBrief(container, { context, request })
  expect(second).toEqual({ ...first, replayed: true })
  expect(flush).toHaveBeenCalledTimes(1)
  expect(readBriefReview).toHaveBeenCalledTimes(1)
  expect(version.approvalRecords).toHaveLength(2)
})

test('a replay cannot replace the contact or persisted decision source', async () => {
  await acceptBrief(container, { context, request })
  await expect(acceptBrief(container, { context, request: { ...request, customerUserId: uuid(21) } })).rejects.toMatchObject({ status: 409 })
  await expect(acceptBrief(container, { context, request: { ...request, source: { ...request.source, agentRunId: uuid(22) } } })).rejects.toMatchObject({ status: 409 })
  expect(flush).toHaveBeenCalledTimes(1)
})

test('stale versions and missing readiness never mutate acceptance', async () => {
  document.currentVersionId = uuid(20)
  await expect(acceptBrief(container, { context, request })).rejects.toMatchObject({ status: 409 })
  document.currentVersionId = version.id
  document.status = 'draft'
  await expect(acceptBrief(container, { context, request })).rejects.toMatchObject({ status: 409 })
  expect(flush).not.toHaveBeenCalled()
})

test.each(['needs_client_data', 'needs_agent_fix'] as const)('QA %s cannot be promoted by the caller', async (verdict) => {
  jest.mocked(readBriefReview).mockResolvedValue({ ...review, qa: { ...review.qa, verdict } })
  await expect(acceptBrief(container, { context, request })).rejects.toMatchObject({ status: 409 })
  expect(version.approvalRecords).toEqual([legacy])
  expect(flush).not.toHaveBeenCalled()
})

test('foreign scope and foreign version cannot receive an acceptance record', async () => {
  await expect(acceptBrief(container, { context: { ...context, tenantId: uuid(30) }, request })).rejects.toMatchObject({ status: 404 })
  await expect(acceptBrief(container, { context, request: { ...request, versionId: uuid(31) } })).rejects.toMatchObject({ status: 404 })
  expect(flush).not.toHaveBeenCalled()
})

test('execution permission and durable source references are required; model booleans are not authority', async () => {
  allowed.mockResolvedValue(false)
  await expect(acceptBrief(container, { context, request })).rejects.toMatchObject({ status: 403 })
  allowed.mockResolvedValue(true)
  await expect(acceptBrief(container, { context, request: { ...request, source: undefined, approved: true } })).rejects.toThrow()
  expect(flush).not.toHaveBeenCalled()
})
