import {
  createWorkflowsModuleConfig,
  defineWorkflow,
} from '@open-mercato/shared/modules/workflows'

export const AGENCY_CASE_WORKFLOW_ID = 'agency_operations.process-case' as const
export const AGENCY_AGENT_WORKER_ID = 'agency_operations.agent-worker.noop.v1' as const
export const AGENCY_AGENT_FUNCTION_NAME = 'agency_operations.processCase' as const
export const AGENCY_AGENT_RESULT_CONTEXT_KEY = 'agentWorkerResult' as const

export const agencyCaseWorkflow = defineWorkflow({
  workflowId: AGENCY_CASE_WORKFLOW_ID,
  workflowName: 'Process agency case',
  description: 'Runs the stable agency worker for a client case.',
  metadata: {
    category: 'Agency operations',
    tags: ['agency', 'case', 'agent-worker'],
    icon: 'briefcase-business',
  },
  steps: [
    {
      stepId: 'start',
      stepName: 'Case received',
      stepType: 'START',
    },
    {
      stepId: 'agent_worker',
      stepName: 'Agent worker',
      stepType: 'AUTOMATED',
    },
    {
      stepId: 'end',
      stepName: 'Case processed',
      stepType: 'END',
    },
  ] as const,
  transitions: [
    {
      transitionId: 'start_agent_worker',
      transitionName: 'Start agent worker',
      fromStepId: 'start',
      toStepId: 'agent_worker',
      trigger: 'auto',
      priority: 100,
    },
    {
      transitionId: 'agent_worker_end',
      transitionName: 'Finish agent worker',
      fromStepId: 'agent_worker',
      toStepId: 'end',
      trigger: 'auto',
      priority: 100,
      activities: [
        {
          activityId: 'execute_agent_worker',
          activityName: AGENCY_AGENT_RESULT_CONTEXT_KEY,
          activityType: 'EXECUTE_FUNCTION',
          async: false,
          config: {
            functionName: AGENCY_AGENT_FUNCTION_NAME,
            args: {
              caseId: '{{context.caseId}}',
              tenantId: '{{context.tenantId}}',
              organizationId: '{{context.organizationId}}',
              customerEntityId: '{{context.customerEntityId}}',
              submittedByCustomerUserId: '{{context.submittedByCustomerUserId}}',
              title: '{{context.title}}',
              agentWorkerId: '{{context.agentWorkerId}}',
              materialFileName: '{{context.materialFileName}}',
              materialMimeType: '{{context.materialMimeType}}',
              materialFileSize: '{{context.materialFileSize}}',
            },
          },
        },
      ],
    },
  ],
})

export const workflowsConfig = createWorkflowsModuleConfig({
  moduleId: 'agency_operations',
  workflows: [agencyCaseWorkflow],
})

export default workflowsConfig
