import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { CLIENT_REPLY_SIGNAL, CLIENT_TRIAGE_RESULT_KEY } from '../../lib/clientSubmissionWorkflow'
import { CLIENT_TRIAGE_AGENT_ID } from './contract'
import { createClientTriageExceptionFragment } from '../../lib/clientTriageException/workflow'
import { STRATEGY_READINESS_HANDOFF_FUNCTION, STRATEGY_READINESS_RESULT_KEY } from '../../lib/strategyHandoff/contracts'
import { STRATEGY_EXECUTION_FUNCTION, STRATEGY_EXECUTION_RESULT_KEY, STRATEGY_EXECUTION_STEP_ID, STRATEGY_REVIEW_HANDOFF_FUNCTION } from '../../lib/strategyExecution/contracts'
import { STRATEGY_PAIR_CONTINUATION_FUNCTION, STRATEGY_PAIR_CONTINUATION_RESULT_KEY } from '../../lib/strategyPairApproval/contracts'
import { PLANNING_EXECUTION_FUNCTION, PLANNING_EXECUTION_RESULT_KEY, PLANNING_EXECUTION_STEP_ID, PLAN_REVIEW_HANDOFF_FUNCTION } from '../../lib/planningExecution/contracts'
import { POST_INSTRUCTION_FUNCTION, POST_INSTRUCTION_RESULT_KEY } from '../../lib/planApproval/contracts'
import { POST_EXECUTION_FUNCTION, POST_EXECUTION_RESULT_KEY, POST_EXECUTION_STEP_ID } from '../../lib/postExecution/contracts'

export const NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID = 'agency_operations.client-submission.native.v1'
export const PREPARE_CLIENT_TRIAGE_FUNCTION = 'agency_operations.prepareClientTriage'
export const PROJECT_CLIENT_TRIAGE_FUNCTION = 'agency_operations.projectClientTriage'
export const ACCEPT_BRIEF_FUNCTION = 'agency_operations.acceptBrief'
export const ACCEPT_STRATEGY_PAIR_FUNCTION = 'agency_operations.acceptStrategyPair'
export const ACCEPT_PLAN_FUNCTION = 'agency_operations.acceptPlan'
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
    { stepId: 'brief_accepted', stepName: 'Exact brief acceptance recorded', stepType: 'AUTOMATED' },
    { stepId: 'strategy_pair_decision', stepName: 'Selected strategy pair approvals recorded', stepType: 'AUTOMATED' },
    { stepId: 'strategy_pair_continuation', stepName: 'Pair review or planning readiness handoff recorded', stepType: 'AUTOMATED' },
    { stepId: 'strategy_pair_waiting', stepName: 'Pair review still needs action', stepType: 'END' },
    { stepId: PLANNING_EXECUTION_STEP_ID, stepName: 'Planning phase outcome recorded', stepType: 'AUTOMATED' },
    { stepId: 'plan_review', stepName: 'Plan review handoff recorded', stepType: 'END' },
    { stepId: 'plan_topic_decision', stepName: 'Plan acceptance and topic choice recorded', stepType: 'AUTOMATED' },
    { stepId: 'post_instruction', stepName: 'Post instruction readiness recorded', stepType: 'AUTOMATED' },
    { stepId: POST_EXECUTION_STEP_ID, stepName: 'Post author and editor outcome recorded', stepType: 'END' },
    { stepId: 'strategy_readiness', stepName: 'Strategy readiness recorded', stepType: 'AUTOMATED' },
    { stepId: STRATEGY_EXECUTION_STEP_ID, stepName: 'Strategy phase outcome recorded', stepType: 'AUTOMATED' },
    { stepId: 'strategy_review', stepName: 'Strategy pair review handoff recorded', stepType: 'END' },
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
    { transitionId: 'approve_brief', fromStepId: 'routed', toStepId: 'brief_accepted', trigger: 'auto', priority: 100,
      condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.triage.disposition.targetStepId`, operator: '=', value: 'brief_accepted' },
      activities: [{ activityId: 'accept_brief', activityName: CLIENT_TRIAGE_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: ACCEPT_BRIEF_FUNCTION, args: {} } }] },
    { transitionId: 'approve_strategy_pair', fromStepId: 'routed', toStepId: 'strategy_pair_decision', trigger: 'auto', priority: 100,
      condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.triage.disposition.targetStepId`, operator: '=', value: 'strategy_pair_decision' },
      activities: [{ activityId: 'accept_strategy_pair', activityName: CLIENT_TRIAGE_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: ACCEPT_STRATEGY_PAIR_FUNCTION, args: {} } }] },
    { transitionId: 'approve_plan', fromStepId: 'routed', toStepId: 'plan_topic_decision', trigger: 'auto', priority: 100,
      condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.triage.disposition.targetStepId`, operator: '=', value: 'plan_topic_decision' },
      activities: [{ activityId: 'accept_plan', activityName: CLIENT_TRIAGE_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: ACCEPT_PLAN_FUNCTION, args: {} } }] },
    { transitionId: 'handoff_strategy', fromStepId: 'brief_accepted', toStepId: 'strategy_readiness', trigger: 'auto',
      activities: [{ activityId: 'strategy_readiness', activityName: STRATEGY_READINESS_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: STRATEGY_READINESS_HANDOFF_FUNCTION, args: {} } }] },
    { transitionId: 'continue_strategy_pair', fromStepId: 'strategy_pair_decision', toStepId: 'strategy_pair_continuation', trigger: 'auto',
      activities: [{ activityId: 'continue_strategy_pair', activityName: STRATEGY_PAIR_CONTINUATION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION',
        config: { functionName: STRATEGY_PAIR_CONTINUATION_FUNCTION, args: {} } }] },
    { transitionId: 'wait_partial_pair', fromStepId: 'strategy_pair_continuation', toStepId: 'strategy_pair_waiting', trigger: 'auto',
      condition: { field: `${STRATEGY_PAIR_CONTINUATION_RESULT_KEY}.result.status`, operator: '=', value: 'partial' } },
    { transitionId: 'wait_unready_pair', fromStepId: 'strategy_pair_continuation', toStepId: 'strategy_pair_waiting', trigger: 'auto',
      condition: { field: `${STRATEGY_PAIR_CONTINUATION_RESULT_KEY}.result.status`, operator: '=', value: 'not_ready' } },
    { transitionId: 'execute_planning', fromStepId: 'strategy_pair_continuation', toStepId: PLANNING_EXECUTION_STEP_ID, trigger: 'auto',
      condition: { field: `${STRATEGY_PAIR_CONTINUATION_RESULT_KEY}.result.status`, operator: '=', value: 'accepted' },
      activities: [{ activityId: 'execute_planning', activityName: PLANNING_EXECUTION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', async: true,
        retryPolicy: { maxAttempts: 1, initialIntervalMs: 0, backoffCoefficient: 1, maxIntervalMs: 0 },
        config: { functionName: PLANNING_EXECUTION_FUNCTION, args: {} } }] },
    { transitionId: 'execute_strategy', fromStepId: 'strategy_readiness', toStepId: STRATEGY_EXECUTION_STEP_ID, trigger: 'auto',
      activities: [{ activityId: 'execute_strategy', activityName: STRATEGY_EXECUTION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', async: true,
        retryPolicy: { maxAttempts: 1, initialIntervalMs: 0, backoffCoefficient: 1, maxIntervalMs: 0 },
        config: { functionName: STRATEGY_EXECUTION_FUNCTION, args: {} } }] },
    { transitionId: 'invite_strategy_review', fromStepId: STRATEGY_EXECUTION_STEP_ID, toStepId: 'strategy_review', trigger: 'auto',
      activities: [{ activityId: 'invite_strategy_review', activityName: 'agencyStrategyPairInvitation', activityType: 'EXECUTE_FUNCTION',
        config: { functionName: STRATEGY_REVIEW_HANDOFF_FUNCTION, args: {} } }] },
    { transitionId: 'invite_plan_review', fromStepId: PLANNING_EXECUTION_STEP_ID, toStepId: 'plan_review', trigger: 'auto',
      activities: [{ activityId: 'invite_plan_review', activityName: 'agencyPlanInvitation', activityType: 'EXECUTE_FUNCTION',
        config: { functionName: PLAN_REVIEW_HANDOFF_FUNCTION, args: {} } }] },
    { transitionId: 'build_post_instruction', fromStepId: 'plan_topic_decision', toStepId: 'post_instruction', trigger: 'auto',
      activities: [{ activityId: 'build_post_instruction', activityName: POST_INSTRUCTION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION',
        config: { functionName: POST_INSTRUCTION_FUNCTION, args: {} } }] },
    { transitionId: 'execute_post', fromStepId: 'post_instruction', toStepId: POST_EXECUTION_STEP_ID, trigger: 'auto',
      activities: [{ activityId: 'execute_post', activityName: POST_EXECUTION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', async: true,
        retryPolicy: { maxAttempts: 1, initialIntervalMs: 0, backoffCoefficient: 1, maxIntervalMs: 0 },
        config: { functionName: POST_EXECUTION_FUNCTION, args: {} } }] },
    { transitionId: 'unapplied', fromStepId: 'routed', toStepId: 'unapplied', trigger: 'auto', priority: 10, condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.kind`, operator: '=', value: 'unapplied' } },
    { transitionId: 'reply_received', fromStepId: 'client_reply', toStepId: 'reply_received', trigger: 'auto' },
  ],
}
