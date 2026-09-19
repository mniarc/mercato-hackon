import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { CLIENT_TRIAGE_AGENT_ID } from '../../agents/client-triage/contract'
import { PREPARE_SALES_QUESTION, PREPARE_SALES_ANSWER, RECORD_SALES_ANSWER, SALES_ANSWER_SIGNAL } from './contracts'

export const salesQuestionWorkflow: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Original offer question saved', stepType: 'START' },
    { stepId: 'waiting_answer', stepName: 'Waiting for configured sales answer', stepType: 'WAIT_FOR_SIGNAL', signalConfig: { signalName: SALES_ANSWER_SIGNAL } },
    { stepId: 'answered', stepName: 'Catalogue answer available', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'wait', fromStepId: 'start', toStepId: 'waiting_answer', trigger: 'auto' },
    { transitionId: 'answer_received', fromStepId: 'waiting_answer', toStepId: 'answered', trigger: 'auto' },
  ],
}

export function createSalesAnswerWorkflow(catalog: { versionId: string; productId: string; content: string }): WorkflowDefinitionData { return {
  steps: [
    { stepId: 'start', stepName: 'Saved offer question', stepType: 'START' },
    { stepId: 'triage', stepName: 'G classifies the original question', stepType: 'AUTOMATED', activities: [{
      activityId: 'sales_triage', activityType: 'INVOKE_AGENT', activityName: 'sales_triage',
      config: { agentId: CLIENT_TRIAGE_AGENT_ID, input: { original: '{{context.salesQuestionInput.result.original}}' },
        onResult: { alwaysAsk: true }, outputMapping: { salesQuestionInterpretation: 'data' } },
    }] },
    { stepId: 'sales', stepName: 'Explain the pinned catalogue', stepType: 'AUTOMATED', activities: [{
      activityId: 'sales_answer', activityType: 'INVOKE_AGENT', activityName: 'sales_answer',
      config: { agentId: 'agency_operations.sales_advisor', input: '{{context.salesAnswerInput.result}}',
        onResult: { alwaysAsk: true }, outputMapping: { salesAnswerProposal: 'data' } },
    }] },
    { stepId: 'answered', stepName: 'Grounded answer saved; no purchase started', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'prepare_question', fromStepId: 'start', toStepId: 'triage', trigger: 'auto', activities: [{
      activityId: 'sales_question_input', activityName: 'salesQuestionInput', activityType: 'EXECUTE_FUNCTION', config: { functionName: PREPARE_SALES_QUESTION, args: { catalog } },
    }] },
    { transitionId: 'classified', fromStepId: 'triage', toStepId: 'sales', trigger: 'auto', kind: 'outcome', outcomeKind: 'researcher', activities: [{
      activityId: 'sales_answer_input', activityName: 'salesAnswerInput', activityType: 'EXECUTE_FUNCTION', config: { functionName: PREPARE_SALES_ANSWER },
    }] },
    { transitionId: 'save_answer', fromStepId: 'sales', toStepId: 'answered', trigger: 'auto', kind: 'outcome', outcomeKind: 'researcher', activities: [{
      activityId: 'sales_answer_receipt', activityName: 'salesAnswerReceipt', activityType: 'EXECUTE_FUNCTION', config: { functionName: RECORD_SALES_ANSWER },
    }] },
  ],
} }
