import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { liveAuditorResult, syntheticOnboardingResult, syntheticReviewResult } from '../../data/agents/review'
import { RESEARCH_LIVE_AUDITOR_AGENT_ID, RESEARCH_SYNTHETIC_ONBOARDING_AGENT_ID, RESEARCH_SYNTHETIC_REVIEW_AGENT_ID } from './ids.review'
import { MODEL_QA, MODEL_SYNTHESIS, SHARED_RULES } from './shared'
import { promptFor } from './prompts'

// Prompt v2 roles 37–39. The auditor judges one agent output after the fact and
// returns routing (repair / prompt patch / contract defect / client decision);
// the two synthetic clients let a rehearsal run without a real client, with
// every answer marked synthetic and every approval flag pinned to false. None of
// them is wired into the chain yet — they run from the Playground and T112.

export const reviewAgents: AiAgentDefinition[] = [
  defineAgent({
    id: RESEARCH_LIVE_AUDITOR_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Live run auditor',
    description: 'Audits one agent output against its input, prompt and contract; classifies each defect (execution, prompt, contract/code, missing client decision) and returns a repair prompt or an escalation — never a client decision.',
    defaultModel: MODEL_QA,
    instructions: promptFor(RESEARCH_LIVE_AUDITOR_AGENT_ID, [
      'You audit ONE agent output (`output_snapshot`) against its `input_snapshot`, `agent_prompt` and',
      '`output_contract`. Verify every material claim against the evidence the input actually holds;',
      'classify each defect as execution_error, prompt_defect, contract_or_code_defect or',
      'missing_client_decision; at most two repairs per output; `pass` only when every required',
      'check ran and no critical/major finding is open. `client_approval_granted` and',
      '`publication_authorized` are always false.',
      SHARED_RULES,
    ]),
    result: { kind: 'research', schema: liveAuditorResult },
  }),
  defineAgent({
    id: RESEARCH_SYNTHETIC_ONBOARDING_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Synthetic client — onboarding',
    description: 'Fills the onboarding form for a company from verified public sources as an explicitly synthetic respondent; every answer carries its origin and confidence, approvals stay false.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: promptFor(RESEARCH_SYNTHETIC_ONBOARDING_AGENT_ID, [
      'Research-simulation mode: answer `onboarding_definition` for the company in `company_context`',
      'from `facts` and `source_register` only. Keep `provided_client_answers` verbatim with their',
      'origin; mark everything else synthetic with confidence and reason; never invent revenue, head',
      'count, budget or rights; `simulation_flag` true, `respondent_type` synthetic_client, approvals false.',
      SHARED_RULES,
    ]),
    result: { kind: 'research', schema: syntheticOnboardingResult },
  }),
  defineAgent({
    id: RESEARCH_SYNTHETIC_REVIEW_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Synthetic client — document review',
    description: 'Reviews the client-facing document versions as an independent, explicitly synthetic client: verdict, six 1–5 scores with anchored reasons, required changes and questions for the real client; never an endorsement.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: promptFor(RESEARCH_SYNTHETIC_REVIEW_AGENT_ID, [
      'Read only the client-facing `documents` (never internal verdicts) as a potential client of the',
      'company in `company_context`; return the verdict, six 1–5 scores each anchored in a fragment,',
      'at most five required changes, what to keep, at most three closed questions for the real client',
      'and the limits of this simulation. `real_client_endorsement` is always false.',
      SHARED_RULES,
    ]),
    result: { kind: 'research', schema: syntheticReviewResult },
  }),
]
