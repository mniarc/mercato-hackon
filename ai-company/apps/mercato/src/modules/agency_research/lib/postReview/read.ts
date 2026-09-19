import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema } from '../../data/schemas/envelope'
import { editorReviewSchema } from '../../data/schemas/post'
import { documentIdFor, versionLabel } from '../research/envelope'
import type { PostReviewProjection, PostReviewQa } from './types'

export type { PostReviewProjection, PostReviewQa } from './types'

type Scope = { tenantId: string; organizationId: string }
const referencesSchema = z.array(inputVersionSchema)
const qaSchema = z.object({ verdict: editorReviewSchema.shape.result })

function projectQa(run: AgencyResearchTaskRun | undefined, versionId: string): PostReviewQa {
  if (!run) return { state: 'missing' }
  const parsed = qaSchema.safeParse(run.qaResult)
  if (run.outputVersionId === versionId && parsed.success
    && ((run.status === 'done' && parsed.data.verdict === 'pass_for_draft')
      || (run.status === 'to_fix' && parsed.data.verdict !== 'pass_for_draft'))) {
    return { state: 'assessed', taskRunId: run.id, status: run.status as 'done' | 'to_fix', verdict: parsed.data.verdict }
  }
  return { state: 'unavailable', taskRunId: run.id, status: run.status }
}

export async function readPostReview(em: EntityManager, scope: Scope, orderRef: string, versionId: string): Promise<PostReviewProjection | null> {
  const document = await findOneWithDecryption(em, AgencyResearchDocument, {
    ...scope, orderRef, templateId: 'WZR-POST', deletedAt: null,
  }, undefined, scope)
  if (!document) return null
  const version = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...scope, id: versionId, documentId: document.id, orderRef, templateId: 'WZR-POST',
  }, undefined, scope)
  if (!version) return null

  const label = versionLabel(version.versionNo)
  const qaRuns = await findWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef, stepId: '7.3',
  }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
  const qaRun = qaRuns.find((run) => {
    if (run.outputVersionId) return run.outputVersionId === version.id
    const inputs = referencesSchema.safeParse(run.inputVersions)
    return inputs.success && inputs.data.some((input) => input.document_id === documentIdFor('WZR-POST', orderRef) && input.version === label)
  })

  return {
    orderRef, documentId: document.id, versionId: version.id, version: label, templateId: 'WZR-POST',
    isCurrent: document.currentVersionId === version.id, documentStatus: document.status, versionStatus: version.status,
    clientViewMd: version.clientViewMd, simulationFlag: version.simulationFlag, qa: projectQa(qaRun, version.id),
  }
}
