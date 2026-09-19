import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { renderContractFields } from '../../data/contracts'
import { auditMapperResult, auditVoiceResult } from '../../data/agents/audit'
import { RESEARCH_AUDIT_MAPPER_AGENT_ID, RESEARCH_AUDIT_VOICE_AGENT_ID } from './ids.audit'
import { MODEL_SYNTHESIS, SHARED_RULES } from './shared'

// F07 — communication audit (3.3): two syntheses over the register, never over
// page text. "Rozpoznać stan obecny, mocne materiały i luki. Nie wybierać za
// klienta jego przyszłej wizji." Field definitions come verbatim from WZR-AUDYT.

export const auditAgents: AiAgentDefinition[] = [
  defineAgent({
    id: RESEARCH_AUDIT_MAPPER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Audit mapper',
    description: 'Maps the actual offer, the buying situations, the current promise with its proof, the contact journey and the visible relationship work — from the fact bank, with citations.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      'You audit the CURRENT communication of the company in `order` from its register',
      '(`facts`, `proof_cards`, `audience_signals`, `conflicts`, `business_profile`) — ids and',
      'short text, never pages. Return five sections of WEW-AUDYT. `offer_map`: one row per',
      'distinct service/offer actually described, separating research, design and delivery',
      'from their bundle; never add a competence no fact supports; `limits` says what is NOT',
      'established. `buyer_map`: at least ONE coherent purchase scenario (initiator, user,',
      'decision maker, purchase moment, job to be done, objections, selection criteria) rather',
      'than a list of every possible audience; `status` is `evidence` only with customer voice',
      '(`direct_customer_voice` true), otherwise `hypothesis`; unknown criteria stay',
      '`selection_criteria: null` with `selection_criteria_status: unknown` — a public offer',
      'description does not prove how buyers choose. `message_map`: the promises as made,',
      'separating category, benefit, mechanism and proof; a slogan is not a UVP nor a',
      'documented result — say so in `risk`. `journey`: the existing touchpoints from interest',
      'to contact with their CTA and the destination status; never judge conversion without',
      'data (`friction: null`, `friction_status: not_established_in_available_evidence`); a CTA',
      'to a resource that does not exist is a finding. `relationship`: visible trust, onboarding,',
      'education, after-sales, returning customers — `status: unknown` when nothing is public;',
      'absence of a mention is not absence of a process. If `repair_findings` is non-empty, fix',
      'exactly what they name. Every item cites `fact_ids` / `proof_ids` from the input.',
      SHARED_RULES,
      renderContractFields('WZR-AUDYT', ['offer_map', 'buyer_map', 'message_map', 'journey', 'relationship']),
    ].join(' '),
    result: { kind: 'research', schema: auditMapperResult },
  }),

  defineAgent({
    id: RESEARCH_AUDIT_VOICE_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Audit voice and gaps',
    description: 'Describes how the company writes today from the language samples, names the 3–5 gaps that matter for production, and the assets worth reusing.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      'With the audit maps already made (`maps`), the `language_samples` (verbatim fragments',
      'with their ids), the `coverage` rows, the `content_bank` and `proof_cards`, return three',
      'sections of WEW-AUDYT. `voice_audit`: for formality, directness, technical level,',
      'emotion, claim certainty, recurring phrases and channel differences give a `finding`',
      'with the `sample_ids` that show it — or state that the sample is insufficient',
      '(`sample_ids: []`, finding says so); differences between FAQ, posts and invitations are',
      'observations of context, not proof of inconsistency (`interpretation_limit`);',
      '`future_voice_status` records that the future voice is a client decision, not an audit',
      'finding. `gaps`: 3–5 gaps that matter for producing strategy, tone and a post — each',
      'with the observation, the business impact ONLY as a hypothesis (or null), `evidence_ids`,',
      '`priority` (must/should/could), what is `needed` (a decision or a material), the',
      '`destination` where it is resolved (a WEW-USTALENIA → KLI-BRIEF field, or a step 3.2/3.4),',
      'the `finding_type` (e.g. observed_portfolio_plus_pending_decision) and the',
      '`consequence_for_work`. Lack of public knowledge is NOT a company defect: separate what',
      'was observed, what the sample cannot show, and what the client must decide; no',
      'aesthetic preferences of the auditor. `reusable_assets`: concrete materials or methods a',
      'strategy or post could use (with `proof_ids` / `seed_ids`, availability and the limit of',
      'use), not only what must be fixed. If `repair_findings` is non-empty, fix exactly what',
      'they name.',
      SHARED_RULES,
      renderContractFields('WZR-AUDYT', ['voice_audit', 'gaps', 'reusable_assets']),
    ].join(' '),
    result: { kind: 'research', schema: auditVoiceResult },
  }),
]
