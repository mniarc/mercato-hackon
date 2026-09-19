import type { z } from 'zod'
import type {
  UserTaskConfig,
  workflowStepSchema,
  workflowTransitionSchema,
} from '@open-mercato/core/modules/workflows/data/validators'

export const CLIENT_TRIAGE_EXCEPTION_STEP_ID = 'triage_exception'
export const CLIENT_TRIAGE_EXCEPTION_RETURN_TRANSITION_ID = 'triage_exception_return'
export const CLIENT_TRIAGE_EXCEPTION_DECISION_ID = 'obstacle_resolved'

/**
 * Fragment for client-submission.native.v1, not an independent attention workflow.
 * The owner also wires the triage research outcome to its normal projection step.
 * Returning reloads the stored submission through prepare before entering triage
 * again; it neither resets limits nor replaces execution-readiness checks with
 * an employee's assertion.
 */
export function createClientTriageExceptionFragment(): {
  steps: Array<z.input<typeof workflowStepSchema>>
  transitions: Array<z.input<typeof workflowTransitionSchema>>
} {
  const userTaskConfig: UserTaskConfig = {
    assignedToRoles: ['employee'],
    priority: 'high',
    instructions: {
      en: [
        'Client triage could not finish. Leave this task open while the obstacle remains.',
        'Case: {{context.caseId}}; submission: {{context.submissionId}}.',
        'Originating step: {{context.__error.stepId}}; time: {{context.__error.occurredAt}}.',
        'Failure: {{context.__error.message}}',
        'Record how the obstacle was resolved and the supporting evidence before returning to triage.',
        'Return retries only the original triage step. It does not approve an artifact or expand the client order.',
      ].join('\n\n'),
      pl: [
        'Klasyfikacja zgłoszenia nie została ukończona. Pozostaw zadanie otwarte, dopóki przeszkoda istnieje.',
        'Sprawa: {{context.caseId}}; zgłoszenie: {{context.submissionId}}.',
        'Krok źródłowy: {{context.__error.stepId}}; czas: {{context.__error.occurredAt}}.',
        'Błąd: {{context.__error.message}}',
        'Przed powrotem zapisz sposób usunięcia przeszkody i potwierdzające go dowody.',
        'Powrót ponawia tylko klasyfikację zgłoszenia. Nie zatwierdza dokumentu ani nie rozszerza zamówienia klienta.',
      ].join('\n\n'),
    },
    entityBindings: [{
      entityType: 'customers:customer_company_profile',
      idPath: '{{context.customerEntityId}}',
    }],
    formSchema: {
      fields: [
        { name: 'triageRecoveryReason', type: 'textarea', label: 'Resolution rationale / Uzasadnienie', required: true },
        { name: 'triageRecoveryEvidence', type: 'textarea', label: 'Resolution evidence / Dowody rozwiązania', required: true },
      ],
    },
    decisions: [{
      id: CLIENT_TRIAGE_EXCEPTION_DECISION_ID,
      label: { en: 'Obstacle resolved — return to triage', pl: 'Przeszkoda usunięta — wróć do klasyfikacji' },
      transitionId: CLIENT_TRIAGE_EXCEPTION_RETURN_TRANSITION_ID,
      style: 'primary',
    }],
  }

  return {
    steps: [{
      stepId: CLIENT_TRIAGE_EXCEPTION_STEP_ID,
      stepName: 'Client triage exception',
      stepType: 'USER_TASK',
      userTaskConfig,
    }],
    transitions: [
      {
        transitionId: 'triage_worker_failed',
        fromStepId: 'triage',
        toStepId: CLIENT_TRIAGE_EXCEPTION_STEP_ID,
        trigger: 'auto',
        kind: 'outcome',
        outcomeKind: 'error',
        priority: 100,
      },
      {
        transitionId: CLIENT_TRIAGE_EXCEPTION_RETURN_TRANSITION_ID,
        fromStepId: CLIENT_TRIAGE_EXCEPTION_STEP_ID,
        toStepId: 'prepare',
        trigger: 'manual',
        priority: 100,
      },
    ],
  }
}
