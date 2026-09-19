import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { analysisExecutionPolicySchema, type AnalysisExecutionPolicy } from './contracts'

export const AGENCY_ANALYSIS_WORKFLOW_ID = 'agency_operations.analysis.v1'
export const AGENCY_ANALYSIS_WORKER_ID = 'agency_operations.agent-worker.analysis.v1'
export const AGENCY_ANALYSIS_FUNCTION_NAME = 'agency_operations.runAnalysis'
export const AGENCY_ANALYSIS_RESULT_KEY = 'agencyAnalysisResult'

export function createAgencyAnalysisWorkflowDefinition(rawPolicy: AnalysisExecutionPolicy): WorkflowDefinitionData {
  const policy = analysisExecutionPolicySchema.parse(rawPolicy)
  return {
  steps: [
    { stepId: 'start', stepName: 'Approved analysis received', stepType: 'START' },
    { stepId: 'research', stepName: 'Run agency research', stepType: 'AUTOMATED' },
    { stepId: 'result', stepName: 'Research outcome saved', stepType: 'AUTOMATED' },
    { stepId: 'completed', stepName: 'Requested research handoff available', stepType: 'END' },
    // No automatic retry or invented approval: the teammate's saved gaps/QA or
    // escalation references remain visible, without reporting successful delivery.
    { stepId: 'waiting', stepName: 'Research requires follow-up', stepType: 'WAIT_FOR_SIGNAL', signalConfig: { signalName: 'agency.analysis.follow-up' } },
  ],
  transitions: [
    { transitionId: 'start_research', fromStepId: 'start', toStepId: 'research', trigger: 'auto' },
    {
      transitionId: 'save_research', fromStepId: 'research', toStepId: 'result', trigger: 'auto',
      activities: [{
        activityId: 'research', activityName: AGENCY_ANALYSIS_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', async: true,
        retryPolicy: { maxAttempts: 1, initialIntervalMs: 0, backoffCoefficient: 1, maxIntervalMs: 0 },
        config: { functionName: AGENCY_ANALYSIS_FUNCTION_NAME, args: { caseId: '{{context.caseId}}', policy } },
      }],
    },
    { transitionId: 'completed', fromStepId: 'result', toStepId: 'completed', trigger: 'auto', condition: { field: `${AGENCY_ANALYSIS_RESULT_KEY}.result.state`, operator: '=', value: 'completed' } },
    { transitionId: 'waiting', fromStepId: 'result', toStepId: 'waiting', trigger: 'auto', condition: { field: `${AGENCY_ANALYSIS_RESULT_KEY}.result.state`, operator: '=', value: 'waiting' } },
  ],
  }
}
