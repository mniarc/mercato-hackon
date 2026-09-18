import { defineWorkflow } from '@open-mercato/shared/modules/workflows'
import type { UserTaskConfig } from '@open-mercato/core/modules/workflows/data/validators'

export const AGENCY_HUMAN_ATTENTION_WORKFLOW_ID = 'agency_operations.human-attention.v1'

export const humanAttentionTaskConfig: UserTaskConfig = {
  assignedToRoles: ['employee'],
  priority: 'high',
  instructions: {
    en: '{{context.reason}}\n\nEvidence: {{context.evidence}}',
    pl: '{{context.reason}}\n\nMateriały: {{context.evidence}}',
  },
  entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: '{{context.customerEntityId}}' }],
  decisions: [
    { id: 'complete', label: { en: 'Complete', pl: 'Zakończ' }, transitionId: 'human_complete', style: 'primary' },
    { id: 'return_to_agent', label: { en: 'Return to deterministic worker', pl: 'Przekaż do procesu deterministycznego' }, transitionId: 'human_return_to_agent', style: 'secondary' },
  ],
}

export function createAgencyHumanAttentionWorkflow(worker: { functionName: string; workerId: string }) {
  return defineWorkflow({
  workflowId: AGENCY_HUMAN_ATTENTION_WORKFLOW_ID,
  workflowName: 'Agency human attention',
  description: 'Explicit employee attention, followed by completion or deterministic worker handback.',
  metadata: { category: 'Agency operations', tags: ['agency', 'human-attention'] },
  steps: [
    { stepId: 'start', stepName: 'Attention requested', stepType: 'START' },
    { stepId: 'human_attention', stepName: '{{context.title}}', stepType: 'USER_TASK', userTaskConfig: humanAttentionTaskConfig },
    { stepId: 'agent_handoff', stepName: 'Deterministic worker handback', stepType: 'AUTOMATED' },
    { stepId: 'end', stepName: 'Attention resolved', stepType: 'END' },
  ] as const,
  transitions: [
    { transitionId: 'start_attention', fromStepId: 'start', toStepId: 'human_attention', trigger: 'auto', priority: 100 },
    { transitionId: 'human_complete', fromStepId: 'human_attention', toStepId: 'end', trigger: 'manual', priority: 100 },
    { transitionId: 'human_return_to_agent', fromStepId: 'human_attention', toStepId: 'agent_handoff', trigger: 'manual', priority: 50 },
    {
      transitionId: 'agent_handoff_end', fromStepId: 'agent_handoff', toStepId: 'end', trigger: 'auto', priority: 100,
      activities: [{
        activityId: 'human_handoff_worker', activityName: 'humanHandoffResult', activityType: 'EXECUTE_FUNCTION', async: false,
        config: {
          functionName: worker.functionName,
          args: {
            caseId: '{{context.caseId}}', tenantId: '{{context.tenantId}}', organizationId: '{{context.organizationId}}',
            customerEntityId: '{{context.customerEntityId}}', submittedByCustomerUserId: '{{context.submittedByCustomerUserId}}',
            title: '{{context.title}}', agentWorkerId: worker.workerId,
            materialFileName: '{{context.materialFileName}}', materialMimeType: '{{context.materialMimeType}}', materialFileSize: '{{context.materialFileSize}}',
          },
        },
      }],
    },
  ],
  })
}
