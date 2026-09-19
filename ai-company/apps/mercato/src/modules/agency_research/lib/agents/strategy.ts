import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { renderContractFields } from '../../data/contracts'
import { strategyChoiceSectionResult, strategyPillarsSectionResult, strategyProofSectionResult, strategyQaAgentResult } from '../../data/agents/strategy'
import { RESEARCH_STRATEGY_CHOICE_AGENT_ID, RESEARCH_STRATEGY_PILLARS_AGENT_ID, RESEARCH_STRATEGY_PROOF_AGENT_ID, RESEARCH_STRATEGY_QA_AGENT_ID } from './ids.strategy'
import { DESLOP_PROSE_RULES } from './deslop'
import { MODEL_QA, MODEL_SYNTHESIS, SHARED_RULES } from './shared'
import { promptFor } from './prompts'

// P5 — strategy writer (5.2), ToV writer (5.3) and the Q-S pair QA (5.4). The
// strategy writer is three agents, one per section group (`input.section`), each
// with its own result schema (a union of sections is too large a grammar for
// provider structured output); the ToV writer keeps one agent for its two sections; the pipeline mints claim and pillar ids, caps support
// levels by the cited proofs, sets example statuses and assembles the documents.
// The agents recommend; the client approves.

const STRATEGY_RULES = [
  'You write the communication strategy (KLI-STRATEGIA) from the brief (`brief` — the',
  'client\'s decisions and proposals), the audit (`audit`), the competitor comparison',
  '(`competitors`) and the frozen evidence (`evidence`: facts, proof cards, content seeds).',
  'Make justified choices: for whom, in which situation, with which promise and why to',
  'believe it. A summary of the service list is not a strategy; a choice must give something',
  'up. Follow the brief\'s decisions where `decision_state` is `client_selected`; where the',
  'brief still awaits the client, build on its proposal and say so in `status` / `open_assumptions`.',
  'Every claim about the company or the world cites `fact_ids` / `proof_ids` / `evidence_ids`',
  'from the input; a declaration is `declared_method`, a shown artifact `documented_capability`,',
  'only a measured or externally confirmed case `demonstrated_result` — never higher than the',
  'cited proof. Do not derive uniqueness from a competitor\'s silence; compare against a',
  'concrete alternative, never "everyone else". No ROI, percentages, timelines or guarantees',
  'without a fact. Hooks, single-post arguments, CTA wording and schedules belong to the plan',
  'and the post, not here. Do no new research: everything comes from the input. Sections',
  'already written in this run are in `draft` — stay consistent with them. On a revision',
  '`previous_strategy` is given: keep what the findings do not touch. When `repair_findings`',
  'is non-empty, fix exactly those findings and keep everything else.',
  DESLOP_PROSE_RULES,
].join(' ')

export const strategyAgents: AiAgentDefinition[] = [
  defineAgent({
    id: RESEARCH_STRATEGY_CHOICE_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Strategy writer — choice, tension, UVP',
    description: 'Writes the strategic choice, the buyer tension, the UVP and the rejected options of the communication strategy (KLI-STRATEGIA); choices with evidence, never promises beyond the proofs.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: promptFor(RESEARCH_STRATEGY_CHOICE_AGENT_ID, [
      STRATEGY_RULES,
      'Return `strategic_choice` (one positioning, the priority audience and situation, the',
      'reference category, the brief `decision` it rests on, what is deliberately',
      '`deprioritized`, `rationale`, `status` `fact` | `hypothesis` | `client_decision` |',
      '`unknown`, `evidence_ids`), `buyer_tension` (desired progress, barrier, an',
      '`illustrative_objection` with `objection_status` `customer_voice` only when a customer',
      'said it, else `illustrative_hypothesis`; the status quo risk; `decision_criterion` with',
      'its own status and origin; `evidence_ids`), `uvp` (`local_ref` = `UVP`; one',
      '`working_sentence`; 3–5 sentences of `explanation`; the `mechanism`; the concrete',
      '`alternative` it is compared with and `alternative_status`; `reason_to_believe`;',
      '`evidence_ids`; `support_level`; `use_conditions`) and `options_considered` (exactly',
      'two rejected directions, ≤ 120 words together).',
      SHARED_RULES,
      renderContractFields('WZR-STRATEGIA', ['strategic_choice', 'buyer_tension', 'uvp', 'options_considered']),
    ]),
    result: { kind: 'research', schema: strategyChoiceSectionResult },
  }),

  defineAgent({
    id: RESEARCH_STRATEGY_PROOF_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Strategy writer — proof architecture and messages',
    description: 'Writes the proof architecture (one row per claim, capped by the cited proofs) and the message hierarchy of the communication strategy (KLI-STRATEGIA).',
    defaultModel: MODEL_SYNTHESIS,
    instructions: promptFor(RESEARCH_STRATEGY_PROOF_AGENT_ID, [
      STRATEGY_RULES,
      'The `draft` holds the sections already written (the UVP among them). Return',
      '`proof_architecture` (one row per claim the strategy will make; the first row has',
      '`local_ref` `UVP`, further rows `CL-A`, `CL-B`…; each with the allowed claim, its',
      'mechanism, `proof_ids` / `fact_ids` / `source_ids`, `status`, `limitations`, the',
      '`forbidden_claim` and the `confirmation_owner` `client` | `agency` | `none_needed`) and',
      '`message_hierarchy` (one lasting `main_promise` with `status` and `claim_refs`; 2–3',
      '`supporting_messages` with `claim_refs` and `fact_ids`; `explanation_order`).',
      SHARED_RULES,
      renderContractFields('WZR-STRATEGIA', ['proof_architecture', 'message_hierarchy']),
    ]),
    result: { kind: 'research', schema: strategyProofSectionResult },
  }),

  defineAgent({
    id: RESEARCH_STRATEGY_PILLARS_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Strategy writer — pillars, channel, boundaries',
    description: 'Writes the content pillars, the channel role, the measurement hypothesis and the creative boundaries of the communication strategy (KLI-STRATEGIA).',
    defaultModel: MODEL_SYNTHESIS,
    instructions: promptFor(RESEARCH_STRATEGY_PILLARS_AGENT_ID, [
      STRATEGY_RULES,
      'The `draft` holds the sections already written (choice, UVP, claims). Return `pillars`',
      '(3–4 pillars with `local_ref` `PL-A`…, each differing in task, with `audience_question`,',
      '`allowed_content`, `exclusions`, `claim_refs` and the `seed_ids` from',
      '`evidence.content_bank` it can be developed from), `channel_role` (one role of the one',
      'serviced channel; no multichannel or paid campaigns; `contact_owner` null unless known;',
      '`evidence_ids`), `measurement_hypothesis` (a hypothesis to test, observable signals,',
      'measures with definitions, `baseline` null unless a fact exists, `numerical_target` null',
      'unless a baseline exists, the future test and the causality limit) and',
      '`creative_boundaries` (what is not promoted, the prohibited promises, permitted',
      'creativity, rights, `open_assumptions` as short texts, the effect on the plan, whether a',
      'research return is required).',
      SHARED_RULES,
      renderContractFields('WZR-STRATEGIA', ['pillars', 'channel_role', 'measurement_hypothesis', 'creative_boundaries']),
    ]),
    result: { kind: 'research', schema: strategyPillarsSectionResult },
  }),

  defineAgent({
    id: RESEARCH_STRATEGY_QA_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Strategy and ToV QA',
    description: 'Checks the strategy + ToV pair (Q-S) for fit with the goal, scope and evidence, mutual consistency, uncovered promises and tactical detail posing as strategy; routes each fix to its author.',
    defaultModel: MODEL_QA,
    instructions: promptFor(RESEARCH_STRATEGY_QA_AGENT_ID, [
      'You are the quality agent for step 5.4 (gate Q-S). You receive the assembled `strategy`',
      '(KLI-STRATEGIA data), the `tov` (KLI-TOV data), the compact `brief`, the `proof_cards`',
      'and the deterministic `validator_findings` already computed. Check against `criteria`:',
      'the strategy makes a choice and names what it gives up; the UVP explains value and',
      'mechanism against a concrete alternative and claims no exclusivity without a',
      'demonstrated proof; every claim status stays within its proofs; three to four pillars',
      'differ in task and have material; nothing contradicts the brief or the promise',
      'constraints; hooks, post arguments, CTA wording and schedules are tactical detail that',
      'does not belong here; the ToV rules are executable, add no facts, and are consistent',
      'with the strategy and the brief preferences. Return `findings` (≤ 20) with `code`, exact',
      '`path` starting with `KLI-STRATEGIA.` or `KLI-TOV.` (or `KLI-BRIEF.` for a contradiction',
      'with the brief), `severity` (`blocking` stops the client handover), `gap`, `owner`',
      '`agent`, and `fix_step` `5.2` for the strategy writer or `5.3` for the ToV writer. The',
      '`verdict` is exactly one of `ready_for_approval` (no blocking findings) or',
      '`needs_agent_fix`. Do not ask the client for anything here; do not rewrite the',
      'documents. Length: the only limits are the contract\'s client-view budgets, which',
      '`validator_findings` already measure — do not invent per-section word counts and never',
      'make length blocking. A field the strategy honestly marks `unknown` (buyer criteria,',
      'interviews, benchmarks) is correct, not missing: the client owns that gap. A customer',
      'identity withheld pending permission complies with the brief\'s permission rule; it is',
      'not a contradiction. Summarise in `summary`.',
      SHARED_RULES,
      renderContractFields('WZR-STRATEGIA', ['strategic_choice', 'uvp', 'proof_architecture', 'message_hierarchy', 'pillars', 'creative_boundaries']),
      renderContractFields('WZR-TOV', ['voice_principles', 'wording', 'evidence_language', 'before_after', 'copy_checks']),
    ]),
    result: { kind: 'research', schema: strategyQaAgentResult },
  }),
]
