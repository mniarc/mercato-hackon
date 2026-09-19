import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { PLAN_REVIEW_CONTEXT_KEY as invitation, PLAN_RESPONSE_CONTEXT_KEY as response, PLAN_RESPONSE_FUNCTION, PLAN_REVIEW_FORM_KEY } from './contracts'

export const planReviewWorkflowDefinition: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Plan review invitation', stepType: 'START' },
    { stepId: 'client_review', stepName: 'Review plan and select one topic', stepType: 'USER_TASK', userTaskConfig: {
      assignedTo: `{{context.${invitation}.customerUserId}}`, assigneeKind: 'customer',
      entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: `{{context.${invitation}.customerEntityId}}` }],
      formKey: PLAN_REVIEW_FORM_KEY,
      formSchema: { type: 'object', properties: { [response]: { type: 'object' } }, required: [response] },
      instructions: { en: 'Review the exact plan version and explicitly select one topic. The recommendation is not your selection. Receipt is not acceptance.', pl: 'Sprawdź wskazaną wersję planu i jawnie wybierz jeden temat. Rekomendacja nie zastępuje Twojego wyboru. Odbiór odpowiedzi nie oznacza akceptacji.' },
    } },
    { stepId: 'response_received', stepName: 'Original response received by shared intake', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'invite', fromStepId: 'start', toStepId: 'client_review', trigger: 'auto' },
    { transitionId: 'receive_response', fromStepId: 'client_review', toStepId: 'response_received', trigger: 'auto', activities: [{
      activityId: 'receive_response', activityName: 'planReceipt', activityType: 'EXECUTE_FUNCTION',
      config: { functionName: PLAN_RESPONSE_FUNCTION, args: { response: `{{context.${response}}}` } },
    }] },
  ],
}
