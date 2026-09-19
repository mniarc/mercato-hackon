import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { readStrategyReview } from '../../strategyReview/read'
import { readBriefAcceptance } from '../../briefAcceptance/read'
import { matchingPairAcceptance, readStrategyPairAcceptance } from '../read'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../strategyReview/read', () => ({ readStrategyReview: jest.fn() }))
jest.mock('../../briefAcceptance/read', () => ({ readBriefAcceptance: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const input = { orderRef: uuid(3), strategyVersionId: uuid(4), tovVersionId: uuid(5) }
const base = { version: '1.0', isCurrent: true, documentStatus: 'approved', versionStatus: 'approved', simulationFlag: false, clientViewMd: 'Content' }
const pair = {
  orderRef: input.orderRef, strategy: { ...base, documentId: uuid(6), versionId: input.strategyVersionId, templateId: 'WZR-STRATEGIA' as const },
  tov: { ...base, documentId: uuid(7), versionId: input.tovVersionId, templateId: 'WZR-TOV' as const },
  brief: { ...base, documentId: uuid(8), versionId: uuid(9) }, tovUsesStrategy: true,
  qa: { state: 'assessed' as const, taskRunId: uuid(10), status: 'done' as const, verdict: 'ready_for_approval' as const },
}
const record = (kind: 'strategy' | 'tov') => ({
  person: uuid(11), at: '2026-09-19T10:00:00.000Z', scope: kind, version: '1.0', documentVersionId: pair[kind].versionId,
  briefVersionId: pair.brief.versionId, approvedDocuments: [kind],
  pair: { strategy: { documentId: pair.strategy.documentId, versionId: pair.strategy.versionId }, tov: { documentId: pair.tov.documentId, versionId: pair.tov.versionId } },
  source: { kind: 'agency_strategy_pair_acceptance', submissionId: uuid(kind === 'strategy' ? 12 : 13), eventId: kind, workflowInstanceId: uuid(14), agentRunId: uuid(15), invitationTaskId: uuid(16) },
})
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(readStrategyReview).mockResolvedValue(pair)
  jest.mocked(readBriefAcceptance).mockResolvedValue({ orderRef: input.orderRef, documentId: pair.brief.documentId, versionId: pair.brief.versionId, version: '1.0' } as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, _entity, where) => {
    const id = (where as { id?: string }).id
    return { approvalRecords: [record(id === pair.strategy.versionId ? 'strategy' : 'tov')] } as never
  })
})

test('separate linked decisions produce a complete current accepted pair', async () => {
  await expect(readStrategyPairAcceptance({} as never, scope, input)).resolves.toMatchObject({ status: 'accepted', remainingDocuments: [],
    acceptances: { strategy: { scope: 'strategy' }, tov: { scope: 'tov' } }, brief: { versionId: pair.brief.versionId }, qaTaskRunId: pair.qa.taskRunId })
  expect(readStrategyReview).toHaveBeenCalledWith({}, scope, input.orderRef, input.strategyVersionId, input.tovVersionId)
})

test('one record cannot imply consent for the other document', async () => {
  jest.mocked(readStrategyReview).mockResolvedValue({ ...pair, tov: { ...pair.tov, documentStatus: 'ready_for_review', versionStatus: 'ready_for_review' } })
  await expect(readStrategyPairAcceptance({} as never, scope, input)).resolves.toMatchObject({ status: 'partial', remainingDocuments: ['tov'], acceptances: { tov: null } })
})

test('approved status without a durable record is not consent', async () => {
  jest.mocked(findOneWithDecryption).mockResolvedValue({ approvalRecords: [] } as never)
  await expect(readStrategyPairAcceptance({} as never, scope, input)).resolves.toMatchObject({ status: 'not_ready', reason: 'approval_record_missing' })
})

test.each([
  [{ ...pair, tov: { ...pair.tov, isCurrent: false } }, 'pair_not_current'],
  [{ ...pair, qa: { state: 'missing' } }, 'pair_qa_not_ready'],
  [{ ...pair, brief: { ...pair.brief, isCurrent: false } }, 'brief_not_current_or_accepted'],
  [{ ...pair, tovUsesStrategy: false }, 'pair_dependency_mismatch'],
] as const)('rejects stale inputs or missing authoritative QA/base: %s', async (changed, reason) => {
  jest.mocked(readStrategyReview).mockResolvedValue(changed as never)
  await expect(readStrategyPairAcceptance({} as never, scope, input)).resolves.toMatchObject({ status: 'not_ready', reason })
})

test('unchanged current version retains its historical approval only against the same accepted brief', () => {
  const saved = record('strategy')
  saved.pair.tov.versionId = uuid(90)
  expect(matchingPairAcceptance([saved], 'strategy', pair)).toEqual(saved)
  expect(matchingPairAcceptance([saved], 'strategy', { ...pair, brief: { ...pair.brief, versionId: uuid(91) } })).toBeNull()
  expect(matchingPairAcceptance([{ ...saved, approvedDocuments: ['tov'] }], 'strategy', pair)).toBeNull()
})
