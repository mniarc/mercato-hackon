import { z } from 'zod'
import type { ReadSpecialistTov } from '@/modules/agency_tov/lib/documentVersion/contracts'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../data/entities'
import { inputVersionSchema } from '../../data/schemas/envelope'
import { postDataSchema } from '../../data/schemas/post'
import { readPostExecutionInputs, type PostExecutionReady } from '../postExecution/readiness'
import { readPostReview } from '../postReview/read'
import { postInstructionReadySchema } from '../postInstructionExecution/contracts'
import { documentIdFor, versionLabel } from '../research/envelope'
import type { StrategyExecutionInput } from '../research/steps/context'
import type { ResearchScope } from '../store'
import type { PostRevisionRequest, PostRevisionResult } from './contracts'

export type PostRevisionReady = PostExecutionReady & { previousPost: StrategyExecutionInput; selectionSubmissionId: string }

export async function readPostRevisionInputs(em: EntityManager, scope: ResearchScope, request: PostRevisionRequest, readSpecialistTov?: ReadSpecialistTov): Promise<PostRevisionReady | Extract<PostRevisionResult, { status: 'not_ready' }>> {
  const notReady = (reason: string) => ({ status: 'not_ready' as const, orderRef: request.orderRef, reason })
  const review = await readPostReview(em, scope, request.orderRef, request.postVersionId)
  if (!review?.isCurrent) return notReady('post_not_current')
  if (review.simulationFlag || review.documentStatus !== 'ready_for_review' || review.versionStatus !== 'ready_for_review'
    || review.qa.state !== 'assessed' || review.qa.verdict !== 'pass_for_draft') return notReady('post_not_reviewable')
  const previous = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...scope, id: request.postVersionId, documentId: review.documentId, orderRef: request.orderRef, templateId: 'WZR-POST',
  }, undefined, scope)
  const pins = z.array(inputVersionSchema).safeParse(previous?.inputVersions)
  if (!previous || !pins.success || !postDataSchema.safeParse(previous.data).success) return notReady('post_input_missing')
  const instructionPins = pins.data.filter((pin) => pin.document_id === documentIdFor('WZR-ZLECENIE-POSTU', request.orderRef))
  if (instructionPins.length !== 1 || !/^[1-9]\d*\.0$/.test(instructionPins[0].version)) return notReady('post_input_missing')
  const instruction = await findOneWithDecryption(em, AgencyResearchDocumentVersion, {
    ...scope, orderRef: request.orderRef, templateId: 'WZR-ZLECENIE-POSTU', versionNo: Number(instructionPins[0].version.split('.')[0]),
  }, undefined, scope)
  if (!instruction) return notReady('post_input_missing')
  const compiler = await findOneWithDecryption(em, AgencyResearchTaskRun, {
    ...scope, orderRef: request.orderRef, stepId: '6.7', status: 'done', outputVersionId: instruction.id,
  }, undefined, scope)
  const receipt = postInstructionReadySchema.safeParse((compiler?.summary as Record<string, unknown> | null)?.result)
  if (!receipt.success) return notReady('instruction_selection_missing')
  const executionInput = {
    orderRef: request.orderRef, instructionVersionId: instruction.id, selectionSubmissionId: receipt.data.selectionSubmissionId,
    process: request.process, maxCostPln: request.maxCostPln,
  }
  const ready = readSpecialistTov
    ? await readPostExecutionInputs(em, scope, executionInput, readSpecialistTov)
    : await readPostExecutionInputs(em, scope, executionInput)
  if (ready.status === 'not_ready') return ready
  for (const input of [ready.instruction, ready.tov]) {
    const matches = pins.data.filter((pin) => pin.document_id === input.document_id)
    if (matches.length !== 1 || matches[0].version !== input.version
      || (input.specialistTov && (matches[0].specialistTov?.researchRunId !== input.specialistTov.researchRunId
        || matches[0].specialistTov.versionId !== input.specialistTov.versionId))) return notReady('post_input_changed')
  }
  return { ...ready, selectionSubmissionId: receipt.data.selectionSubmissionId, previousPost: { document_id: documentIdFor('WZR-POST', request.orderRef),
    version: versionLabel(previous.versionNo), status: previous.status, versionId: previous.id, data: previous.data } }
}
