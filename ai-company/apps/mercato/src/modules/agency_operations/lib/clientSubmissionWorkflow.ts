import { defineWorkflow } from '@open-mercato/shared/modules/workflows'
import { z } from 'zod'
import { clientSubmissionDispositionSchema } from './contracts/clientSubmission'

export const CLIENT_SUBMISSION_WORKFLOW_ID = 'agency_operations.client-submission.scaffold.v1'
export const CLIENT_TRIAGE_FUNCTION_NAME = 'agency_operations.triageClientSubmissionScaffold'
export const CLIENT_TRIAGE_RESULT_KEY = 'clientTriageResult'
export const CLIENT_REPLY_SIGNAL = 'agency.client-reply'

const triageInputSchema = z.object({
  tenantId: z.uuid(), organizationId: z.uuid(), caseId: z.uuid(), submissionId: z.uuid(),
  scaffoldScenario: z.enum(['answer', 'clarify']),
})

/** A deliberately fixed intelligence substitute, never called by the live provider path. */
export function deterministicClientTriage(rawInput: unknown, rawContext: unknown) {
  const input = triageInputSchema.parse(rawInput)
  const context = z.object({ workflowInstance: z.object({ tenantId: z.uuid(), organizationId: z.uuid() }) }).parse(rawContext)
  if (context.workflowInstance.tenantId !== input.tenantId || context.workflowInstance.organizationId !== input.organizationId) {
    throw new Error('[internal] Submission triage is outside the workflow scope')
  }
  return clientSubmissionDispositionSchema.parse({
    kind: input.scaffoldScenario, source: 'deterministic_scaffold',
    workerId: 'agency_operations.client-triage.scaffold.v1',
    rationale: `Explicit ${input.scaffoldScenario} fixture; original content was not classified by a model.`,
    message: input.scaffoldScenario === 'answer'
      ? '[Scaffold] Submission received. No business action has been applied.'
      : '[Scaffold] Please clarify the desired outcome for this case.',
    targets: { caseId: input.caseId, submissionId: input.submissionId },
    effectsApplied: false,
  })
}

export function createClientSubmissionWorkflow() {
  const workflow = defineWorkflow({
    workflowId: CLIENT_SUBMISSION_WORKFLOW_ID,
    workflowName: 'Client submission (deterministic scaffold)',
    description: 'Persist one labelled decision; answer or wait for a client reply. No paid model or domain effects.',
    steps: [
      { stepId: 'start', stepName: 'Submission received', stepType: 'START' },
      { stepId: 'route', stepName: 'Read saved disposition', stepType: 'AUTOMATED' },
      { stepId: 'client_reply', stepName: 'Waiting for client clarification', stepType: 'WAIT_FOR_SIGNAL', signalConfig: { signalName: CLIENT_REPLY_SIGNAL } },
      { stepId: 'answered', stepName: 'Scaffold answer available', stepType: 'END' },
      { stepId: 'reply_received', stepName: 'Client reply received', stepType: 'END' },
    ] as const,
    transitions: [
      {
        transitionId: 'triage', fromStepId: 'start', toStepId: 'route', trigger: 'auto', priority: 100,
        activities: [{
          activityId: 'client_triage', activityName: CLIENT_TRIAGE_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', async: false,
          config: { functionName: CLIENT_TRIAGE_FUNCTION_NAME, args: {
            tenantId: '{{context.tenantId}}', organizationId: '{{context.organizationId}}', caseId: '{{context.caseId}}',
            submissionId: '{{context.submissionId}}', scaffoldScenario: '{{context.scaffoldScenario}}',
          } },
        }],
      },
      {
        transitionId: 'answer', fromStepId: 'route', toStepId: 'answered', trigger: 'auto', priority: 100,
      },
      {
        transitionId: 'clarify', fromStepId: 'route', toStepId: 'client_reply', trigger: 'auto', priority: 100,
      },
      { transitionId: 'reply_received', fromStepId: 'client_reply', toStepId: 'reply_received', trigger: 'auto', priority: 100 },
    ],
  })
  // The code builder predates native inline conditions and drops unknown fields.
  // Add the native business_rules expression to the definition sent to authoring.
  workflow.definition.transitions = workflow.definition.transitions.map((transition) =>
    transition.transitionId === 'answer' || transition.transitionId === 'clarify'
      ? { ...transition, condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.kind`, operator: '=', value: transition.transitionId } }
      : transition,
  )
  return workflow
}
