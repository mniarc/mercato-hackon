import type { z } from 'zod'
import type { workflowStepSchema, workflowTransitionSchema } from '@open-mercato/core/modules/workflows/data/validators'

export const RESEARCH_EXCEPTION_STEP_ID = 'research_exception'
export const RESEARCH_EXCEPTION_KEEP_BLOCKED_TRANSITION = 'research_exception_keep_blocked'

/** Mount inside the originating workflow; never a second case lifecycle. */
export function createResearchExceptionFragment(options: { waitingStepId?: string; neutralWording?: boolean } = {}): {
  steps: Array<z.input<typeof workflowStepSchema>>
  transitions: Array<z.input<typeof workflowTransitionSchema>>
} {
  return {
    steps: [{
      stepId: RESEARCH_EXCEPTION_STEP_ID,
      stepName: 'Research exception / Wyjątek analizy',
      stepType: 'USER_TASK',
      userTaskConfig: {
        assignedToRoles: ['employee'], priority: 'high',
        instructions: {
          en: 'Research is blocked. Leave this task open while investigating or asking the client for information.\nCase: {{context.agencyResearchException.result.caseId}}\nSource workflow: {{context.agencyResearchException.result.sourceWorkflowInstanceId}}\n{{context.agencyResearchException.result.evidenceText}}\nOnly recording that the work remains blocked is connected. The producer resolutions above are evidence, not available actions. This task cannot approve an artifact, increase a budget or restart analysis.',
          pl: 'Analiza jest zablokowana. Pozostaw zadanie otwarte podczas badania przeszkody lub zadawania pytań klientowi.\nSprawa: {{context.agencyResearchException.result.caseId}}\nProces źródłowy: {{context.agencyResearchException.result.sourceWorkflowInstanceId}}\n{{context.agencyResearchException.result.evidenceText}}\nPodłączono wyłącznie zapis pozostawienia blokady. Rozstrzygnięcia producenta powyżej są dowodami, nie dostępnymi akcjami. Zadanie nie zatwierdza dokumentu, nie zwiększa budżetu i nie ponawia analizy.',
        },
        entityBindings: [{ entityType: 'customers:customer_company_profile', idPath: '{{context.agencyResearchException.result.customerEntityId}}' }],
        formSchema: { fields: [{ name: 'researchExceptionHoldReason', type: 'textarea', label: 'Why the work remains blocked / Dlaczego praca pozostaje zablokowana', required: true }] },
        decisions: [{
          id: 'keep_blocked', label: { en: 'Record continued hold', pl: 'Zapisz pozostawienie blokady' },
          transitionId: RESEARCH_EXCEPTION_KEEP_BLOCKED_TRANSITION, style: 'secondary',
        }],
        ...(options.neutralWording ? { instructions: {
          en: 'Work is blocked. Leave this task open while investigating or asking the client for information.\nCase: {{context.agencyResearchException.result.caseId}}\nSource workflow: {{context.agencyResearchException.result.sourceWorkflowInstanceId}}\n{{context.agencyResearchException.result.evidenceText}}\nOnly recording that the work remains blocked is connected. Producer resolutions are evidence, not available actions. This task cannot approve content, increase a budget, restart production or publish.',
          pl: 'Praca jest zablokowana. Pozostaw zadanie otwarte podczas badania przeszkody lub zadawania pytań klientowi.\nSprawa: {{context.agencyResearchException.result.caseId}}\nProces źródłowy: {{context.agencyResearchException.result.sourceWorkflowInstanceId}}\n{{context.agencyResearchException.result.evidenceText}}\nPodłączono wyłącznie zapis pozostawienia blokady. Rozstrzygnięcia producenta są dowodami, nie dostępnymi akcjami. Zadanie nie zatwierdza treści, nie zwiększa budżetu, nie ponawia produkcji i nie publikuje.',
        } } : {}),
      },
      ...(options.neutralWording ? { stepName: 'Work exception / Wyjątek wykonania' } : {}),
    }],
    transitions: [{
      transitionId: RESEARCH_EXCEPTION_KEEP_BLOCKED_TRANSITION,
      fromStepId: RESEARCH_EXCEPTION_STEP_ID, toStepId: options.waitingStepId ?? 'waiting', trigger: 'manual',
    }],
  }
}
