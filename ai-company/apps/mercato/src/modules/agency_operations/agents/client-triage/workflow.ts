import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { CLIENT_REPLY_SIGNAL, CLIENT_TRIAGE_RESULT_KEY } from '../../lib/clientSubmissionWorkflow'
import { CLIENT_TRIAGE_AGENT_ID } from './contract'
import { createClientTriageExceptionFragment } from '../../lib/clientTriageException/workflow'

export const NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID = 'agency_operations.client-submission.native.v1'
export const PREPARE_CLIENT_TRIAGE_FUNCTION = 'agency_operations.prepareClientTriage'
export const PROJECT_CLIENT_TRIAGE_FUNCTION = 'agency_operations.projectClientTriage'
export const CLIENT_TRIAGE_INPUT_KEY = 'nativeClientTriageInput'
export const CLIENT_TRIAGE_INTERPRETATION_KEY = 'nativeClientTriageInterpretation'
const exception = createClientTriageExceptionFragment()

export const nativeClientSubmissionDefinition: WorkflowDefinitionData = {
  steps: [
    ...exception.steps,
    { stepId: 'start', stepName: 'Submission received', stepType: 'START' },
    { stepId: 'prepare', stepName: 'Load original submission', stepType: 'AUTOMATED' },
    {
      stepId: 'triage', stepName: 'Interpret client submission', stepType: 'AUTOMATED',
      signalConfig: { signalName: 'agent_orchestrator.proposal.ready' },
      activities: [{
        activityId: 'native_triage', activityName: 'native_triage', activityType: 'INVOKE_AGENT',
        config: {
          agentId: CLIENT_TRIAGE_AGENT_ID,
          input: { original: `{{context.${CLIENT_TRIAGE_INPUT_KEY}.result.original}}` },
          onResult: { alwaysAsk: true },
          outputMapping: { [CLIENT_TRIAGE_INTERPRETATION_KEY]: 'data' },
        },
      }],
    },
    { stepId: 'route', stepName: 'Apply permitted triage route', stepType: 'AUTOMATED' },
    { stepId: 'routed', stepName: 'Saved disposition', stepType: 'AUTOMATED' },
    { stepId: 'client_reply', stepName: 'Waiting for client clarification', stepType: 'WAIT_FOR_SIGNAL', signalConfig: { signalName: CLIENT_REPLY_SIGNAL } },
    { stepId: 'answered', stepName: 'Answer available', stepType: 'END' },
    { stepId: 'unapplied', stepName: 'Interpretation saved; business route not implemented', stepType: 'END' },
    { stepId: 'reply_received', stepName: 'Client reply received', stepType: 'END' },
  ],
  transitions: [
    ...exception.transitions,
    { transitionId: 'prepare', fromStepId: 'start', toStepId: 'prepare', trigger: 'auto' },
    {
      transitionId: 'invoke', fromStepId: 'prepare', toStepId: 'triage', trigger: 'auto',
      activities: [{ activityId: 'prepare_triage', activityName: CLIENT_TRIAGE_INPUT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: PREPARE_CLIENT_TRIAGE_FUNCTION, args: {} } }],
    },
    { transitionId: 'triage_research', fromStepId: 'triage', toStepId: 'route', kind: 'outcome', outcomeKind: 'researcher', trigger: 'auto' },
    {
      transitionId: 'save_disposition', fromStepId: 'route', toStepId: 'routed', trigger: 'auto',
      activities: [{ activityId: 'project_triage', activityName: CLIENT_TRIAGE_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: PROJECT_CLIENT_TRIAGE_FUNCTION, args: {} } }],
    },
    { transitionId: 'answer', fromStepId: 'routed', toStepId: 'answered', trigger: 'auto', priority: 100, condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.kind`, operator: '=', value: 'answer' } },
    { transitionId: 'clarify', fromStepId: 'routed', toStepId: 'client_reply', trigger: 'auto', priority: 100, condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.kind`, operator: '=', value: 'clarify' } },
    { transitionId: 'unapplied', fromStepId: 'routed', toStepId: 'unapplied', trigger: 'auto', priority: 10, condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.kind`, operator: '=', value: 'unapplied' } },
    { transitionId: 'reply_received', fromStepId: 'client_reply', toStepId: 'reply_received', trigger: 'auto' },
  ],
}
