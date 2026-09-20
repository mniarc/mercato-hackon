import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema } from '../contracts/clientSubmission'
import { createPostRevisionBinding } from './binding'
import { POST_REVISION_STEP_ID, postRevisionUnavailableSchema, type NativePostRevisionResult } from './contracts'

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }

const contextSchema = z.object({ stepInstanceId: z.uuid().optional(), workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })
const authorizationSchema = z.object({ maxCostPln: z.number().positive() }).strict()

export function createPostRevisionActivity(container: AppContainer) {
  const binding = createPostRevisionBinding(container)
  return async (_input: unknown, rawContext: unknown): Promise<NativePostRevisionResult> => {
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    const workflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: context.workflowInstance.id, workflowId: context.workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    if (!submission || !workflow) throw new Error('[internal] Post revision submission is outside the native workflow')
    const request = await binding.load(submission, workflow.context.nativeClientTriageInterpretation)
    if (!request) throw new Error('[internal] Post revision requires the original invitation response and saved native change decision')
    const saved = z.object({ result: clientSubmissionDispositionSchema }).parse(workflow.context.clientTriageResult).result
    if (saved.kind !== 'change' || saved.source !== 'native_agent' || saved.effectsApplied
      || saved.targets.caseId !== submission.caseId || saved.targets.submissionId !== submission.id
      || saved.targets.documentVersionReference !== request.postVersionId) {
      throw new Error('[internal] Post revision does not match the saved G disposition')
    }
    if (record(workflow.context.nativeClientTriageInterpretation).changeScope !== 'post_content') {
      return { status: 'not_ready', orderRef: submission.caseId, reason: record(workflow.context.nativeClientTriageInterpretation).changeScope === 'upstream'
        ? 'post_change_scope_requires_upstream_review' : 'post_change_scope_requires_clarification' }
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Post revision case is outside the submission scope')
    const unavailable = (reason: z.infer<typeof postRevisionUnavailableSchema>['reason']) => postRevisionUnavailableSchema.parse({
      status: 'not_configured', orderRef: agencyCase.id, reason,
    })
    if (!agencyCase.workflowInstanceId) return unavailable('missing_process_configuration')
    const analysis = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: agencyCase.workflowInstanceId, workflowId: 'agency_operations.analysis.v1', deletedAt: null,
    }, undefined, scope)
    if (!analysis) return unavailable('missing_process_configuration')
    const definition = await findOneWithDecryption(em, WorkflowDefinition, {
      ...scope, id: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version, deletedAt: null,
    }, undefined, scope)
    if (!definition || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'analysis') return unavailable('missing_process_configuration')
    const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
      .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === 'agency_operations.runAnalysis')
    const authorization = activities.length === 1 ? authorizationSchema.safeParse(activities[0].config.args?.policy?.postRevision) : null
    if (!authorization?.success) return unavailable('missing_post_revision_authorization')
    if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return unavailable('execution_disabled')
    const userId = await resolveWorkflowPrincipalUserId(em, workflow)
    if (!userId) throw new Error('[internal] Post revision requires the native workflow execution principal')
    const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
    const executionContext = { ...scope, userId, workflowInstanceId: workflow.id, stepId: POST_REVISION_STEP_ID,
      ...(context.stepInstanceId ? { invocationId: context.stepInstanceId } : {}) }
    const revised = await research.runPostRevision({
      context: executionContext,
      request: { ...request, process: { workflowDefinitionId: definition.id, workflowId: definition.workflowId, version: definition.version }, maxCostPln: authorization.data.maxCostPln },
    })
    if (revised.status !== 'completed' || !revised.evidenceRequest || !revised.postVersionId || !revised.qaTaskRunId) return revised
    const evidenceAuthorization = authorizationSchema.safeParse(activities[0].config.args?.policy?.postEvidence)
    if (!evidenceAuthorization.success) return { ...revised, readyForReview: false, evidencePendingReason: 'missing_post_evidence_authorization' }
    const returned = await research.runPostEvidence({ context: executionContext, request: {
      orderRef: agencyCase.id, instructionVersionId: revised.instructionVersionId,
      postVersionId: revised.postVersionId, qaTaskRunId: revised.qaTaskRunId, maxCostPln: evidenceAuthorization.data.maxCostPln,
    } })
    if (returned.status === 'not_ready' || returned.status === 'execution_incomplete') return {
      ...revised, readyForReview: false, evidencePendingReason: returned.reason,
    }
    return { ...revised, ...returned, evidenceRequest: undefined, escalationVersionId: returned.escalationVersionId,
      taskRunIds: [...new Set([...revised.taskRunIds, ...returned.taskRunIds])],
      documentVersionIds: [...new Set([...revised.documentVersionIds, ...returned.documentVersionIds])],
      agentRunIds: [...new Set([...revised.agentRunIds, ...returned.agentRunIds])],
      spentPln: revised.spentPln + returned.spentPln,
    }
  }
}
