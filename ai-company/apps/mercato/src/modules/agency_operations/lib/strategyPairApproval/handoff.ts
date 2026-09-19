import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema, clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { STRATEGY_PAIR_REVIEW_SERVICE, type StrategyPairReviewService } from '../strategyPairReview/contracts'
import type { StrategyPairContinuation } from './contracts'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(),
  workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })

export function createStrategyPairContinuation(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<StrategyPairContinuation> => {
    const { workflowInstance } = contextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Pair continuation submission is outside the originating workflow')
    const sourceWorkflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    const saved = z.object({ result: clientSubmissionDispositionSchema }).parse(sourceWorkflow?.context?.clientTriageResult).result
    if (!saved.effectsApplied || saved.kind !== 'approve' || saved.acceptance.status !== 'recorded') {
      throw new Error('[internal] Pair continuation requires a persisted selected-pair decision')
    }
    const receipt = saved.acceptance
    const original = clientSubmissionRequestSchema.parse(submission.original)
    const response = original.strategyReviewResponse
    const firstRecord = receipt.records[0]
    if (!response || response.kind !== 'approval' || original.eventId !== submission.eventId
      || original.documentVersionReference !== response.strategy.versionId
      || saved.targets.caseId !== submission.caseId || saved.targets.submissionId !== submission.id
      || saved.targets.documentVersionReference !== response.strategy.versionId || receipt.orderRef !== submission.caseId
      || !isDeepStrictEqual(receipt.pair, { strategy: response.strategy, tov: response.tov })
      || !isDeepStrictEqual(receipt.approvedDocuments, response.approvedDocuments)
      || receipt.records.length !== receipt.approvedDocuments.length
      || new Set(receipt.records.map((entry) => entry.scope)).size !== receipt.records.length
      || receipt.records.some((entry) => !receipt.approvedDocuments.includes(entry.scope)
        || entry.person !== submission.submittedByCustomerUserId || entry.documentVersionId !== receipt.pair[entry.scope].versionId
        || !isDeepStrictEqual(entry.pair, receipt.pair) || !isDeepStrictEqual(entry.approvedDocuments, receipt.approvedDocuments)
        || entry.source.submissionId !== submission.id || entry.source.eventId !== submission.eventId
        || entry.source.workflowInstanceId !== workflowInstance.id || entry.source.invitationTaskId !== response.taskId
        || entry.source.agentRunId !== firstRecord.source.agentRunId)) {
      throw new Error('[internal] Pair decision does not belong to the originating submission')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Pair continuation case is outside the submission scope')
    const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
    const request = { orderRef: agencyCase.id, strategyVersionId: receipt.pair.strategy.versionId, tovVersionId: receipt.pair.tov.versionId }
    const cumulative = await research.getStrategyPairAcceptance(scope, request)
    if (cumulative.status === 'not_ready') return { status: 'not_ready', orderRef: agencyCase.id, cumulative, reason: cumulative.reason }
    if (cumulative.status === 'partial') {
      const userId = await resolveWorkflowPrincipalUserId(em, sourceWorkflow!)
      if (!userId) throw new Error('[internal] Pair continuation requires the native workflow execution principal')
      const followUpTask = await container.resolve<StrategyPairReviewService>(STRATEGY_PAIR_REVIEW_SERVICE).invite({
        ...scope, userId, caseId: agencyCase.id, strategyVersionId: request.strategyVersionId, tovVersionId: request.tovVersionId,
      })
      return { status: 'partial', orderRef: agencyCase.id, cumulative, followUpTask }
    }
    const analysis = agencyCase.workflowInstanceId ? await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: agencyCase.workflowInstanceId, workflowId: 'agency_operations.analysis.v1', deletedAt: null,
    }, undefined, scope) : null
    const planningReadiness = await research.getPlanningReadiness(scope, {
      ...request,
      ...(analysis ? { process: { workflowDefinitionId: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version } } : {}),
    })
    return { status: 'accepted', orderRef: agencyCase.id, cumulative, planningReadiness }
  }
}
