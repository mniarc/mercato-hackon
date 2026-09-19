import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AGENCY_TOV_RESEARCH_SERVICE, type AgencyTovResearchService } from '@/modules/agency_tov/lib/researchService'
import { tovRevisionRequestSchema } from '@/modules/agency_tov/lib/revision/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema } from '../contracts/clientSubmission'
import { STRATEGY_EXECUTION_RESULT_KEY, strategyExecutionActivityResultSchema, type NativeStrategyExecutionResult } from '../strategyExecution/contracts'
import { createTovRevisionBinding, tovFieldsFromFindings } from './binding'
import { TOV_REVISION_FUNCTION, TOV_REVISION_PREPARED_KEY, TOV_REVISION_RESULT_KEY, TOV_REVISION_STEP, nativeTovRevisionResultSchema, preparedTovRevisionSchema, tovCorrectionPolicySchema } from './contracts'

const contextSchema = z.object({ stepInstanceId: z.uuid().optional(), workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })

export function createTovRevisionActivities(container: AppContainer) {
  const binding = createTovRevisionBinding(container)
  async function load(rawContext: unknown) {
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const workflow = await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: context.workflowInstance.id,
      workflowId: context.workflowInstance.workflowId, deletedAt: null }, undefined, scope)
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, { ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null }, undefined, scope)
    if (!workflow || !submission) throw new Error('[internal] ToV correction requires the originating native submission')
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] ToV correction case is outside the submission scope')
    return { context, scope, em, workflow, submission, agencyCase }
  }
  type Source = Awaited<ReturnType<typeof load>>

  async function prepare(source: Source): Promise<z.infer<typeof preparedTovRevisionSchema>> {
    const { submission, workflow, scope } = source
    const clientRequest = await binding.load(submission, workflow.context.nativeClientTriageInterpretation)
    if (clientRequest) {
      const decision = z.object({ result: clientSubmissionDispositionSchema }).parse(workflow.context.clientTriageResult).result
      if (decision.kind !== 'change' || decision.source !== 'native_agent' || decision.effectsApplied
        || decision.targets.caseId !== submission.caseId || decision.targets.submissionId !== submission.id
        || decision.targets.documentVersionReference !== clientRequest.strategyVersionId) throw new Error('[internal] ToV correction does not match the saved G decision')
      return preparedTovRevisionSchema.parse({ status: 'ready', orderRef: submission.caseId, request: clientRequest })
    }
    const saved = z.object({ result: strategyExecutionActivityResultSchema }).safeParse(workflow.context[STRATEGY_EXECUTION_RESULT_KEY] ?? workflow.context.agencyStrategyExecution)
    if (!saved.success || saved.data.result.status !== 'completed' || saved.data.result.qaVerdict !== 'needs_agent_fix') {
      return { status: 'not_applicable', orderRef: submission.caseId, reason: 'no_supported_tov_correction' }
    }
    const result = saved.data.result
    if (result.orderRef !== submission.caseId) throw new Error('[internal] ToV QA correction belongs to another case')
    if (!result.strategyVersionId || !result.tovVersionId || !result.qaTaskRunId) throw new Error('[internal] ToV QA correction has no exact pair')
    const review = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getStrategyReview(scope, submission.caseId, result.strategyVersionId, result.tovVersionId)
    if (!review?.brief || !review.tov.specialistReference || review.qa.state !== 'assessed'
      || review.qa.taskRunId !== result.qaTaskRunId || review.qa.verdict !== 'needs_agent_fix') return { status: 'not_applicable', orderRef: submission.caseId, reason: 'pair_qa_unavailable' }
    const correction = tovFieldsFromFindings(review.qa.findings ?? [])
    if (!correction || correction.instructions.length > 20000) return { status: 'not_applicable', orderRef: submission.caseId, reason: 'pair_qa_requires_employee' }
    return preparedTovRevisionSchema.parse({ status: 'ready', orderRef: submission.caseId, request: {
      requestId: submission.id, previous: review.tov.specialistReference, briefVersionId: review.brief.versionId,
      strategyVersionId: review.strategy.versionId, source: { kind: 'pair_qa', qaTaskRunId: result.qaTaskRunId }, ...correction,
    } })
  }

  async function policy(source: Source) {
    const definition = await findOneWithDecryption(source.em, WorkflowDefinition, { ...source.scope, id: source.workflow.definitionId,
      workflowId: source.workflow.workflowId, version: source.workflow.version, deletedAt: null }, undefined, source.scope)
    if (!definition || !definition.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations'
      || definition.metadata.generatedBy.ownerId !== 'client_triage') return null
    const entries = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
      .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === TOV_REVISION_FUNCTION)
    const args = entries.length === 1 ? entries[0].config.args?.policy : null
    const parsed = tovCorrectionPolicySchema.safeParse({ ...args?.agencyTovRevision, pairQaMaxCostPln: args?.pairQaMaxCostPln })
    return parsed.success ? { ...parsed.data, definitionId: definition.id, definitionVersion: definition.version } : null
  }

  async function request(source: Source) {
    const saved = z.object({ result: preparedTovRevisionSchema }).parse(source.workflow.context[TOV_REVISION_PREPARED_KEY]).result
    if (saved.status !== 'ready' || saved.orderRef !== source.submission.caseId) throw new Error('[internal] ToV revision requires a saved bound correction')
    // Reuse immutable original/QA evidence on replay, never accept request fields from activity arguments.
    const actual = await prepare(source)
    if (actual.status !== 'ready' || !isDeepStrictEqual(saved.request, actual.request)) throw new Error('[internal] Saved ToV correction no longer matches its source')
    return tovRevisionRequestSchema.parse(saved.request)
  }

  return {
    async prepare(_args: unknown, rawContext: unknown): Promise<z.infer<typeof preparedTovRevisionSchema>> {
      const source = await load(rawContext)
      const prepared = await prepare(source)
      // Default configuration keeps the existing QA employee exception route.
      // An explicit client correction still retains its request in a truthful held state.
      if (prepared.status === 'ready' && prepared.request.source.kind === 'pair_qa'
        && (!await policy(source) || !parseBooleanWithDefault(process.env.AGENCY_TOV_EXECUTION_ENABLED, false))) {
        return { status: 'not_applicable', orderRef: source.submission.caseId, reason: 'revision_execution_not_authorized' }
      }
      return prepared
    },
    async revise(_args: unknown, rawContext: unknown) {
      const source = await load(rawContext)
      const revisionRequest = await request(source)
      const authorization = await policy(source)
      if (!authorization || !parseBooleanWithDefault(process.env.AGENCY_TOV_EXECUTION_ENABLED, false)) {
        return nativeTovRevisionResultSchema.parse({ orderRef: source.submission.caseId, revision: { status: 'not_configured', reason: 'revision_execution_not_authorized' } })
      }
      const pair = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getStrategyReview(source.scope, source.submission.caseId,
        revisionRequest.strategyVersionId, revisionRequest.previous.versionId)
      if (!pair?.strategy.isCurrent || !pair.brief?.isCurrent || pair.brief.versionId !== revisionRequest.briefVersionId
        || pair.brief.documentStatus !== 'approved') {
        return nativeTovRevisionResultSchema.parse({ orderRef: source.submission.caseId, revision: { status: 'not_ready', reason: 'evidence_unavailable' } })
      }
      const userId = await resolveWorkflowPrincipalUserId(source.em, source.workflow)
      if (!userId) throw new Error('[internal] ToV correction requires the native execution principal')
      const { pairQaMaxCostPln: _qaCap, ...executionPolicy } = authorization
      const revision = await container.resolve<AgencyTovResearchService>(AGENCY_TOV_RESEARCH_SERVICE).revise({
        context: { ...source.scope, userId, workflowInstanceId: source.workflow.id, stepId: TOV_REVISION_STEP,
          ...(source.context.stepInstanceId ? { invocationId: source.context.stepInstanceId } : {}) },
        request: revisionRequest, executionPolicy,
      })
      return nativeTovRevisionResultSchema.parse({ orderRef: source.submission.caseId, revision })
    },
    async reassess(_args: unknown, rawContext: unknown): Promise<NativeStrategyExecutionResult> {
      const source = await load(rawContext)
      const original = await request(source)
      const saved = z.object({ result: nativeTovRevisionResultSchema }).parse(source.workflow.context[TOV_REVISION_RESULT_KEY]).result
      if (saved.orderRef !== source.submission.caseId || saved.revision.status !== 'completed'
        || saved.revision.requestId !== original.requestId || saved.revision.previousVersionId !== original.previous.versionId) throw new Error('[internal] Reassessment requires the exact saved specialist revision')
      const authorization = await policy(source)
      const unavailable = (reason: 'missing_process_configuration' | 'missing_strategy_authorization' | 'execution_disabled') => ({ status: 'not_configured' as const, orderRef: source.submission.caseId, reason })
      if (!authorization) return unavailable('missing_strategy_authorization')
      if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return unavailable('execution_disabled')
      if (!source.agencyCase.workflowInstanceId) return unavailable('missing_process_configuration')
      const analysis = await findOneWithDecryption(source.em, WorkflowInstance, { ...source.scope, id: source.agencyCase.workflowInstanceId,
        workflowId: 'agency_operations.analysis.v1', deletedAt: null }, undefined, source.scope)
      if (!analysis) return unavailable('missing_process_configuration')
      const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
      const acceptance = await research.getBriefAcceptance(source.scope, source.submission.caseId, original.briefVersionId)
      if (!acceptance) return { status: 'not_ready', orderRef: source.submission.caseId, reason: 'pinned_input_missing', templateId: 'WZR-BRIEF' }
      const userId = await resolveWorkflowPrincipalUserId(source.em, source.workflow)
      if (!userId) throw new Error('[internal] Pair reassessment requires the native execution principal')
      return research.runStrategy({
        context: { ...source.scope, userId, workflowInstanceId: source.workflow.id, stepId: 'tov_pair_reassessment',
          ...(source.context.stepInstanceId ? { invocationId: source.context.stepInstanceId } : {}) },
        request: { orderRef: source.submission.caseId, briefVersionId: original.briefVersionId, acceptanceSubmissionId: acceptance.source.submissionId,
          process: { workflowDefinitionId: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version },
          maxCostPln: authorization.pairQaMaxCostPln, reassessStrategyVersionId: original.strategyVersionId, specialistTov: saved.revision.reference },
      })
    },
  }
}
