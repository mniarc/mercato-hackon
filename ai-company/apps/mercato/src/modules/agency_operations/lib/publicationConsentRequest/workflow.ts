import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { PUBLICATION_CONSENT_FORM_KEY, PUBLICATION_CONSENT_FUNCTION } from './contracts'

export const publicationConsentWorkflowDefinition: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Separate publication consent', stepType: 'START' },
    { stepId: 'client_consent', stepName: 'Consent to the exact publication destination', stepType: 'USER_TASK', userTaskConfig: {
      assignedTo: '{{context.publicationConsentInvitation.customerUserId}}', assigneeKind: 'customer',
      entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: '{{context.publicationConsentInvitation.customerEntityId}}' }],
      formKey: PUBLICATION_CONSENT_FORM_KEY,
      formSchema: { type: 'object', properties: { publicationConsentResponse: { type: 'object' } }, required: ['publicationConsentResponse'] },
      instructions: { en: 'Decide only about publication of this approved version at the specified destination. Content approval is unchanged; sending remains disabled.',
        pl: 'Zdecyduj wyłącznie o publikacji tej zaakceptowanej wersji we wskazanym miejscu. Akceptacja treści pozostaje bez zmian; wysyłka pozostaje wyłączona.' },
    } },
    { stepId: 'consent_recorded', stepName: 'Separate consent recorded; sending disabled', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'invite', fromStepId: 'start', toStepId: 'client_consent', trigger: 'auto' },
    { transitionId: 'record_consent', fromStepId: 'client_consent', toStepId: 'consent_recorded', trigger: 'auto', activities: [{
      activityId: 'record_consent', activityName: 'publicationConsentReceipt', activityType: 'EXECUTE_FUNCTION',
      config: { functionName: PUBLICATION_CONSENT_FUNCTION, args: { response: '{{context.publicationConsentResponse}}' } },
    }] },
  ],
}
