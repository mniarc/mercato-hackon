import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { BRIEF_RESPONSE_CONTEXT_KEY, BRIEF_RESPONSE_FUNCTION, BRIEF_REVIEW_CONTEXT_KEY, BRIEF_REVIEW_FORM_KEY, BRIEF_REVIEW_STEP_ID } from './contracts'

export const briefReviewWorkflowDefinition: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Brief invitation', stepType: 'START' },
    {
      stepId: BRIEF_REVIEW_STEP_ID, stepName: 'Review the brief', stepType: 'USER_TASK',
      userTaskConfig: {
        assignedTo: `{{context.${BRIEF_REVIEW_CONTEXT_KEY}.customerUserId}}`, assigneeKind: 'customer',
        entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: `{{context.${BRIEF_REVIEW_CONTEXT_KEY}.customerEntityId}}` }],
        formKey: BRIEF_REVIEW_FORM_KEY,
        formSchema: { type: 'object', properties: { [BRIEF_RESPONSE_CONTEXT_KEY]: { type: 'object' } }, required: [BRIEF_RESPONSE_CONTEXT_KEY] },
        instructions: { en: 'Review the exact brief version. Your response goes through agency intake; submitting it does not approve the brief.', pl: 'Sprawdź wskazaną wersję briefu. Odpowiedź trafia do obsługi zgłoszeń agencji; jej przesłanie nie zatwierdza briefu.' },
      },
    },
    { stepId: 'response_received', stepName: 'Response received by shared intake', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'invite', fromStepId: 'start', toStepId: BRIEF_REVIEW_STEP_ID, trigger: 'auto' },
    {
      transitionId: 'receive_response', fromStepId: BRIEF_REVIEW_STEP_ID, toStepId: 'response_received', trigger: 'auto',
      activities: [{ activityId: 'receive_response', activityName: 'briefReviewReceipt', activityType: 'EXECUTE_FUNCTION',
        config: { functionName: BRIEF_RESPONSE_FUNCTION, args: { response: `{{context.${BRIEF_RESPONSE_CONTEXT_KEY}}}` } } }],
    },
  ],
}
