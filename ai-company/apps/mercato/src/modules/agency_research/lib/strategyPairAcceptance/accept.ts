import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_TOV_RESEARCH_SERVICE, type AgencyTovResearchService } from '@/modules/agency_tov/lib/researchService'
import type { ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../data/entities'
import { acceptStrategyPairInputSchema, pairDocumentKinds, strategyPairAcceptanceRecordSchema, type PairDocumentKind, type StrategyPairAcceptanceReceipt } from './contracts'
import { matchingPairAcceptance, readEligiblePair } from './read'

function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }
function missing(): never { throw new CrudHttpError(404, { error: 'api.errors.notFound' }) }

/** Caller proves original response + one persisted G directive; producer owns exact-version writes. */
export async function acceptStrategyPair(container: AppContainer, rawInput: unknown): Promise<StrategyPairAcceptanceReceipt> {
  const { context, request } = acceptStrategyPairInputSchema.parse(rawInput)
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(context.userId, ['agency_research.manage'], scope)) {
    throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  }
  const readSpecialistTov: ReadSpecialistTov = (readScope, reference) => container
    .resolve<AgencyTovResearchService>(AGENCY_TOV_RESEARCH_SERVICE)
    .getDocumentVersion(readScope, reference)
  return container.resolve<EntityManager>('em').fork().transactional(async (em) => {
    // Same order for every pair decision; also hold the accepted base against concurrent replacement.
    const briefDocument = await findOneWithDecryption(em, AgencyResearchDocument, {
      ...scope, orderRef: request.orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!briefDocument) missing()
    const rows = {} as Record<PairDocumentKind, { document: AgencyResearchDocument; version: AgencyResearchDocumentVersion }>
    for (const kind of [...pairDocumentKinds].sort((a, b) => request.pair[a].documentId.localeCompare(request.pair[b].documentId))) {
      const templateId = kind === 'strategy' ? 'WZR-STRATEGIA' : 'WZR-TOV'
      const document = await findOneWithDecryption(em, AgencyResearchDocument, {
        ...scope, orderRef: request.orderRef, id: request.pair[kind].documentId, templateId, deletedAt: null,
      }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
      const version = document && await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
        ...scope, orderRef: request.orderRef, id: request.pair[kind].versionId, documentId: document.id, templateId,
      }, undefined, scope)
      if (!document || !version) {
        if (kind === 'strategy') missing()
        continue
      }
      if (!Array.isArray(version.approvalRecords)) conflict()
      rows[kind] = { document, version }
    }
    const legacyTovStored = Boolean(rows.tov)
    if (!rows.tov) rows.tov = rows.strategy
    const source = { kind: 'agency_strategy_pair_acceptance' as const, ...request.source }
    const previous = pairDocumentKinds.flatMap((kind) => (rows[kind].version.approvalRecords as unknown[])
      .map((raw) => strategyPairAcceptanceRecordSchema.safeParse(raw))
      .filter((parsed) => parsed.success && parsed.data.scope === kind && parsed.data.source.submissionId === source.submissionId)
      .map((parsed) => ({ kind, record: parsed.success ? parsed.data : null })))
    if (previous.length) {
      if (previous.length !== request.approvedDocuments.length || new Set(previous.map((entry) => entry.kind)).size !== previous.length) conflict()
      for (const { kind, record } of previous) {
        if (!record || !request.approvedDocuments.includes(kind) || record.scope !== kind
          || record.person !== request.customerUserId || record.documentVersionId !== request.pair[kind].versionId
          || !isDeepStrictEqual(record.source, source)
          || !isDeepStrictEqual(record.pair, request.pair)
          || !isDeepStrictEqual([...record.approvedDocuments].sort(), [...request.approvedDocuments].sort())) conflict()
      }
      const records = previous.map((entry) => entry.record!)
      return { status: 'recorded', orderRef: request.orderRef, pair: request.pair, approvedDocuments: records[0].approvedDocuments, records, replayed: true }
    }
    const checked = await readEligiblePair(em, scope, { orderRef: request.orderRef,
      strategyVersionId: request.pair.strategy.versionId, tovVersionId: request.pair.tov.versionId }, readSpecialistTov)
    if (!checked.eligible || checked.pair.brief.documentId !== briefDocument.id || checked.pair.brief.versionId !== briefDocument.currentVersionId) conflict()
    const specialistTov = checked.pair.tov.specialistReference
    if (Boolean(specialistTov) === legacyTovStored) conflict()
    for (const kind of pairDocumentKinds) {
      const { document, version } = rows[kind]
      if (kind === 'tov' && specialistTov) {
        if (checked.pair.tov.documentId !== specialistTov.documentId || checked.pair.tov.versionId !== specialistTov.versionId) conflict()
      } else if (document.currentVersionId !== version.id || checked.pair[kind].documentId !== document.id) conflict()
      if ((!specialistTov || kind === 'strategy') && (document.status === 'approved' || version.status === 'approved')
        && !matchingPairAcceptance(version.approvalRecords, kind, checked.pair)) conflict()
    }
    const at = new Date().toISOString()
    const records = request.approvedDocuments.map((kind) => strategyPairAcceptanceRecordSchema.parse({
      person: request.customerUserId, at, scope: kind, version: checked.pair[kind].version,
      documentVersionId: checked.pair[kind].versionId, briefVersionId: checked.pair.brief.versionId,
      pair: request.pair, approvedDocuments: request.approvedDocuments, source,
    }))
    for (const record of records) {
      const { document, version } = rows[record.scope]
      version.approvalRecords = [...(version.approvalRecords as unknown[]), record]
      if (record.scope === 'strategy' || !specialistTov) {
        version.status = 'approved'; document.status = 'approved'; document.updatedAt = new Date(at)
      }
    }
    await em.flush()
    return { status: 'recorded', orderRef: request.orderRef, pair: request.pair, approvedDocuments: request.approvedDocuments, records, replayed: false }
  })
}
