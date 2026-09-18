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
import { CLIENT_TRIAGE_FUNCTION_NAME, deterministicClientTriage } from './lib/clientSubmissionWorkflow'
import { CLIENT_MATERIAL_INTAKE_SERVICE } from './lib/contracts'
import { AGENCY_AGENT_FUNCTION_NAME } from './workflows'
import { AGENCY_TOV_FUNCTION_NAME, createTovWorkflowActivity } from './lib/tovProcess'

export const AGENCY_AGENT_FUNCTION_DI_KEY = `workflowFunction:${AGENCY_AGENT_FUNCTION_NAME}` as const

export function register(container: AppContainer): void {
  container.register({
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
    [`workflowFunction:${CLIENT_TRIAGE_FUNCTION_NAME}`]: asValue(deterministicClientTriage),
    [`workflowFunction:${AGENCY_TOV_FUNCTION_NAME}`]: asFunction(
      () => createTovWorkflowActivity(container),
    ).scoped(),
  })
}
