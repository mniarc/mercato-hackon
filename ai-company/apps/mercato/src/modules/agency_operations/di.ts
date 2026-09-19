import { asFunction, asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import {
  AGENCY_CASE_WORKFLOW_SERVICE,
  createAgencyCaseWorkflowService,
  deterministicAgentWorker,
} from './lib/agencyCaseWorkflowService'
import { createClientMaterialIntakeService } from './lib/clientMaterialIntakeService'
import { createClientCaseQueryService } from './lib/clientCaseQueryService'
import { CLIENT_CASE_QUERY_SERVICE } from './lib/contracts/clientCaseQuery'
import { AGENCY_HUMAN_ATTENTION_SERVICE, createAgencyHumanAttentionService } from './lib/humanAttentionService'
import { CLIENT_SUBMISSION_SERVICE } from './lib/contracts/clientSubmission'
import { createClientSubmissionService } from './lib/clientSubmissionService'
import { CLIENT_REPLY_SERVICE } from './lib/contracts/clientReply'
import { createClientReplyService } from './lib/clientReplyService'
import { CLIENT_ARTIFACT_SERVICE } from './lib/contracts/clientArtifact'
import { createClientArtifactService } from './lib/clientArtifactService'
import { CLIENT_TRIAGE_FUNCTION_NAME, deterministicClientTriage } from './lib/clientSubmissionWorkflow'
import { CLIENT_MATERIAL_INTAKE_SERVICE } from './lib/contracts'
import { AGENCY_AGENT_FUNCTION_NAME } from './workflows'
import { AGENCY_TOV_FUNCTION_NAME, createTovWorkflowActivity } from './lib/tovProcess'
import { createClientTriageActivities } from './agents/client-triage/activities'
import { PREPARE_CLIENT_TRIAGE_FUNCTION, PROJECT_CLIENT_TRIAGE_FUNCTION, ACCEPT_BRIEF_FUNCTION, ACCEPT_STRATEGY_PAIR_FUNCTION, ACCEPT_PLAN_FUNCTION, ACCEPT_POST_FUNCTION } from './agents/client-triage/workflow'
import { AGENCY_ANALYSIS_FUNCTION_NAME, createAnalysisWorkflowActivity } from './lib/analysisProcess'
import { BRIEF_RESPONSE_FUNCTION, BRIEF_REVIEW_SERVICE } from './lib/briefStrategyProcess/contracts'
import { createBriefReviewService } from './lib/briefStrategyProcess/service'
import { createAnalysisBriefReviewHandoff } from './lib/analysisProcess/briefReviewHandoff'
import { AGENCY_BRIEF_HANDOFF_FUNCTION } from './lib/analysisProcess/workflow'
import { createResearchExceptionHandoff, RESEARCH_EXCEPTION_HANDOFF_FUNCTION } from './lib/researchException/handoff'
import { EMPLOYEE_QUESTION_SERVICE, EMPLOYEE_QUESTION_RESPONSE_FUNCTION } from './lib/employeeQuestions/contracts'
import { createEmployeeQuestionService } from './lib/employeeQuestions/service'
import { createStrategyReadinessHandoff, STRATEGY_READINESS_HANDOFF_FUNCTION } from './lib/strategyHandoff/activity'
import { createStrategyExecutionActivity } from './lib/strategyExecution/activity'
import { STRATEGY_EXECUTION_FUNCTION, STRATEGY_REVIEW_HANDOFF_FUNCTION } from './lib/strategyExecution/contracts'
import { createStrategyReviewHandoff } from './lib/strategyExecution/reviewHandoff'
import { createStrategyPairReviewService } from './lib/strategyPairReview/service'
import { STRATEGY_PAIR_REVIEW_SERVICE, STRATEGY_PAIR_RESPONSE_FUNCTION } from './lib/strategyPairReview/contracts'
import { createStrategyPairContinuation } from './lib/strategyPairApproval/handoff'
import { STRATEGY_PAIR_CONTINUATION_FUNCTION } from './lib/strategyPairApproval/contracts'
import { createPlanningExecutionActivity } from './lib/planningExecution/activity'
import { PLANNING_EXECUTION_FUNCTION, PLAN_REVIEW_HANDOFF_FUNCTION } from './lib/planningExecution/contracts'
import { createPlanReviewHandoff } from './lib/planningExecution/reviewHandoff'
import { createPlanReviewService } from './lib/planReview/service'
import { PLAN_REVIEW_SERVICE, PLAN_RESPONSE_FUNCTION } from './lib/planReview/contracts'
import { POST_INSTRUCTION_FUNCTION } from './lib/planApproval/contracts'
import { createPostInstructionHandoff } from './lib/planApproval/handoff'
import { createPostExecutionActivity } from './lib/postExecution/activity'
import { POST_EXECUTION_FUNCTION } from './lib/postExecution/contracts'
import { createPostReviewService } from './lib/postReview/service'
import { POST_REVIEW_SERVICE, POST_RESPONSE_FUNCTION } from './lib/postReview/contracts'
import { createPostReviewHandoff } from './lib/postExecution/reviewHandoff'
import { POST_REVIEW_HANDOFF_FUNCTION } from './lib/postApproval/contracts'
import { createPublicationPreparationHandoff } from './lib/publicationPreparation/handoff'
import { PUBLICATION_PREPARATION_FUNCTION } from './lib/publicationPreparation/contracts'

export const AGENCY_AGENT_FUNCTION_DI_KEY = `workflowFunction:${AGENCY_AGENT_FUNCTION_NAME}` as const

export function register(container: AppContainer): void {
  const clientTriage = createClientTriageActivities(container)
  container.register({
    [`workflowFunction:${PUBLICATION_PREPARATION_FUNCTION}`]: asFunction(() => createPublicationPreparationHandoff(container)).scoped(),
    [POST_REVIEW_SERVICE]: asFunction(() => createPostReviewService(container)).scoped(),
    [`workflowFunction:${POST_RESPONSE_FUNCTION}`]: asFunction(
      () => container.resolve<ReturnType<typeof createPostReviewService>>(POST_REVIEW_SERVICE).receiveResponse,
    ).scoped(),
    [`workflowFunction:${POST_REVIEW_HANDOFF_FUNCTION}`]: asFunction(() => createPostReviewHandoff(container)).scoped(),
    [`workflowFunction:${ACCEPT_POST_FUNCTION}`]: asValue(clientTriage.acceptPost),
    [PLAN_REVIEW_SERVICE]: asFunction(() => createPlanReviewService(container)).scoped(),
    [`workflowFunction:${PLAN_RESPONSE_FUNCTION}`]: asFunction(
      () => container.resolve<ReturnType<typeof createPlanReviewService>>(PLAN_REVIEW_SERVICE).receiveResponse,
    ).scoped(),
    [`workflowFunction:${PLAN_REVIEW_HANDOFF_FUNCTION}`]: asFunction(() => createPlanReviewHandoff(container)).scoped(),
    [`workflowFunction:${POST_INSTRUCTION_FUNCTION}`]: asFunction(() => createPostInstructionHandoff(container)).scoped(),
    [`workflowFunction:${POST_EXECUTION_FUNCTION}`]: asFunction(() => createPostExecutionActivity(container)).scoped(),
    [`workflowFunction:${ACCEPT_PLAN_FUNCTION}`]: asValue(clientTriage.acceptPlan),
    [`workflowFunction:${PLANNING_EXECUTION_FUNCTION}`]: asFunction(() => createPlanningExecutionActivity(container)).scoped(),
    [`workflowFunction:${STRATEGY_PAIR_CONTINUATION_FUNCTION}`]: asFunction(() => createStrategyPairContinuation(container)).scoped(),
    [STRATEGY_PAIR_REVIEW_SERVICE]: asFunction(() => createStrategyPairReviewService(container)).scoped(),
    [`workflowFunction:${STRATEGY_PAIR_RESPONSE_FUNCTION}`]: asFunction(
      () => container.resolve<ReturnType<typeof createStrategyPairReviewService>>(STRATEGY_PAIR_REVIEW_SERVICE).receiveResponse,
    ).scoped(),
    [`workflowFunction:${STRATEGY_REVIEW_HANDOFF_FUNCTION}`]: asFunction(() => createStrategyReviewHandoff(container)).scoped(),
    [`workflowFunction:${STRATEGY_EXECUTION_FUNCTION}`]: asFunction(() => createStrategyExecutionActivity(container)).scoped(),
    [`workflowFunction:${STRATEGY_READINESS_HANDOFF_FUNCTION}`]: asFunction(() => createStrategyReadinessHandoff(container)).scoped(),
    [EMPLOYEE_QUESTION_SERVICE]: asFunction(() => createEmployeeQuestionService(container)).scoped(),
    [`workflowFunction:${EMPLOYEE_QUESTION_RESPONSE_FUNCTION}`]: asFunction(
      () => container.resolve<ReturnType<typeof createEmployeeQuestionService>>(EMPLOYEE_QUESTION_SERVICE).receiveResponse,
    ).scoped(),
    [`workflowFunction:${RESEARCH_EXCEPTION_HANDOFF_FUNCTION}`]: asFunction(() => createResearchExceptionHandoff(container)).scoped(),
    [`workflowFunction:${ACCEPT_BRIEF_FUNCTION}`]: asValue(clientTriage.acceptBrief),
    [`workflowFunction:${ACCEPT_STRATEGY_PAIR_FUNCTION}`]: asValue(clientTriage.acceptStrategyPair),
    [BRIEF_REVIEW_SERVICE]: asFunction(() => createBriefReviewService(container)).scoped(),
    [`workflowFunction:${BRIEF_RESPONSE_FUNCTION}`]: asFunction(
      () => container.resolve<ReturnType<typeof createBriefReviewService>>(BRIEF_REVIEW_SERVICE).receiveResponse,
    ).scoped(),
    [`workflowFunction:${AGENCY_BRIEF_HANDOFF_FUNCTION}`]: asFunction(
      () => createAnalysisBriefReviewHandoff(container),
    ).scoped(),
    [`workflowFunction:${PREPARE_CLIENT_TRIAGE_FUNCTION}`]: asValue(clientTriage.prepare),
    [`workflowFunction:${PROJECT_CLIENT_TRIAGE_FUNCTION}`]: asValue(clientTriage.project),
    [AGENCY_CASE_WORKFLOW_SERVICE]: asFunction(
      () => createAgencyCaseWorkflowService(container),
    ).scoped(),
    [CLIENT_MATERIAL_INTAKE_SERVICE]: asFunction(
      () => createClientMaterialIntakeService(container),
    ).scoped(),
    [CLIENT_CASE_QUERY_SERVICE]: asFunction(
      () => createClientCaseQueryService(container),
    ).scoped(),
    [AGENCY_AGENT_FUNCTION_DI_KEY]: asValue(deterministicAgentWorker),
    [AGENCY_HUMAN_ATTENTION_SERVICE]: asFunction(
      () => createAgencyHumanAttentionService(container),
    ).scoped(),
    [CLIENT_SUBMISSION_SERVICE]: asFunction(
      () => createClientSubmissionService(container),
    ).scoped(),
    [CLIENT_REPLY_SERVICE]: asFunction(
      () => createClientReplyService(container),
    ).scoped(),
    [CLIENT_ARTIFACT_SERVICE]: asFunction(
      () => createClientArtifactService(container),
    ).scoped(),
    [`workflowFunction:${CLIENT_TRIAGE_FUNCTION_NAME}`]: asValue(deterministicClientTriage),
    [`workflowFunction:${AGENCY_TOV_FUNCTION_NAME}`]: asFunction(
      () => createTovWorkflowActivity(container),
    ).scoped(),
    [`workflowFunction:${AGENCY_ANALYSIS_FUNCTION_NAME}`]: asFunction(
      () => createAnalysisWorkflowActivity(container),
    ).scoped(),
  })
}
