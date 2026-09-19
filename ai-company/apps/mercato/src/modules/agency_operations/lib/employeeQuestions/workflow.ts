import type { WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import { EMPLOYEE_QUESTION_ANSWER_KEY, EMPLOYEE_QUESTION_RESPONSE_FUNCTION } from './contracts'

export const employeeQuestionWorkflowDefinition: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Employee question recorded', stepType: 'START' },
    { stepId: 'client_answer', stepName: 'Question from your agency', stepType: 'USER_TASK', userTaskConfig: {
      assignedTo: '{{context.question.customerUserId}}', assigneeKind: 'customer',
      entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: '{{context.question.customerEntityId}}' }],
      instructions: { en: '{{context.question.question}}', pl: '{{context.question.question}}' },
      formSchema: { fields: [{ name: EMPLOYEE_QUESTION_ANSWER_KEY, type: 'textarea', required: true, label: 'Your answer / Twoja odpowiedź' }] },
    } },
    { stepId: 'received', stepName: 'Customer answer received by shared intake', stepType: 'END' },
  ],
  transitions: [
    { transitionId: 'ask', fromStepId: 'start', toStepId: 'client_answer', trigger: 'auto' },
    { transitionId: 'receive', fromStepId: 'client_answer', toStepId: 'received', trigger: 'auto', activities: [{
      activityId: 'receive_answer', activityName: 'employeeQuestionReceipt', activityType: 'EXECUTE_FUNCTION',
      config: { functionName: EMPLOYEE_QUESTION_RESPONSE_FUNCTION, args: {} },
    }] },
  ],
}
