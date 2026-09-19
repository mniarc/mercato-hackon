import { z } from 'zod'
import { specialistTovReferenceSchema, type ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema, type TemplateId } from '../../data/schemas/envelope'
import { planDataSchema } from '../../data/schemas/plan'
import { documentIdFor, versionLabel } from '../research/envelope'
import { readStrategyPairAcceptance } from '../strategyPairAcceptance/read'
import { planReviewRequestSchema, planAcceptanceRecordSchema, type PlanReview, type PlanAcceptanceRecord } from './contracts'

type Scope = { tenantId: string; organizationId: string }
const references = z.array(inputVersionSchema)
export function planInputLabel(raw: unknown, templateId: TemplateId, orderRef: string): string | null {
  const parsed = references.safeParse(raw)
  if (!parsed.success) return null
  const matches = parsed.data.filter((input) => input.document_id === documentIdFor(templateId, orderRef))
  return matches.length === 1 && /^[1-9]\d*\.0$/.test(matches[0].version) ? matches[0].version : null
}

function specialistTovPin(raw: unknown) {
  const parsed = references.safeParse(raw)
  if (!parsed.success) return null
  const matches = parsed.data.filter((input) => input.specialistTov)
  if (matches.length !== 1) return null
  const reference = specialistTovReferenceSchema.parse(matches[0].specialistTov)
  return matches[0].document_id === `agency_tov:${reference.documentId}` && matches[0].version === reference.version ? reference : null
}

/** Saved current plan, exact 6.3 QA, and currently accepted foundations. No recommendations become consent. */
export async function readPlanReview(em: EntityManager, scope: Scope, rawInput: unknown, readSpecialistTov?: ReadSpecialistTov): Promise<PlanReview> {
  const input = planReviewRequestSchema.parse(rawInput)
  const { orderRef } = input
  const where = { ...scope, orderRef }
  const unavailable = (reason: Extract<PlanReview, { status: 'not_ready' }>['reason']): PlanReview => ({ status: 'not_ready', orderRef, reason })
  const document = await findOneWithDecryption(em, AgencyResearchDocument, { ...where, templateId: 'WZR-PLAN', deletedAt: null }, undefined, scope)
  const version = document && await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...where, id: input.planVersionId, documentId: document.id, templateId: 'WZR-PLAN',
  }, undefined, scope)
  if (!document || !version) return unavailable('plan_not_found')
  if (document.currentVersionId !== version.id) return unavailable('plan_not_current')
  if (!['ready_for_review', 'approved'].includes(document.status) || !['draft', 'ready_for_review', 'approved'].includes(version.status) || version.simulationFlag) return unavailable('plan_not_reviewable')
  const plan = planDataSchema.safeParse(version.data)
  if (!plan.success || plan.data.plan_context.simulation_flag || new Set(plan.data.topics.map((topic) => topic.topic_id)).size !== plan.data.topics.length) return unavailable('plan_invalid')
  const loadPin = async (templateId: 'WZR-STRATEGIA' | 'WZR-TOV') => {
    const label = planInputLabel(version.inputVersions, templateId, orderRef)
    return label ? findOneWithDecryption(em, AgencyResearchDocumentVersion, { ...where, templateId, versionNo: Number(label.split('.')[0]) }, undefined, scope) : null
  }
  const strategy = await loadPin('WZR-STRATEGIA')
  const specialistTov = specialistTovPin(version.inputVersions)
  const specialist = specialistTov && readSpecialistTov ? await readSpecialistTov(scope, specialistTov) : null
  const tov = specialistTov ? null : await loadPin('WZR-TOV')
  if (!strategy || (specialistTov
    ? !specialist || !specialist.isCurrent || specialist.documentId !== specialistTov.documentId
      || specialist.versionId !== specialistTov.versionId || specialist.version !== specialistTov.version
    : !tov)) return unavailable('plan_dependencies_mismatch')
  const tovVersionId = specialistTov?.versionId ?? tov!.id
  const pairInput = { orderRef, strategyVersionId: strategy.id, tovVersionId }
  const pair = readSpecialistTov
    ? await readStrategyPairAcceptance(em, scope, pairInput, readSpecialistTov)
    : await readStrategyPairAcceptance(em, scope, pairInput)
  if (pair.status !== 'accepted') return unavailable('plan_foundations_not_accepted')
  if (planInputLabel(version.inputVersions, 'WZR-BRIEF', orderRef) !== pair.brief.version) return unavailable('plan_dependencies_mismatch')
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...where, stepId: '6.3' }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
  const qa = runs.find((run) => planInputLabel(run.inputVersions, 'WZR-PLAN', orderRef) === versionLabel(version.versionNo))
  const qaResult = z.object({ verdict: z.literal('ready_for_approval'), readyForApproval: z.literal(true) }).safeParse(qa?.qaResult)
  if (!qa || qa.status !== 'done' || qa.outputVersionId !== version.id || !qaResult.success) return unavailable('plan_qa_not_ready')
  for (const templateId of ['WZR-STRATEGIA', 'WZR-BRIEF', 'WZR-ZRODLA', 'WZR-KONKURENCJA', 'WZR-ZAMOWIENIE'] as const) {
    const label = planInputLabel(version.inputVersions, templateId, orderRef)
    if (!label || planInputLabel(qa.inputVersions, templateId, orderRef) !== label) return unavailable('plan_dependencies_mismatch')
  }
  if (specialistTov) {
    const qaTov = specialistTovPin(qa.inputVersions)
    if (!qaTov || qaTov.researchRunId !== specialistTov.researchRunId || qaTov.documentId !== specialistTov.documentId
      || qaTov.versionId !== specialistTov.versionId || qaTov.version !== specialistTov.version) return unavailable('plan_dependencies_mismatch')
  } else {
    const label = planInputLabel(version.inputVersions, 'WZR-TOV', orderRef)
    if (!label || planInputLabel(qa.inputVersions, 'WZR-TOV', orderRef) !== label) return unavailable('plan_dependencies_mismatch')
  }
  let receipt: PlanAcceptanceRecord | null = null
  for (const raw of Array.isArray(version.approvalRecords) ? [...version.approvalRecords].reverse() : []) {
    const saved = planAcceptanceRecordSchema.safeParse(raw)
    if (saved.success && saved.data.documentId === document.id && saved.data.documentVersionId === version.id
      && saved.data.version === versionLabel(version.versionNo) && saved.data.briefVersionId === pair.brief.versionId
      && saved.data.strategyVersionId === strategy.id && saved.data.tovVersionId === tovVersionId
      && plan.data.topics.some((topic) => topic.topic_id === saved.data.selectedTopicId)) { receipt = saved.data; break }
  }
  if ((document.status === 'approved' || version.status === 'approved') && !receipt) return unavailable('approval_record_missing')
  return { status: 'ready', orderRef, plan: { templateId: 'WZR-PLAN', documentId: document.id, versionId: version.id,
    version: versionLabel(version.versionNo), isCurrent: true, documentStatus: document.status, versionStatus: version.status,
    simulationFlag: version.simulationFlag, clientViewMd: version.clientViewMd },
    topics: plan.data.topics.map((topic) => ({ topicId: topic.topic_id, title: topic.topic, recommended: topic.topic_id === plan.data.recommendation.topic_id })),
    recommendedTopicId: plan.data.recommendation.topic_id, qaTaskRunId: qa.id, briefVersionId: pair.brief.versionId,
    strategyVersionId: strategy.id, tovVersionId, ...(specialistTov ? { specialistTov } : {}), receipt,
  }
}

/** Current consent only: older plan decisions remain on their immutable version rows. */
export const readPlanAcceptance = readPlanReview
