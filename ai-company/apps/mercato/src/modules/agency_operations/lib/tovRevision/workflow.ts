import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { CLIENT_TRIAGE_RESULT_KEY } from '../clientSubmissionWorkflow'
import { STRATEGY_EXECUTION_RESULT_KEY, STRATEGY_EXECUTION_STEP_ID } from '../strategyExecution/contracts'
import { RESEARCH_EXCEPTION_RESULT_KEY, STRATEGY_RESEARCH_EXCEPTION_HANDOFF_FUNCTION } from '../researchException/contracts'
import { RESEARCH_EXCEPTION_STEP_ID } from '../researchException/workflow'
import { PREPARE_TOV_REVISION_FUNCTION, REASSESS_TOV_PAIR_FUNCTION, TOV_PAIR_REASSESSMENT_KEY, TOV_REVISION_EXCEPTION_FUNCTION, TOV_REVISION_FUNCTION, TOV_REVISION_PREPARED_KEY, TOV_REVISION_RESULT_KEY, TOV_REVISION_REVIEW_FUNCTION, TOV_REVISION_STEP } from './contracts'

/** One bounded specialist correction and fresh QA; no autonomous repeated repair/spend loop. */
export const tovRevisionFragment: Pick<WorkflowDefinitionData, 'steps' | 'transitions'> = {
  steps: [
    { stepId: 'tov_correction_requested', stepName: 'Saved ToV correction selected', stepType: 'AUTOMATED' },
    { stepId: 'tov_correction_prepared', stepName: 'Exact specialist correction bound', stepType: 'AUTOMATED' },
    { stepId: TOV_REVISION_STEP, stepName: 'Specialist ToV revision recorded', stepType: 'AUTOMATED' },
    { stepId: 'tov_pair_reassessment', stepName: 'Unchanged strategy and revised ToV reassessed', stepType: 'AUTOMATED' },
    { stepId: 'tov_revision_exception_checked', stepName: 'Revised pair exception checked', stepType: 'AUTOMATED' },
    { stepId: 'tov_revision_review', stepName: 'Fresh exact pair review handoff', stepType: 'AUTOMATED' },
    { stepId: 'tov_revision_invited', stepName: 'Revised pair invitation available', stepType: 'END' },
    { stepId: 'tov_revision_waiting', stepName: 'Specialist correction needs attention', stepType: 'WAIT_FOR_SIGNAL', signalConfig: { signalName: 'agency.tov-revision.follow-up' } },
  ],
  transitions: [
    { transitionId: 'client_tov_correction', fromStepId: 'routed', toStepId: 'tov_correction_requested', trigger: 'auto', priority: 100,
      condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.triage.disposition.targetStepId`, operator: '=', value: TOV_REVISION_STEP } },
    { transitionId: 'qa_tov_correction', fromStepId: STRATEGY_EXECUTION_STEP_ID, toStepId: 'tov_correction_requested', trigger: 'auto', priority: 50,
      condition: { field: `${STRATEGY_EXECUTION_RESULT_KEY}.result.qaVerdict`, operator: '=', value: 'needs_agent_fix' } },
    { transitionId: 'prepare_tov_correction', fromStepId: 'tov_correction_requested', toStepId: 'tov_correction_prepared', trigger: 'auto',
      activities: [{ activityId: 'prepare_tov_revision', activityName: TOV_REVISION_PREPARED_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: PREPARE_TOV_REVISION_FUNCTION, args: {} } }] },
    { transitionId: 'revise_specialist_tov', fromStepId: 'tov_correction_prepared', toStepId: TOV_REVISION_STEP, trigger: 'auto',
      condition: { field: `${TOV_REVISION_PREPARED_KEY}.result.status`, operator: '=', value: 'ready' },
      activities: [{ activityId: 'revise_tov', activityName: TOV_REVISION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', async: true,
        retryPolicy: { maxAttempts: 1, initialIntervalMs: 0, backoffCoefficient: 1, maxIntervalMs: 0 }, config: { functionName: TOV_REVISION_FUNCTION, args: {} } }] },
    { transitionId: 'unsupported_tov_correction', fromStepId: 'tov_correction_prepared', toStepId: 'strategy_exception_checked', trigger: 'auto',
      condition: { field: `${TOV_REVISION_PREPARED_KEY}.result.status`, operator: '=', value: 'not_applicable' },
      activities: [{ activityId: 'tov_original_exception', activityName: RESEARCH_EXCEPTION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: STRATEGY_RESEARCH_EXCEPTION_HANDOFF_FUNCTION, args: {} } }] },
    { transitionId: 'reassess_revised_tov_pair', fromStepId: TOV_REVISION_STEP, toStepId: 'tov_pair_reassessment', trigger: 'auto', priority: 100,
      condition: { field: `${TOV_REVISION_RESULT_KEY}.result.revision.status`, operator: '=', value: 'completed' },
      activities: [{ activityId: 'reassess_tov_pair', activityName: TOV_PAIR_REASSESSMENT_KEY, activityType: 'EXECUTE_FUNCTION', async: true,
        retryPolicy: { maxAttempts: 1, initialIntervalMs: 0, backoffCoefficient: 1, maxIntervalMs: 0 }, config: { functionName: REASSESS_TOV_PAIR_FUNCTION, args: {} } }] },
    { transitionId: 'hold_specialist_tov_revision', fromStepId: TOV_REVISION_STEP, toStepId: 'tov_revision_waiting', trigger: 'auto', priority: 1 },
    { transitionId: 'check_revised_tov_pair_exception', fromStepId: 'tov_pair_reassessment', toStepId: 'tov_revision_exception_checked', trigger: 'auto',
      activities: [{ activityId: 'tov_revision_exception', activityName: RESEARCH_EXCEPTION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: TOV_REVISION_EXCEPTION_FUNCTION, args: {} } }] },
    { transitionId: 'assign_revised_tov_pair_exception', fromStepId: 'tov_revision_exception_checked', toStepId: RESEARCH_EXCEPTION_STEP_ID, trigger: 'auto',
      condition: { field: `${RESEARCH_EXCEPTION_RESULT_KEY}.result.kind`, operator: '=', value: 'employee_exception' } },
    { transitionId: 'invite_revised_tov_pair', fromStepId: 'tov_revision_exception_checked', toStepId: 'tov_revision_review', trigger: 'auto',
      condition: { field: `${RESEARCH_EXCEPTION_RESULT_KEY}.result.kind`, operator: '=', value: 'none' },
      activities: [{ activityId: 'invite_revised_tov_pair', activityName: 'agencyTovRevisionInvitation', activityType: 'EXECUTE_FUNCTION', config: { functionName: TOV_REVISION_REVIEW_FUNCTION, args: {} } }] },
    { transitionId: 'revised_tov_pair_invited', fromStepId: 'tov_revision_review', toStepId: 'tov_revision_invited', trigger: 'auto',
      condition: { field: 'agencyTovRevisionInvitation.result.status', operator: '=', value: 'invited' } },
    { transitionId: 'hold_revised_tov_pair', fromStepId: 'tov_revision_review', toStepId: 'tov_revision_waiting', trigger: 'auto',
      condition: { field: 'agencyTovRevisionInvitation.result.status', operator: '=', value: 'blocked' } },
  ],
}
