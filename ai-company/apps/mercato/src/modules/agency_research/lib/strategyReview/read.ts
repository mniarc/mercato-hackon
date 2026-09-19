import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema } from '../../data/schemas/envelope'
import { documentIdFor, versionLabel } from '../research/envelope'
import type { StrategyReviewProjection, StrategyReviewQa, StrategyReviewVersion } from './types'

type Scope = { tenantId: string; organizationId: string }
type PairTemplate = 'WZR-STRATEGIA' | 'WZR-TOV'
const referencesSchema = z.array(inputVersionSchema)
const qaSchema = z.object({ verdict: z.enum(['ready_for_approval', 'needs_agent_fix']) })

function pinnedVersion(raw: unknown, templateId: PairTemplate | 'WZR-BRIEF', orderRef: string): string | null {
  const parsed = referencesSchema.safeParse(raw)
  if (!parsed.success) return null
  const matches = parsed.data.filter((input) => input.document_id === documentIdFor(templateId, orderRef))
  return matches.length === 1 ? matches[0].version : null
}

function projectVersion(document: AgencyResearchDocument, version: AgencyResearchDocumentVersion): StrategyReviewVersion {
  return {
    documentId: document.id, versionId: version.id, version: versionLabel(version.versionNo),
    isCurrent: document.currentVersionId === version.id, documentStatus: document.status,
    versionStatus: version.status, simulationFlag: version.simulationFlag,
  }
}

function projectQa(run: AgencyResearchTaskRun | undefined, strategyVersionId: string): StrategyReviewQa {
  if (!run) return { state: 'missing' }
  const parsed = qaSchema.safeParse(run.qaResult)
  if (run.outputVersionId === strategyVersionId && parsed.success
    && ((run.status === 'done' && parsed.data.verdict === 'ready_for_approval')
      || (run.status === 'to_fix' && parsed.data.verdict === 'needs_agent_fix'))) {
    return { state: 'assessed', taskRunId: run.id, status: run.status as 'done' | 'to_fix', verdict: parsed.data.verdict }
  }
  return { state: 'unavailable', taskRunId: run.id, status: run.status }
}

export async function readStrategyReview(
  em: EntityManager, scope: Scope, orderRef: string, strategyVersionId: string, tovVersionId: string,
): Promise<StrategyReviewProjection | null> {
  async function loadVersion(templateId: PairTemplate, versionId: string) {
    const document = await findOneWithDecryption(em, AgencyResearchDocument, {
      ...scope, orderRef, templateId, deletedAt: null,
    }, undefined, scope)
    if (!document) return null
    const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...scope, id: versionId, documentId: document.id, orderRef, templateId,
    }, undefined, scope)
    return version ? { document, version } : null
  }

  const [strategy, tov] = await Promise.all([
    loadVersion('WZR-STRATEGIA', strategyVersionId), loadVersion('WZR-TOV', tovVersionId),
  ])
  if (!strategy || !tov) return null
  const strategyLabel = versionLabel(strategy.version.versionNo)
  const tovLabel = versionLabel(tov.version.versionNo)
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef, stepId: '5.4',
  }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
  const qaRun = runs.find((run) => pinnedVersion(run.inputVersions, 'WZR-STRATEGIA', orderRef) === strategyLabel
    && pinnedVersion(run.inputVersions, 'WZR-TOV', orderRef) === tovLabel)

  let brief: StrategyReviewVersion | null = null
  const briefLabel = pinnedVersion(strategy.version.inputVersions, 'WZR-BRIEF', orderRef)
  const briefNumber = briefLabel && /^([1-9]\d*)\.0$/.exec(briefLabel)
  if (briefNumber
    && pinnedVersion(tov.version.inputVersions, 'WZR-BRIEF', orderRef) === briefLabel
    && pinnedVersion(qaRun?.inputVersions, 'WZR-BRIEF', orderRef) === briefLabel) {
    const document = await findOneWithDecryption(em, AgencyResearchDocument, {
      ...scope, orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
    }, undefined, scope)
    if (document) {
      const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
        ...scope, documentId: document.id, orderRef, templateId: 'WZR-BRIEF', versionNo: Number(briefNumber[1]),
      }, undefined, scope)
      if (version) brief = projectVersion(document, version)
    }
  }

  return {
    orderRef,
    strategy: { ...projectVersion(strategy.document, strategy.version), templateId: 'WZR-STRATEGIA', clientViewMd: strategy.version.clientViewMd },
    tov: { ...projectVersion(tov.document, tov.version), templateId: 'WZR-TOV', clientViewMd: tov.version.clientViewMd },
    qa: projectQa(qaRun, strategyVersionId),
    tovUsesStrategy: pinnedVersion(tov.version.inputVersions, 'WZR-STRATEGIA', orderRef) === strategyLabel,
    brief,
  }
}
