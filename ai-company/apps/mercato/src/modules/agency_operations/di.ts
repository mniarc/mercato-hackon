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
import { PREPARE_CLIENT_TRIAGE_FUNCTION, PROJECT_CLIENT_TRIAGE_FUNCTION } from './agents/client-triage/workflow'
import { AGENCY_ANALYSIS_FUNCTION_NAME, createAnalysisWorkflowActivity } from './lib/analysisProcess'

export const AGENCY_AGENT_FUNCTION_DI_KEY = `workflowFunction:${AGENCY_AGENT_FUNCTION_NAME}` as const

export function register(container: AppContainer): void {
  const clientTriage = createClientTriageActivities(container)
  container.register({
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
