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
import { STAFF_TOV_COMPLETION_HANDLER, STAFF_TOV_INTAKE_SERVICE } from './lib/tovIntake/contracts'
import { createQueueSpecialistCheckActivity, createSpecialistContinuationHandler } from './lib/strategyExecution/specialistContinuation'
import { STRATEGY_SPECIALIST_WAIT_FUNCTION } from './lib/strategyExecution/contracts'
import { createStaffTovIntakeService } from './lib/tovIntake/service'
import { createClientTriageActivities } from './agents/client-triage/activities'
import { PREPARE_CLIENT_TRIAGE_FUNCTION, PROJECT_CLIENT_TRIAGE_FUNCTION, ACCEPT_BRIEF_FUNCTION, ACCEPT_STRATEGY_PAIR_FUNCTION, ACCEPT_PLAN_FUNCTION, ACCEPT_POST_FUNCTION } from './agents/client-triage/workflow'
import { AGENCY_ANALYSIS_FUNCTION_NAME, createAnalysisWorkflowActivity } from './lib/analysisProcess'
import { BRIEF_RESPONSE_FUNCTION, BRIEF_REVIEW_SERVICE } from './lib/briefStrategyProcess/contracts'
import { createBriefReviewService } from './lib/briefStrategyProcess/service'
import { createAnalysisBriefReviewHandoff } from './lib/analysisProcess/briefReviewHandoff'
import { AGENCY_BRIEF_HANDOFF_FUNCTION } from './lib/analysisProcess/workflow'
import { createResearchExceptionHandoff, createPostResearchExceptionHandoff, RESEARCH_EXCEPTION_HANDOFF_FUNCTION } from './lib/researchException/handoff'
import { POST_RESEARCH_EXCEPTION_HANDOFF_FUNCTION, STRATEGY_RESEARCH_EXCEPTION_HANDOFF_FUNCTION, PLANNING_RESEARCH_EXCEPTION_HANDOFF_FUNCTION } from './lib/researchException/contracts'
import { createStrategyResearchExceptionHandoff } from './lib/researchException/strategyHandoff'
import { createPlanningResearchExceptionHandoff } from './lib/researchException/planningHandoff'
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
import { createPublicationConsentRequestService } from './lib/publicationConsentRequest/service'
import { PUBLICATION_CONSENT_REQUEST_SERVICE, PUBLICATION_CONSENT_FUNCTION } from './lib/publicationConsentRequest/contracts'
import { POST_REVIEW_SERVICE, POST_RESPONSE_FUNCTION } from './lib/postReview/contracts'
import { createPostReviewHandoff } from './lib/postExecution/reviewHandoff'
import { POST_REVIEW_HANDOFF_FUNCTION } from './lib/postApproval/contracts'
import { createPublicationPreparationHandoff } from './lib/publicationPreparation/handoff'
import { PUBLICATION_PREPARATION_FUNCTION } from './lib/publicationPreparation/contracts'
import { DEMO_PURCHASE_SERVICE } from './lib/orderBootstrap/contracts'
import { createDemoPurchaseService } from './lib/orderBootstrap/service'
import { BRIEF_REVISION_FUNCTION, BRIEF_REVISION_REVIEW_FUNCTION, BRIEF_REVISION_EXCEPTION_FUNCTION } from './lib/briefRevision/contracts'
import { createBriefRevisionActivity } from './lib/briefRevision/activity'
import { createBriefRevisionReviewHandoff } from './lib/briefRevision/reviewHandoff'
import { createBriefRevisionResearchExceptionHandoff } from './lib/briefRevision/exceptionHandoff'
import { POST_REVISION_FUNCTION, POST_REVISION_REVIEW_FUNCTION, POST_REVISION_EXCEPTION_FUNCTION } from './lib/postRevision/contracts'
import { createPostRevisionActivity } from './lib/postRevision/activity'
import { createPostRevisionReviewHandoff } from './lib/postRevision/reviewHandoff'
import { createPostRevisionResearchExceptionHandoff } from './lib/postRevision/exceptionHandoff'
import { AGENCY_PUBLICATION_DESTINATION_SERVICE } from './lib/publicationDestination/contracts'
import { createPublicationDestinationService } from './lib/publicationDestination/service'
import { MATERIAL_REVISION_FUNCTION, MATERIAL_REVISION_REVIEW_FUNCTION, MATERIAL_REVISION_EXCEPTION_FUNCTION } from './lib/materialRevision/contracts'
import { createMaterialRevisionActivity } from './lib/materialRevision/activity'
import { createMaterialRevisionReviewHandoff } from './lib/materialRevision/reviewHandoff'
import { createMaterialRevisionResearchExceptionHandoff } from './lib/materialRevision/exceptionHandoff'
import { SALES_QUESTIONS_SERVICE, PREPARE_SALES_QUESTION, PREPARE_SALES_ANSWER, RECORD_SALES_ANSWER } from './lib/salesQuestions/contracts'
import { createSalesQuestionsService } from './lib/salesQuestions/service'
import { createSalesQuestionActivities } from './lib/salesQuestions/activities'

export const AGENCY_AGENT_FUNCTION_DI_KEY = `workflowFunction:${AGENCY_AGENT_FUNCTION_NAME}` as const

export function register(container: AppContainer): void {
  const clientTriage = createClientTriageActivities(container)
  container.register({
    [SALES_QUESTIONS_SERVICE]: asFunction(() => createSalesQuestionsService(container)).scoped(),
    [`workflowFunction:${PREPARE_SALES_QUESTION}`]: asFunction(() => createSalesQuestionActivities(container).prepareQuestion).scoped(),
    [`workflowFunction:${PREPARE_SALES_ANSWER}`]: asFunction(() => createSalesQuestionActivities(container).prepareAnswer).scoped(),
    [`workflowFunction:${RECORD_SALES_ANSWER}`]: asFunction(() => createSalesQuestionActivities(container).recordAnswer).scoped(),
    [PUBLICATION_CONSENT_REQUEST_SERVICE]: asFunction(() => createPublicationConsentRequestService(container)).scoped(),
    [`workflowFunction:${PUBLICATION_CONSENT_FUNCTION}`]: asFunction(
      () => container.resolve<ReturnType<typeof createPublicationConsentRequestService>>(PUBLICATION_CONSENT_REQUEST_SERVICE).receiveResponse,
    ).scoped(),
    [AGENCY_PUBLICATION_DESTINATION_SERVICE]: asFunction(() => createPublicationDestinationService(container)).scoped(),
    [`workflowFunction:${MATERIAL_REVISION_FUNCTION}`]: asFunction(() => createMaterialRevisionActivity(container)).scoped(),
    [`workflowFunction:${MATERIAL_REVISION_REVIEW_FUNCTION}`]: asFunction(() => createMaterialRevisionReviewHandoff(container)).scoped(),
    [`workflowFunction:${MATERIAL_REVISION_EXCEPTION_FUNCTION}`]: asFunction(() => createMaterialRevisionResearchExceptionHandoff(container)).scoped(),
    [`workflowFunction:${BRIEF_REVISION_FUNCTION}`]: asFunction(() => createBriefRevisionActivity(container)).scoped(),
    [`workflowFunction:${POST_REVISION_FUNCTION}`]: asFunction(() => createPostRevisionActivity(container)).scoped(),
    [`workflowFunction:${POST_REVISION_REVIEW_FUNCTION}`]: asFunction(() => createPostRevisionReviewHandoff(container)).scoped(),
    [`workflowFunction:${POST_REVISION_EXCEPTION_FUNCTION}`]: asFunction(() => createPostRevisionResearchExceptionHandoff(container)).scoped(),
    [`workflowFunction:${BRIEF_REVISION_REVIEW_FUNCTION}`]: asFunction(() => createBriefRevisionReviewHandoff(container)).scoped(),
    [`workflowFunction:${BRIEF_REVISION_EXCEPTION_FUNCTION}`]: asFunction(() => createBriefRevisionResearchExceptionHandoff(container)).scoped(),
    [DEMO_PURCHASE_SERVICE]: asFunction(() => createDemoPurchaseService(container)).scoped(),
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
    [STAFF_TOV_COMPLETION_HANDLER]: asFunction(() => createSpecialistContinuationHandler(container)).scoped(),
    [`workflowFunction:${STRATEGY_SPECIALIST_WAIT_FUNCTION}`]: asFunction(() => createQueueSpecialistCheckActivity(container)).scoped(),
    [`workflowFunction:${STRATEGY_READINESS_HANDOFF_FUNCTION}`]: asFunction(() => createStrategyReadinessHandoff(container)).scoped(),
    [EMPLOYEE_QUESTION_SERVICE]: asFunction(() => createEmployeeQuestionService(container)).scoped(),
    [`workflowFunction:${EMPLOYEE_QUESTION_RESPONSE_FUNCTION}`]: asFunction(
      () => container.resolve<ReturnType<typeof createEmployeeQuestionService>>(EMPLOYEE_QUESTION_SERVICE).receiveResponse,
    ).scoped(),
    [`workflowFunction:${RESEARCH_EXCEPTION_HANDOFF_FUNCTION}`]: asFunction(() => createResearchExceptionHandoff(container)).scoped(),
    [`workflowFunction:${POST_RESEARCH_EXCEPTION_HANDOFF_FUNCTION}`]: asFunction(() => createPostResearchExceptionHandoff(container)).scoped(),
    [`workflowFunction:${STRATEGY_RESEARCH_EXCEPTION_HANDOFF_FUNCTION}`]: asFunction(() => createStrategyResearchExceptionHandoff(container)).scoped(),
    [`workflowFunction:${PLANNING_RESEARCH_EXCEPTION_HANDOFF_FUNCTION}`]: asFunction(() => createPlanningResearchExceptionHandoff(container)).scoped(),
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
    [STAFF_TOV_INTAKE_SERVICE]: asFunction(
      () => createStaffTovIntakeService(container),
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
