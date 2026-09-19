import { buildStrategyPairRequest, canRespondToStrategyPair, strategyPairReviewSchema, type StrategyPairReview } from '../contract'

const document = {
  caseId: 'case-1', version: '2.0', title: 'Document', html: '<h1>Document</h1>',
  status: 'ready_for_review' as const, isCurrent: true, mode: 'content' as const,
}
const pair: StrategyPairReview = {
  caseId: 'case-1',
  strategy: { ...document, templateId: 'WZR-STRATEGIA', documentId: 'strategy-document', versionId: 'strategy-v2' },
  tov: { ...document, templateId: 'WZR-TOV', documentId: 'tov-document', versionId: 'tov-v2' },
}

test('preserves both exact identities with a selected or complete approval', () => {
  const partial = buildStrategyPairRequest(pair, { kind: 'approval', strategy: true, tov: false }, 'event-1')
  expect(partial).toEqual({
    channel: 'portal', kind: 'approval', externalEventId: 'event-1',
    strategy: { documentId: 'strategy-document', versionId: 'strategy-v2' },
    tov: { documentId: 'tov-document', versionId: 'tov-v2' }, approvedDocuments: ['strategy'],
  })
  expect(buildStrategyPairRequest(pair, { kind: 'approval', strategy: true, tov: true }, 'event-2'))
    .toMatchObject({ approvedDocuments: ['strategy', 'tov'] })
})

test('sends unclassified original comments with both versions and no approval selection', () => {
  expect(buildStrategyPairRequest(pair, { kind: 'message', body: '  Pause and change the tone.\nPlease explain the strategy.  ', strategy: true, tov: true }, 'event-3'))
    .toEqual({
      channel: 'portal', kind: 'message', externalEventId: 'event-3',
      strategy: { documentId: 'strategy-document', versionId: 'strategy-v2' },
      tov: { documentId: 'tov-document', versionId: 'tov-v2' }, body: 'Pause and change the tone.\nPlease explain the strategy.',
    })
})

test('refuses stale pairs, empty approval selection and empty messages', () => {
  expect(() => buildStrategyPairRequest({ ...pair, tov: { ...pair.tov, isCurrent: false } }, { kind: 'approval', strategy: true, tov: false }, 'event')).toThrow()
  expect(() => buildStrategyPairRequest(pair, { kind: 'approval', strategy: false, tov: false }, 'event')).toThrow()
  expect(() => buildStrategyPairRequest(pair, { kind: 'message', body: '  ' }, 'event')).toThrow()
})

test('does not accept a crossed case, swapped templates or a repeated document as a pair', () => {
  expect(strategyPairReviewSchema.safeParse({ ...pair, tov: { ...pair.tov, caseId: 'other-case' } }).success).toBe(false)
  expect(strategyPairReviewSchema.safeParse({ ...pair, strategy: pair.tov, tov: pair.strategy }).success).toBe(false)
  expect(strategyPairReviewSchema.safeParse({ ...pair, tov: { ...pair.tov, documentId: pair.strategy.documentId } }).success).toBe(false)
})

test('a follow-up approves only the remaining document while preserving the already accepted version', () => {
  const partial: StrategyPairReview = { ...pair, strategy: { ...pair.strategy, status: 'approved' } }
  expect(canRespondToStrategyPair(partial)).toBe(true)
  expect(buildStrategyPairRequest(partial, { kind: 'approval', tov: true }, 'follow-up'))
    .toEqual({
      channel: 'portal', kind: 'approval', externalEventId: 'follow-up',
      strategy: { documentId: 'strategy-document', versionId: 'strategy-v2' },
      tov: { documentId: 'tov-document', versionId: 'tov-v2' }, approvedDocuments: ['tov'],
    })
  expect(() => buildStrategyPairRequest(partial, { kind: 'approval', strategy: true, tov: true }, 'follow-up')).toThrow()
  expect(buildStrategyPairRequest(partial, { kind: 'message', body: 'Please clarify the tone.' }, 'message'))
    .toMatchObject({ kind: 'message', body: 'Please clarify the tone.' })
  expect(canRespondToStrategyPair({ ...partial, tov: { ...partial.tov, status: 'approved' } })).toBe(false)
})
