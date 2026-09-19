import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../../data/entities'
import { readEligiblePair } from '../read'
import { acceptStrategyPair } from '../accept'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../read', () => ({ ...jest.requireActual('../read'), readEligiblePair: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const context = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3) }
const request = { orderRef: uuid(4), pair: { strategy: { documentId: uuid(5), versionId: uuid(6) }, tov: { documentId: uuid(7), versionId: uuid(8) } },
  approvedDocuments: ['strategy'] as ('strategy' | 'tov')[], customerUserId: uuid(9),
  source: { submissionId: uuid(10), eventId: 'approval', workflowInstanceId: uuid(11), agentRunId: uuid(12), invitationTaskId: uuid(13) } }
const brief = { id: uuid(14), currentVersionId: uuid(15) }
const legacy = { scope: 'note', text: 'Keep prior history' }
let documents: Record<string, AgencyResearchDocument>
let versions: Record<string, AgencyResearchDocumentVersion>
const flush = jest.fn(), allowed = jest.fn()
const em = { fork: jest.fn(), transactional: jest.fn(), flush }
const container = { resolve: (key: string) => key === 'em' ? em : { userHasAllFeatures: allowed } } as unknown as AppContainer
beforeEach(() => {
  jest.clearAllMocks()
  em.fork.mockReturnValue(em); em.transactional.mockImplementation(async (fn) => fn(em)); allowed.mockResolvedValue(true)
  documents = Object.fromEntries(['strategy', 'tov'].map((kind) => { const ref = request.pair[kind as 'strategy' | 'tov']; return [kind, Object.assign(new AgencyResearchDocument(), { id: ref.documentId, currentVersionId: ref.versionId, status: 'ready_for_review' })] }))
  versions = Object.fromEntries(['strategy', 'tov'].map((kind) => { const ref = request.pair[kind as 'strategy' | 'tov']; return [kind, Object.assign(new AgencyResearchDocumentVersion(), { id: ref.versionId, documentId: ref.documentId, versionNo: 1, status: 'ready_for_review', approvalRecords: [legacy], data: { unchanged: true } })] }))
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, rawWhere) => {
    const where = rawWhere as Record<string, unknown>
    if (where.tenantId !== context.tenantId || where.organizationId !== context.organizationId || where.orderRef !== request.orderRef) return null
    if (entity === AgencyResearchDocument && where.templateId === 'WZR-BRIEF') return brief as never
    const rows = entity === AgencyResearchDocument ? documents : entity === AgencyResearchDocumentVersion ? versions : {}
    return (Object.values(rows).find((row) => row.id === where.id) ?? null) as never
  })
  jest.mocked(readEligiblePair).mockImplementation(async () => ({ eligible: true, qaTaskRunId: uuid(16), pair: {
    orderRef: request.orderRef, brief: { documentId: brief.id, versionId: brief.currentVersionId },
    strategy: { documentId: documents.strategy.id, versionId: versions.strategy.id, version: '1.0' },
    tov: { documentId: documents.tov.id, versionId: versions.tov.id, version: '1.0' },
  } } as never))
})

test('partial approval appends only selected exact version, never both', async () => {
  const receipt = await acceptStrategyPair(container, { context, request })
  expect(receipt).toMatchObject({ status: 'recorded', approvedDocuments: ['strategy'], replayed: false })
  expect(receipt.records).toHaveLength(1)
  expect(receipt.records[0]).toMatchObject({ scope: 'strategy', documentVersionId: versions.strategy.id, pair: request.pair, briefVersionId: brief.currentVersionId, person: request.customerUserId, source: { ...request.source, kind: 'agency_strategy_pair_acceptance' } })
  expect(versions.strategy.status).toBe('approved'); expect(versions.tov.status).toBe('ready_for_review')
  expect(versions.tov.approvalRecords).toEqual([legacy]); expect(versions.strategy.data).toEqual({ unchanged: true })
  expect(flush).toHaveBeenCalledTimes(1)
})

test('both explicitly selected documents are recorded atomically in one flush', async () => {
  const receipt = await acceptStrategyPair(container, { context, request: { ...request, approvedDocuments: ['strategy', 'tov'] } })
  expect(receipt.records).toHaveLength(2)
  expect(versions.strategy.status).toBe('approved'); expect(versions.tov.status).toBe('approved')
  expect(flush).toHaveBeenCalledTimes(1)
})

test('exact replay returns recorded source even after currentness changes, without reinterpreting selection', async () => {
  const first = await acceptStrategyPair(container, { context, request })
  documents.strategy.currentVersionId = uuid(99)
  jest.mocked(readEligiblePair).mockResolvedValue({ eligible: false, reason: 'pair_not_current' })
  await expect(acceptStrategyPair(container, { context, request })).resolves.toEqual({ ...first, replayed: true })
  await expect(acceptStrategyPair(container, { context, request: { ...request, approvedDocuments: ['strategy', 'tov'] } })).rejects.toMatchObject({ status: 409 })
  expect(flush).toHaveBeenCalledTimes(1)
})

test('linked second decision records the other document without overwriting first history', async () => {
  const first = await acceptStrategyPair(container, { context, request })
  const second = await acceptStrategyPair(container, { context, request: { ...request, approvedDocuments: ['tov'], source: { ...request.source, submissionId: uuid(90), eventId: 'second' } } })
  expect(second.records[0].scope).toBe('tov')
  expect(versions.strategy.approvalRecords).toEqual([legacy, first.records[0]])
  expect(versions.tov.status).toBe('approved')
})

test.each(['pair_not_current', 'pair_qa_not_ready', 'brief_not_current_or_accepted'] as const)('rejects %s before any approval write', async (reason) => {
  jest.mocked(readEligiblePair).mockResolvedValue({ eligible: false, reason })
  await expect(acceptStrategyPair(container, { context, request })).rejects.toMatchObject({ status: 409 })
  expect(flush).not.toHaveBeenCalled()
  expect(versions.strategy.approvalRecords).toEqual([legacy])
})

test('enforces native execution permission and tenant scope', async () => {
  allowed.mockResolvedValue(false)
  await expect(acceptStrategyPair(container, { context, request })).rejects.toMatchObject({ status: 403 })
  allowed.mockResolvedValue(true)
  await expect(acceptStrategyPair(container, { context: { ...context, tenantId: uuid(99) }, request })).rejects.toMatchObject({ status: 404 })
  expect(flush).not.toHaveBeenCalled()
})
