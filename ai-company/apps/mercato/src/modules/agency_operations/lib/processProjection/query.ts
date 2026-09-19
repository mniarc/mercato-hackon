import type { EntityManager } from '@mikro-orm/postgresql'
import { isDeepStrictEqual } from 'node:util'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import {
  collectTaskEntityTypesFromTasks,
  filterVisibleTasks,
  resolveTaskVisibilityForRequest,
} from '@open-mercato/core/modules/workflows/lib/task-visibility-request'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema, clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { CLIENT_SUBMISSION_WORKFLOW_ID, CLIENT_TRIAGE_RESULT_KEY } from '../clientSubmissionWorkflow'
import { clientTriageInterpretationSchema } from '../../agents/client-triage/contract'
import { CLIENT_TRIAGE_INTERPRETATION_KEY, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, POST_RESEARCH_EXCEPTION_WAITING_STEP_ID } from '../../agents/client-triage/workflow'
import { RESEARCH_EXCEPTION_STEP_ID } from '../researchException/workflow'
import { CLIENT_TRIAGE_EXCEPTION_STEP_ID } from '../clientTriageException/workflow'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_WORKFLOW_ID } from '../analysisProcess/workflow'
import { analysisProcessResultSchema } from '../analysisProcess/contracts'
import { STRATEGY_READINESS_RESULT_KEY } from '../strategyHandoff/activity'
import { STRATEGY_EXECUTION_RESULT_KEY, strategyExecutionActivityResultSchema, strategyReviewHandoffResultSchema } from '../strategyExecution/contracts'
import { STRATEGY_PAIR_CONTINUATION_RESULT_KEY } from '../strategyPairApproval/contracts'
import { PLANNING_EXECUTION_RESULT_KEY, planningExecutionActivityResultSchema, planningReviewHandoffResultSchema } from '../planningExecution/contracts'
import { POST_INSTRUCTION_RESULT_KEY } from '../planApproval/contracts'
import { postInstructionExecutionResultSchema, publicationPreparationResultSchema } from '@/modules/agency_research/lib/contracts'
import { PUBLICATION_PREPARATION_RESULT_KEY } from '../publicationPreparation/contracts'
import { POST_EXECUTION_RESULT_KEY, postExecutionActivityResultSchema, postReviewHandoffResultSchema } from '../postExecution/contracts'
import { BRIEF_REVISION_RESULT_KEY, briefRevisionActivityResultSchema } from '../briefRevision/contracts'
import { POST_REVISION_RESULT_KEY, postRevisionActivityResultSchema, postRevisionReviewHandoffResultSchema } from '../postRevision/contracts'
import { caseBriefRevisionHandoffSchema, caseStrategyHandoffSchema, caseStrategyPairContinuationSchema, type CaseAnalysisProcess, type CaseProcessResponse, type CaseProcessSubmission } from './contract'

type EmployeeScope = { tenantId: string; organizationId: string; userId: string; roleNames: string[] }

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function projectSubmissionProcess(submission: AgencyClientSubmission, workflow: WorkflowInstance | null, tasks: UserTask[]): CaseProcessSubmission {
  const context = record(workflow?.context)
  const savedResult = record(context[CLIENT_TRIAGE_RESULT_KEY]).result
  const disposition = clientSubmissionDispositionSchema.safeParse(savedResult)
  const interpretation = clientTriageInterpretationSchema.safeParse(context[CLIENT_TRIAGE_INTERPRETATION_KEY])
  const native = workflow?.workflowId === NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID
  const original = clientSubmissionRequestSchema.parse(submission.original)
  const postRevision = postRevisionActivityResultSchema.safeParse(record(context[POST_REVISION_RESULT_KEY]).result)
  const postRevisionHandoff = postRevisionReviewHandoffResultSchema.safeParse(record(context.agencyPostRevisionInvitation).result)
  const scopedPostRevision = native && original.postReviewResponse?.kind === 'message'
    && postRevision.success && postRevision.data.orderRef === submission.caseId
    && (!('submissionId' in postRevision.data) || postRevision.data.submissionId === submission.id)
    && (!('previousPostVersionId' in postRevision.data) || postRevision.data.previousPostVersionId === original.postReviewResponse.post.versionId)
    ? postRevision.data : null
  const scopedPostRevisionHandoff = scopedPostRevision && postRevisionHandoff.success
    && postRevisionHandoff.data.orderRef === submission.caseId
    && (postRevisionHandoff.data.status === 'blocked'
      ? isDeepStrictEqual(postRevisionHandoff.data.revision, scopedPostRevision)
      : scopedPostRevision.status === 'completed' && scopedPostRevision.readyForReview
        && postRevisionHandoff.data.versionId === scopedPostRevision.postVersionId)
    ? postRevisionHandoff.data : null
  const briefRevision = briefRevisionActivityResultSchema.safeParse(record(context[BRIEF_REVISION_RESULT_KEY]).result)
  const briefRevisionHandoff = caseBriefRevisionHandoffSchema.safeParse(record(context.agencyBriefRevisionInvitation).result)
  const scopedBriefRevision = native && briefRevision.success && briefRevision.data.orderRef === submission.caseId
    && (!('submissionId' in briefRevision.data) || briefRevision.data.submissionId === submission.id)
    && briefRevisionHandoff.success
    && (briefRevisionHandoff.data.status === 'blocked'
      ? isDeepStrictEqual(briefRevisionHandoff.data.revision, briefRevision.data)
      : 'briefVersionId' in briefRevision.data && (briefRevision.data.status === 'completed'
        ? briefRevisionHandoff.data.versionId === briefRevision.data.briefVersionId
        : briefRevision.data.status === 'needs_client_data' && briefRevision.data.briefVersionId === null
          && briefRevisionHandoff.data.versionId === briefRevision.data.previousBriefVersionId))
    ? briefRevisionHandoff.data : null
  const strategyHandoff = caseStrategyHandoffSchema.safeParse(record(context[STRATEGY_READINESS_RESULT_KEY]).result)
  const strategyExecution = strategyExecutionActivityResultSchema.safeParse(record(context[STRATEGY_EXECUTION_RESULT_KEY] ?? context.agencyStrategyExecution).result)
  const strategyReviewHandoff = strategyReviewHandoffResultSchema.safeParse(record(context.agencyStrategyPairInvitation).result)
  const strategyPairContinuation = caseStrategyPairContinuationSchema.safeParse(record(context[STRATEGY_PAIR_CONTINUATION_RESULT_KEY]).result)
  const planningExecution = planningExecutionActivityResultSchema.safeParse(record(context[PLANNING_EXECUTION_RESULT_KEY] ?? context.agencyPlanningExecution).result)
  const planningReviewHandoff = planningReviewHandoffResultSchema.safeParse(record(context.agencyPlanInvitation).result)
  const postInstruction = postInstructionExecutionResultSchema.safeParse(record(context[POST_INSTRUCTION_RESULT_KEY]).result)
  const postExecution = postExecutionActivityResultSchema.safeParse(record(context[POST_EXECUTION_RESULT_KEY] ?? context.agencyPostExecution).result)
  const postReviewHandoff = postReviewHandoffResultSchema.safeParse(record(context.agencyPostInvitation).result)
  const scopedPostExecution = native && postExecution.success && postExecution.data.orderRef === submission.caseId
    && (!('selectionSubmissionId' in postExecution.data) || postExecution.data.selectionSubmissionId === submission.id)
    ? postExecution.data : null
  const scopedPostReviewHandoff = native && postReviewHandoff.success && postReviewHandoff.data.orderRef === submission.caseId
    && (postReviewHandoff.data.status === 'blocked'
      ? postReviewHandoff.data.execution === null
        ? !postExecution.success && postReviewHandoff.data.reason === 'missing_post_execution'
        : scopedPostExecution !== null && isDeepStrictEqual(postReviewHandoff.data.execution, scopedPostExecution)
      : scopedPostExecution?.status === 'completed' && scopedPostExecution.readyForReview
        && scopedPostExecution.qaVerdict === 'pass_for_draft' && !!scopedPostExecution.postVersionId && !scopedPostExecution.escalationVersionId)
    ? postReviewHandoff.data : null
  const publicationPreparation = publicationPreparationResultSchema.safeParse(record(context[PUBLICATION_PREPARATION_RESULT_KEY]).result)
  const scaffold = workflow?.workflowId === CLIENT_SUBMISSION_WORKFLOW_ID
  const active = workflow?.status === 'PAUSED' || workflow?.status === 'WAITING_FOR_ACTIVITIES' || workflow?.status === 'RUNNING'
  const error = workflow?.errorMessage ?? (workflow?.currentStepId === CLIENT_TRIAGE_EXCEPTION_STEP_ID ? record(context.__error).message : null)
  return {
    submissionId: submission.id,
    eventId: submission.eventId,
    createdAt: submission.createdAt.toISOString(),
    original,
    workflow: workflow ? {
      id: workflow.id, workflowId: workflow.workflowId, version: workflow.version,
      status: workflow.status, currentStepId: workflow.currentStepId,
      mode: native ? 'native_agent' : scaffold ? 'deterministic_scaffold' : 'unknown',
      waitingFor: active && (native || scaffold) && workflow.currentStepId === 'client_reply'
        ? 'client'
        : active && native && [CLIENT_TRIAGE_EXCEPTION_STEP_ID, RESEARCH_EXCEPTION_STEP_ID, POST_RESEARCH_EXCEPTION_WAITING_STEP_ID].includes(workflow.currentStepId) ? 'employee' : null,
      routeUnapplied: native && workflow.currentStepId === 'unapplied',
      error: typeof error === 'string' ? error : null,
    } : null,
    disposition: disposition.success && disposition.data.targets.caseId === submission.caseId && disposition.data.targets.submissionId === submission.id
      ? disposition.data : null,
    interpretation: interpretation.success ? interpretation.data : null,
    briefRevisionHandoff: scopedBriefRevision,
    strategyHandoff: native && strategyHandoff.success && strategyHandoff.data.orderRef === submission.caseId
      ? strategyHandoff.data : null,
    strategyExecution: native && strategyExecution.success && strategyExecution.data.orderRef === submission.caseId
      ? strategyExecution.data : null,
    strategyReviewHandoff: native && strategyReviewHandoff.success && strategyReviewHandoff.data.orderRef === submission.caseId
      ? strategyReviewHandoff.data : null,
    strategyPairContinuation: native && strategyPairContinuation.success
      && strategyPairContinuation.data.orderRef === submission.caseId
      && strategyPairContinuation.data.cumulative.orderRef === submission.caseId
      && (strategyPairContinuation.data.status !== 'accepted' || strategyPairContinuation.data.planningReadiness.orderRef === submission.caseId)
      ? strategyPairContinuation.data : null,
    planningExecution: native && planningExecution.success && planningExecution.data.orderRef === submission.caseId
      ? planningExecution.data : null,
    planningReviewHandoff: native && planningReviewHandoff.success && planningReviewHandoff.data.orderRef === submission.caseId
      ? planningReviewHandoff.data : null,
    postInstruction: native && postInstruction.success && postInstruction.data.orderRef === submission.caseId
      && (postInstruction.data.status !== 'ready' || postInstruction.data.selectionSubmissionId === submission.id)
      ? postInstruction.data : null,
    postExecution: scopedPostExecution,
    postReviewHandoff: scopedPostReviewHandoff,
    publicationPreparation: native && publicationPreparation.success && publicationPreparation.data.orderRef === submission.caseId
      && (publicationPreparation.data.status !== 'prepared' || publicationPreparation.data.acceptanceSubmissionId === submission.id)
      ? publicationPreparation.data : null,
    postRevision: scopedPostRevision,
    postRevisionHandoff: scopedPostRevisionHandoff,
    tasks: tasks.map((task) => ({
      id: task.id, status: task.status, assignedTo: task.assignedTo ?? null,
      assignedToRoles: task.assignedToRoles ?? [], claimedBy: task.claimedBy ?? null,
    })),
  }
}

export function projectAnalysisProcess(caseId: string, workflow: WorkflowInstance | null): CaseAnalysisProcess | null {
  if (workflow?.workflowId !== AGENCY_ANALYSIS_WORKFLOW_ID) return null
  const context = record(workflow.context)
  const saved = analysisProcessResultSchema.safeParse(record(context[AGENCY_ANALYSIS_RESULT_KEY] ?? context.agencyAnalysisResult).result)
  return {
    id: workflow.id, workflowId: workflow.workflowId, version: workflow.version,
    status: workflow.status, currentStepId: workflow.currentStepId,
    awaitingFollowUp: workflow.currentStepId === 'waiting' && (workflow.status === 'PAUSED' || workflow.status === 'RUNNING'),
    result: saved.success && saved.data.caseId === caseId ? saved.data : null,
    error: workflow.errorMessage ?? null,
  }
}

export async function readCaseProcess(container: AppContainer, caseId: string, employee: EmployeeScope): Promise<CaseProcessResponse | null> {
  const em = container.resolve<EntityManager>('em')
  const scope = { tenantId: employee.tenantId, organizationId: employee.organizationId }
  const agencyCase = await findOneWithDecryption(em, AgencyCase, { id: caseId, ...scope, deletedAt: null }, undefined, scope)
  if (!agencyCase) return null
  const rows = await findWithDecryption(em, AgencyClientSubmission, {
    caseId, customerEntityId: agencyCase.customerEntityId, ...scope, deletedAt: null,
  }, { orderBy: { createdAt: 'desc', id: 'desc' }, limit: 101 }, scope)
  const submissions = rows.slice(0, 100)
  const instanceIds = [...new Set([
    ...(agencyCase.workflowInstanceId ? [agencyCase.workflowInstanceId] : []),
    ...submissions.flatMap((submission) => submission.workflowInstanceId ? [submission.workflowInstanceId] : []),
  ])]
  const workflows = instanceIds.length ? await findWithDecryption(em, WorkflowInstance, {
    id: { $in: instanceIds }, ...scope, deletedAt: null,
  }, undefined, scope) : []
  const tasks = workflows.length ? await findWithDecryption(em, UserTask, {
    workflowInstanceId: { $in: workflows.map((workflow) => workflow.id) }, ...scope,
    status: { $in: ['PENDING', 'IN_PROGRESS'] },
  }, { orderBy: { createdAt: 'desc' } }, scope) : []
  const visibility = tasks.length ? await resolveTaskVisibilityForRequest({
    container, em, auth: { userId: employee.userId, tenantId: employee.tenantId, roleNames: employee.roleNames },
    organizationIds: [employee.organizationId], aclOrganizationId: employee.organizationId,
    entityTypes: collectTaskEntityTypesFromTasks(tasks),
  }) : null
  const visibleTasks = visibility ? filterVisibleTasks(visibility, tasks) : []
  return {
    caseId, hasMore: rows.length > 100,
    analysis: projectAnalysisProcess(caseId, workflows.find((workflow) => workflow.id === agencyCase.workflowInstanceId) ?? null),
    submissions: submissions.map((submission) => {
      const workflow = workflows.find((item) => item.id === submission.workflowInstanceId) ?? null
      return projectSubmissionProcess(submission, workflow, visibleTasks.filter((task) => task.workflowInstanceId === workflow?.id))
    }),
  }
}
