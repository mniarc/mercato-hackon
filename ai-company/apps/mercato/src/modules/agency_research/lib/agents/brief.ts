import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { renderContractFields } from '../../data/contracts'
import { briefChannelSectionResult, briefOfferSectionResult, briefPromiseVoiceSectionResult, briefQaAgentResult } from '../../data/agents/brief'
import { RESEARCH_BRIEF_CHANNEL_AGENT_ID, RESEARCH_BRIEF_OFFER_AGENT_ID, RESEARCH_BRIEF_PROMISE_VOICE_AGENT_ID, RESEARCH_BRIEF_QA_AGENT_ID } from './ids.brief'
import { DESLOP_PROSE_RULES } from './deslop'
import { MODEL_QA, MODEL_SYNTHESIS, SHARED_RULES } from './shared'

// F09 — brief writer (4.1) and brief QA (4.2). The writer is three agents, one per
// section group (`input.section`), each with its own result schema so every
// registered output stays section-sized (a union of sections is too large a grammar);
// the pipeline assembles KLI-BRIEF, sets decision states, permissions and open
// assumptions in code. The agent never decides for the client.

const BRIEF_RULES = [
  'You write the client brief (KLI-BRIEF) from the findings map (`field_map`, `questions`) and',
  'the compact evidence (`facts`, `proof_cards`, `language_samples`, `offer_map`, `buyer_map`,',
  '`journey`). Fill what research knows; where only the client can decide — goals, future',
  'direction, audiences, priorities, constraints, the channel — write the best-supported',
  'PROPOSAL in the client\'s own language and let the questions ask for the decision. Never',
  'record a proposal as a decision; never derive the client\'s future vision, goal or priority',
  'from the current website alone. Use the value already proposed in `field_map` when its',
  'readiness is `ready` or `conditional`; when it is `blocked`, say what is missing instead of',
  'inventing. Cite `fact_ids` / `evidence_ids` / `sample_ids` / `allowed_proof_ids` only from',
  'the input. Do not ask the client for company data or the purchased scope. When',
  '`repair_findings` is non-empty, fix exactly those findings and keep everything else.',
  DESLOP_PROSE_RULES,
].join(' ')

export const briefAgents: AiAgentDefinition[] = [
  defineAgent({
    id: RESEARCH_BRIEF_OFFER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Brief writer — offer, audience, direction',
    description: 'Writes the priority offer, priority audience and business direction of the client brief (KLI-BRIEF) from the findings map and the cited evidence; proposals, never client decisions.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      BRIEF_RULES,
      'Return `priority_offer` (one prioritised offer/problem, the result for the audience, what',
      'is excluded), `priority_audience` (one main group with `segment` + `target_role`;',
      '`buyer_claims` with a separate `knowledge_status` per component — `selection_criteria` is',
      '`unknown` unless a buyer said it; the decision-maker is not assumed to be the target role)',
      'and `business_direction` (`from_to`, `horizon`, `baseline` or null, the role of',
      'communication, what is NOT promised).',
      SHARED_RULES,
      renderContractFields('WZR-BRIEF', ['priority_offer', 'priority_audience', 'business_direction']),
    ].join(' '),
    result: { kind: 'research', schema: briefOfferSectionResult },
  }),

  defineAgent({
    id: RESEARCH_BRIEF_PROMISE_VOICE_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Brief writer — promise constraints and voice',
    description: 'Writes the promise constraints and the voice preferences of the client brief (KLI-BRIEF): what the evidence lets us say and two equal voice variants.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      BRIEF_RULES,
      'Return `promise_constraints` (capabilities = what the evidence lets us say, `result_limits`,',
      '≥ 3 `prohibited_claims` such as percentages, guaranteed timelines, uniqueness, partner',
      'results as own; `allowed_proof_ids` only from `proof_cards`) and `voice_preferences`',
      '(desired/unwanted traits from the voice audit and samples; `proposed_examples` = EXACTLY',
      'TWO equally valid ways of saying the same fact, variant ids `VOICE-A` / `VOICE-B`, each',
      'with `fact_ids` — never a good one against a bad one; `sample_ids` cited).',
      SHARED_RULES,
      renderContractFields('WZR-BRIEF', ['promise_constraints', 'voice_preferences']),
    ].join(' '),
    result: { kind: 'research', schema: briefPromiseVoiceSectionResult },
  }),

  defineAgent({
    id: RESEARCH_BRIEF_CHANNEL_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Brief writer — channel, success, assets',
    description: 'Writes the channel and CTA, success and limits, reusable assets and the buyer reality of the client brief (KLI-BRIEF).',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      BRIEF_RULES,
      'Return `channel_and_cta` (the serviced channel, the audience there, the CTA goal, `cta_text`',
      'null unless a real one exists, the observed `destination` with its visibility and',
      'functionality status — a visible address is not a working contact — `owner` null unless',
      'known, `limits`), `success_and_limits` (directional goal, 1–3 `measurement_proposals` with',
      'definitions, `baseline` null when unknown, `numerical_target` null unless a baseline fact',
      'exists, `scope_limit`), `assets_and_permissions` (materials worth reusing, each as',
      '`source_ref` = a source, proof or seed id, with `supported_claim_ids`), `buyer_reality`',
      '(1–3 situations with `status` `direct_example` | `general_declaration` | `hypothesis` and',
      'the facts behind them).',
      SHARED_RULES,
      renderContractFields('WZR-BRIEF', ['channel_and_cta', 'success_and_limits', 'assets_and_permissions', 'buyer_reality']),
    ].join(' '),
    result: { kind: 'research', schema: briefChannelSectionResult },
  }),

  defineAgent({
    id: RESEARCH_BRIEF_QA_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Brief completeness QA',
    description: 'Checks the brief for required fields, contradictions with the findings map and package consistency; distinguishes a missing client answer from an agent error.',
    defaultModel: MODEL_QA,
    instructions: [
      'You are the quality agent for step 4.2. You receive the assembled `brief` (KLI-BRIEF data),',
      'the findings map rows (`field_map`), the downstream `readiness` and the deterministic',
      '`validator_findings` already computed. Check against `criteria`: every filled MUST field',
      'has sources; nothing contradicts the findings map (a `blocked` row cannot be presented as',
      'settled); no future vision, goal or priority is recorded as a fact from the website; the',
      'promise constraints forbid what the proof cards cannot support; the two voice examples are',
      'equally valid; the CTA does not point to an unverified or non-existent destination as if it',
      'worked; questions ask only for what research could not know. Return `findings` (≤ 20) with',
      '`code`, exact `path`, `severity` (`blocking` stops approval), `gap`, and the `owner`: `agent`',
      'when the writer must fix an editorial or drafting error (then `fix_step` = `4.1`), `client`',
      'when only the client can answer (a concrete question, not a fault), `research` when a',
      'source must be read. The `verdict` is exactly one of `ready_for_approval` (no blocking',
      'findings and no MUST field awaiting the client), `needs_client_data` (the brief is sound but',
      'a MUST decision or evidence is missing on the client side), `needs_agent_fix` (an agent',
      'error the writer must repair). A brief with an unresolved gap required for execution is',
      'never `ready_for_approval`. Summarise in `summary`.',
      SHARED_RULES,
      renderContractFields('WZR-BRIEF'),
    ].join(' '),
    result: { kind: 'research', schema: briefQaAgentResult },
  }),
]
