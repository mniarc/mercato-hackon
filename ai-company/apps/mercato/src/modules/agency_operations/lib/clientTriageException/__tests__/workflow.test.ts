/** @jest-environment node */
import { workflowStepSchema, workflowTransitionSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { resolveAgentOutcomeHandling, excludeOutcomeTransitions } from '@open-mercato/core/modules/workflows/lib/outcome-routing'
import { findTaskDecisionTransition } from '@open-mercato/core/modules/workflows/lib/task-decisions'
import { readRequiredFormFields } from '@open-mercato/core/modules/workflows/lib/task-form-schema'
import {
  CLIENT_TRIAGE_EXCEPTION_DECISION_ID,
  CLIENT_TRIAGE_EXCEPTION_RETURN_TRANSITION_ID,
  CLIENT_TRIAGE_EXCEPTION_STEP_ID,
  createClientTriageExceptionFragment,
} from '../workflow'

describe('native client triage exception fragment', () => {
  test('uses native error-outcome routing into the same workflow task', () => {
    const fragment = createClientTriageExceptionFragment()
    fragment.steps.forEach((step) => workflowStepSchema.parse(step))
    fragment.transitions.forEach((transition) => workflowTransitionSchema.parse(transition))

    expect(resolveAgentOutcomeHandling(fragment, 'triage', 'error')).toMatchObject({
      kind: 'route',
      transition: { fromStepId: 'triage', toStepId: CLIENT_TRIAGE_EXCEPTION_STEP_ID },
    })
    expect(excludeOutcomeTransitions(fragment.transitions)).toEqual([
      expect.objectContaining({ transitionId: CLIENT_TRIAGE_EXCEPTION_RETURN_TRANSITION_ID }),
    ])
  })

  test('requires employee resolution evidence without presenting completion as client approval', () => {
    const task = createClientTriageExceptionFragment().steps[0]
    expect(task.stepType).toBe('USER_TASK')
    expect(task.userTaskConfig?.assignedToRoles).toEqual(['employee'])
    expect(readRequiredFormFields(task.userTaskConfig?.formSchema)).toEqual([
      'triageRecoveryReason', 'triageRecoveryEvidence',
    ])
    expect(task.userTaskConfig?.decisions).toEqual([
      expect.objectContaining({
        id: CLIENT_TRIAGE_EXCEPTION_DECISION_ID,
        transitionId: CLIENT_TRIAGE_EXCEPTION_RETURN_TRANSITION_ID,
      }),
    ])
  })

  test('offers only a fixed manual return through trusted preparation, never a case restart', () => {
    const fragment = createClientTriageExceptionFragment()
    expect(fragment.transitions.filter((transition) => transition.fromStepId === CLIENT_TRIAGE_EXCEPTION_STEP_ID)).toEqual([
      expect.objectContaining({
        transitionId: CLIENT_TRIAGE_EXCEPTION_RETURN_TRANSITION_ID,
        toStepId: 'prepare',
        trigger: 'manual',
      }),
    ])
    expect(findTaskDecisionTransition(fragment.transitions, CLIENT_TRIAGE_EXCEPTION_RETURN_TRANSITION_ID, CLIENT_TRIAGE_EXCEPTION_STEP_ID))
      .toMatchObject({ toStepId: 'prepare' })
    expect(findTaskDecisionTransition(fragment.transitions, 'restart_case', CLIENT_TRIAGE_EXCEPTION_STEP_ID)).toBeNull()
  })
})
