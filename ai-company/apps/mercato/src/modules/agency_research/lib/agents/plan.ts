import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { renderContractFields } from '../../data/contracts'
import { planBalanceResult, planQaAgentResult, planTopicsResult } from '../../data/agents/plan'
import { RESEARCH_PLAN_BALANCE_AGENT_ID, RESEARCH_PLAN_QA_AGENT_ID, RESEARCH_PLAN_TOPICS_AGENT_ID } from './ids.plan'
import { MODEL_QA, MODEL_SYNTHESIS, SHARED_RULES } from './shared'

// P6 — plan writer (6.2) and Q-P (6.3). The writer is two agents, one per output
// section, so each registered schema stays small enough for provider structured
// output: the topics agent is called twice (days 1–15, days 16–30), then the
// balance agent once over the gated twelve. Code mints `TOP01…` by day, checks distinctness, pillar
// balance and evidence resolution, records the selection (6.5) and compiles the
// post instruction (6.7) without any model call.

const PLAN_RULES = [
  'You write the 30-day content plan (KLI-PLAN) for ONE channel from the accepted strategy',
  '(`pillars`, `claims`, `creative_boundaries`, `channel_role`), the brief\'s CTA and audience,',
  'and the evidence bank (`seeds`, `facts`, `proof_cards`). Every topic must rest on a seed or',
  'facts that exist in the input: cite `seed_ids`, `fact_ids`, `proof_ids`, `claim_ids` and',
  '`source_ids` from the input only, and copy the supporting content itself into',
  '`evidence_excerpt` so the author never reopens a page. Each topic answers a DISTINCT',
  'audience question with a distinct value — paraphrases of one idea are duplicates. Spread',
  'topics across all pillars, no pillar above half the plan, and alternate the buyer\'s need',
  'stages (recognising the problem → checking an assumption → choosing scope → contact).',
  'The `angle` is a concrete tool for the reader (a question set, a mini-checklist, a lens);',
  'mark it `creative_proposal` — never the company\'s official method. `evidence_limits` says',
  'what must NOT be claimed for this topic; `cta` follows the brief\'s CTA goal and existing',
  'destination, never a new page, PDF, free audit or deadline. `readiness` is `ready` only',
  'when the cited evidence is enough to write the post without new research; otherwise',
  '`conditional` or `blocked` with the reason in `readiness_scope`. Numbers, effects and ROI',
  'appear only when a proof card of type measured_case / external_confirmation backs them.',
  'The plan schedules topics; the purchased product is ONE finished post. When',
  '`repair_findings` is non-empty, fix exactly those findings and keep everything else.',
].join(' ')

export const planAgents: AiAgentDefinition[] = [
  defineAgent({
    id: RESEARCH_PLAN_TOPICS_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Content plan writer — topics',
    description: 'Writes one day window of the 30-day content plan (KLI-PLAN): six distinct topics with their evidence.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      PLAN_RULES,
      'Return `topics`: exactly `topic_count` topics with `local_ref` (`T-A`, `T-B`, …), `day`',
      'inside the given `days` window (distinct days, spaced), `pillar_id` from `pillars`,',
      '`audience_question`, `topic`, `main_message` (one sentence), `format` = `text`, `angle`',
      '{tool, steps (2–5), status, example|null}, the id arrays, `evidence_excerpt`,',
      '`evidence_limits`, `post_goal`, `cta`, `cta_type` (contact | question | reflection | none),',
      '`readiness`, `readiness_scope`, `evidence_reuse_note` (null unless the evidence is shared',
      'with another topic). When `existing_topics` holds the earlier window, do not repeat their',
      'questions or messages.',
      SHARED_RULES,
      renderContractFields('WZR-PLAN', ['plan_context', 'topics']),
    ].join(' '),
    result: { kind: 'research', schema: planTopicsResult },
  }),

  defineAgent({
    id: RESEARCH_PLAN_BALANCE_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Content plan writer — balance and recommendation',
    description: 'Reads the twelve gated topics and returns the plan balance and the one recommended topic whose evidence is complete now.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      PLAN_RULES,
      'Return `balance` (`pillar_counts` as rows {pillar_id, count} over the twelve `existing_topics`,',
      '`need_stages`, `distinctness`, `evidence_diversity` — say plainly that twelve uses of the',
      'material are not twelve studies) and `recommendation` (one existing `topic_id` whose',
      'evidence is complete now, `reason`, `evidence_available` ids, `role`, `readiness`) — not',
      'the flashiest claim when data is missing, never two posts.',
      SHARED_RULES,
      renderContractFields('WZR-PLAN', ['balance', 'recommendation']),
    ].join(' '),
    result: { kind: 'research', schema: planBalanceResult },
  }),

  defineAgent({
    id: RESEARCH_PLAN_QA_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Content plan QA (Q-P)',
    description: 'Checks the content plan for pillar coverage, audience fit, distinctness, concreteness and whether the recommended topic can be written from the evidence at hand.',
    defaultModel: MODEL_QA,
    instructions: [
      'You are the quality agent for step 6.3 (gate Q-P). You receive the assembled `plan`',
      '(KLI-PLAN data), the strategy `pillars`, the evidence `seeds`, the `audience`, the catalog',
      '`topic_count` and the deterministic `validator_findings` already computed (count, days,',
      'id resolution, similarity, pillar arithmetic — do not repeat them). Check against',
      '`criteria`: every topic serves a pillar and the priority audience; the twelve questions',
      'are distinct in substance, not wording; each angle is concrete enough to write from;',
      'no topic promises a number, effect or uniqueness the evidence does not carry; the',
      'recommended topic has complete evidence in the bank so the post can be written without',
      'new research; the plan reads as a schedule of topics, not a delivery of twelve posts.',
      'Return `findings` (≤ 20) with `code`, exact `path` (`KLI-PLAN.topics[TOP03].angle`),',
      '`severity` (`blocking` stops approval), `gap`, `owner` `agent` with `fix_step` `6.2` for',
      'what the planner must rewrite, `research` when the bank lacks the evidence (then the',
      'topic stays conditional — a gap named, not a fault). The `verdict` is exactly one of',
      '`ready_for_approval` (no blocking agent findings) or `needs_agent_fix`. Summarise in',
      '`summary`, naming the checked plan version and the assumptions it rests on.',
      SHARED_RULES,
      renderContractFields('WZR-PLAN'),
    ].join(' '),
    result: { kind: 'research', schema: planQaAgentResult },
  }),
]
