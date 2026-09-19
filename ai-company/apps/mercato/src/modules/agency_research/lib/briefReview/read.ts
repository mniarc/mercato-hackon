import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema } from '../../data/schemas/envelope'
import { ustaleniaDataSchema } from '../../data/schemas/ustalenia'
import type { BriefReviewProjection, BriefReviewQa } from '../contracts'
import { documentIdFor, versionLabel } from '../research/envelope'
import { firstContactQuestions } from '../research/render/brief'

type Scope = { tenantId: string; organizationId: string }
const referencesSchema = z.array(inputVersionSchema)
const qaSchema = z.object({ verdict: z.enum(['ready_for_approval', 'needs_client_data', 'needs_agent_fix']) })

function projectQa(run: AgencyResearchTaskRun | undefined, versionId: string): BriefReviewQa {
  if (!run) return { state: 'missing' }
  const parsed = qaSchema.safeParse(run.qaResult)
  if (run.outputVersionId === versionId && parsed.success
    && ((run.status === 'done' && parsed.data.verdict !== 'needs_agent_fix')
      || (run.status === 'to_fix' && parsed.data.verdict === 'needs_agent_fix'))) {
    return { state: 'assessed', taskRunId: run.id, status: run.status as 'done' | 'to_fix', verdict: parsed.data.verdict }
  }
  return { state: 'unavailable', taskRunId: run.id, status: run.status }
}

export async function readBriefReview(em: EntityManager, scope: Scope, orderRef: string, versionId: string): Promise<BriefReviewProjection | null> {
  const document = await findOneWithDecryption(em, AgencyResearchDocument, {
    ...scope, orderRef, templateId: 'WZR-BRIEF', deletedAt: null,
  }, undefined, scope)
  if (!document) return null
  const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...scope, id: versionId, documentId: document.id, orderRef, templateId: 'WZR-BRIEF',
  }, undefined, scope)
  if (!version) return null

  const label = versionLabel(version.versionNo)
  const qaRuns = await findWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef, stepId: '4.2',
  }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
  const qaRun = qaRuns.find((run) => {
    if (run.outputVersionId) return run.outputVersionId === version.id
    const inputs = referencesSchema.safeParse(run.inputVersions)
    return inputs.success && inputs.data.some((input) => input.document_id === documentIdFor('WZR-BRIEF', orderRef) && input.version === label)
  })

  let questions: BriefReviewProjection['questions'] = []
  const inputs = referencesSchema.safeParse(version.inputVersions)
  const findingsRef = inputs.success ? inputs.data.find((input) => input.document_id === documentIdFor('WZR-USTALENIA', orderRef)) : undefined
  const findingsVersionNo = findingsRef && /^([1-9]\d*)\.0$/.exec(findingsRef.version)
  if (findingsVersionNo) {
    const findings = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
      ...scope, orderRef, templateId: 'WZR-USTALENIA', versionNo: Number(findingsVersionNo[1]),
    }, undefined, scope)
    const parsed = ustaleniaDataSchema.safeParse(findings?.data)
    if (parsed.success) questions = firstContactQuestions(parsed.data).map((question) => ({
      question_id: question.question_id, question: question.question, hint: question.hint,
      reason: question.reason, brief_field: question.brief_field, priority: question.priority,
    }))
  }

  return {
    orderRef, documentId: document.id, versionId: version.id, version: label, templateId: 'WZR-BRIEF',
    isCurrent: document.currentVersionId === version.id, documentStatus: document.status, versionStatus: version.status,
    clientViewMd: version.clientViewMd, questions, qa: projectQa(qaRun, version.id),
  }
}
