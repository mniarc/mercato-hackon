import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { STRATEGY_PAIR_REVIEW_CONTEXT_KEY as invitation, STRATEGY_PAIR_RESPONSE_CONTEXT_KEY as response, STRATEGY_PAIR_RESPONSE_FUNCTION, STRATEGY_PAIR_REVIEW_FORM_KEY } from './contracts'

export const strategyPairReviewWorkflowDefinition: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Strategy and tone-of-voice invitation', stepType: 'START' },
    { stepId: 'client_review', stepName: 'Review strategy and tone of voice', stepType: 'USER_TASK', userTaskConfig: {
      assignedTo: `{{context.${invitation}.customerUserId}}`, assigneeKind: 'customer',
      entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: `{{context.${invitation}.customerEntityId}}` }],
      formKey: STRATEGY_PAIR_REVIEW_FORM_KEY,
      formSchema: { type: 'object', properties: { [response]: { type: 'object' } }, required: [response] },
      instructions: { en: 'Respond to the exact strategy and tone-of-voice versions. Receipt is not acceptance and does not start planning.', pl: 'Odpowiedz na wskazane wersje strategii i tone of voice. Odbiór odpowiedzi nie oznacza akceptacji i nie uruchamia planowania.' },
    } },
    { stepId: 'response_received', stepName: 'Original response received by shared intake', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'invite', fromStepId: 'start', toStepId: 'client_review', trigger: 'auto' },
    { transitionId: 'receive_response', fromStepId: 'client_review', toStepId: 'response_received', trigger: 'auto', activities: [{
      activityId: 'receive_response', activityName: 'strategyPairReceipt', activityType: 'EXECUTE_FUNCTION',
      config: { functionName: STRATEGY_PAIR_RESPONSE_FUNCTION, args: { response: `{{context.${response}}}` } },
    }] },
  ],
}
