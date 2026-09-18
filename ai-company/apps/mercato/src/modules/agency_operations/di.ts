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
    [`workflowFunction:${AGENCY_TOV_FUNCTION_NAME}`]: asFunction(
      () => createTovWorkflowActivity(container),
    ).scoped(),
  })
}
