import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocumentVersion } from '../../data/entities'
import { readStrategyReview } from '../strategyReview/read'
import { readBriefAcceptance } from '../briefAcceptance/read'
import type { StrategyReviewProjection } from '../strategyReview/types'
import { pairDocumentKinds, strategyPairAcceptanceRequestSchema, strategyPairAcceptanceRecordSchema,
  type PairAcceptanceReason, type PairDocumentKind, type StrategyPairAcceptanceRecord, type StrategyPairAcceptanceState } from './contracts'

type Scope = { tenantId: string; organizationId: string }
export async function readEligiblePair(em: EntityManager, scope: Scope, input: { orderRef: string; strategyVersionId: string; tovVersionId: string }): Promise<
  { eligible: true; pair: StrategyReviewProjection & { brief: NonNullable<StrategyReviewProjection['brief']> }; qaTaskRunId: string }
  | { eligible: false; reason: PairAcceptanceReason }
> {
  const pair = await readStrategyReview(em, scope, input.orderRef, input.strategyVersionId, input.tovVersionId)
  if (!pair) return { eligible: false, reason: 'pair_not_found' }
  if (!pair.strategy.isCurrent || !pair.tov.isCurrent) return { eligible: false, reason: 'pair_not_current' }
  // Native pair QA marks the parents ready; versions remain draft until consent.
  if (![pair.strategy, pair.tov].every((document) => !document.simulationFlag
    && ((document.documentStatus === 'ready_for_review' && ['draft', 'ready_for_review'].includes(document.versionStatus))
      || (document.documentStatus === 'approved' && document.versionStatus === 'approved')))) {
    return { eligible: false, reason: 'pair_not_reviewable' }
  }
  if (!pair.tovUsesStrategy) return { eligible: false, reason: 'pair_dependency_mismatch' }
  if (pair.qa.state !== 'assessed' || pair.qa.status !== 'done' || pair.qa.verdict !== 'ready_for_approval') return { eligible: false, reason: 'pair_qa_not_ready' }
  const brief = pair.brief
  const acceptance = brief ? await readBriefAcceptance(em, scope, input.orderRef, brief.versionId) : null
  if (!brief?.isCurrent || brief.simulationFlag || brief.documentStatus !== 'approved' || brief.versionStatus !== 'approved'
    || !acceptance || acceptance.documentId !== brief.documentId || acceptance.versionId !== brief.versionId || acceptance.version !== brief.version) {
    return { eligible: false, reason: 'brief_not_current_or_accepted' }
  }
  return { eligible: true, pair: { ...pair, brief }, qaTaskRunId: pair.qa.taskRunId }
}

export function matchingPairAcceptance(rawRecords: unknown, kind: PairDocumentKind, pair: StrategyReviewProjection & { brief: NonNullable<StrategyReviewProjection['brief']> }): StrategyPairAcceptanceRecord | null {
  if (!Array.isArray(rawRecords)) return null
  const document = pair[kind]
  for (const raw of [...rawRecords].reverse()) {
    const parsed = strategyPairAcceptanceRecordSchema.safeParse(raw)
    if (!parsed.success) continue
    const saved = parsed.data
    // The other shown version may change without invalidating this unchanged
    // document's consent. Current pair QA and the unchanged accepted base still gate use.
    if (saved.scope === kind && saved.documentVersionId === document.versionId && saved.version === document.version
      && saved.pair[kind].documentId === document.documentId && saved.pair[kind].versionId === document.versionId
      && saved.briefVersionId === pair.brief.versionId && saved.approvedDocuments.includes(kind)) return saved
  }
  return null
}

export async function readStrategyPairAcceptance(em: EntityManager, scope: Scope, rawInput: unknown): Promise<StrategyPairAcceptanceState> {
  const input = strategyPairAcceptanceRequestSchema.parse(rawInput)
  const checked = await readEligiblePair(em, scope, input)
  if (!checked.eligible) return { status: 'not_ready', orderRef: input.orderRef, reason: checked.reason }
  const { pair } = checked
  const acceptances: { strategy: StrategyPairAcceptanceRecord | null; tov: StrategyPairAcceptanceRecord | null } = { strategy: null, tov: null }
  for (const kind of pairDocumentKinds) {
    const document = pair[kind]
    const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...scope, orderRef: input.orderRef, id: document.versionId, documentId: document.documentId, templateId: document.templateId,
    }, undefined, scope)
    if (!version) return { status: 'not_ready', orderRef: input.orderRef, reason: 'pair_not_found' }
    const saved = matchingPairAcceptance(version.approvalRecords, kind, pair)
    if (document.documentStatus === 'approved' && document.versionStatus === 'approved') {
      if (!saved) return { status: 'not_ready', orderRef: input.orderRef, reason: 'approval_record_missing' }
      acceptances[kind] = saved
    }
  }
  const remainingDocuments = pairDocumentKinds.filter((kind) => !acceptances[kind])
  const { clientViewMd: _strategyContent, ...strategy } = pair.strategy
  const { clientViewMd: _tovContent, ...tov } = pair.tov
  return { status: remainingDocuments.length ? 'partial' : 'accepted', orderRef: input.orderRef,
    pair: { strategy, tov }, brief: pair.brief, qaTaskRunId: checked.qaTaskRunId, acceptances, remainingDocuments }
}
