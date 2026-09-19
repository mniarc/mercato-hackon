import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { POST_REVIEW_CONTEXT_KEY as invitation, POST_RESPONSE_CONTEXT_KEY as response, POST_RESPONSE_FUNCTION, POST_REVIEW_FORM_KEY } from './contracts'

export const postReviewWorkflowDefinition: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Post content review invitation', stepType: 'START' },
    { stepId: 'client_review', stepName: 'Review exact post content', stepType: 'USER_TASK', userTaskConfig: {
      assignedTo: `{{context.${invitation}.customerUserId}}`, assigneeKind: 'customer',
      entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: `{{context.${invitation}.customerEntityId}}` }],
      formKey: POST_REVIEW_FORM_KEY,
      formSchema: { type: 'object', properties: { [response]: { type: 'object' } }, required: [response] },
      instructions: { en: 'Review this exact post version. Content approval does not give permission to publish. Send conditions, changes, questions or holds as a message.', pl: 'Sprawdź tę konkretną wersję postu. Akceptacja treści nie oznacza zgody na publikację. Warunki, zmiany, pytania lub wstrzymanie przekaż w wiadomości.' },
    } },
    { stepId: 'response_received', stepName: 'Original response received by shared intake', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'invite', fromStepId: 'start', toStepId: 'client_review', trigger: 'auto' },
    { transitionId: 'receive_response', fromStepId: 'client_review', toStepId: 'response_received', trigger: 'auto', activities: [{
      activityId: 'receive_response', activityName: 'postReceipt', activityType: 'EXECUTE_FUNCTION',
      config: { functionName: POST_RESPONSE_FUNCTION, args: { response: `{{context.${response}}}` } },
    }] },
  ],
}
