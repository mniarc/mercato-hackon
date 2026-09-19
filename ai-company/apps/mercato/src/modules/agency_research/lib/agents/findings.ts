import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { contractFor, renderContractFields } from '../../data/contracts'
import { fieldMapperResult, questionWriterResult, readinessAssessorResult, researchQaResult } from '../../data/validators'
import { RESEARCH_FIELD_MAPPER_AGENT_ID, RESEARCH_QA_AGENT_ID, RESEARCH_QUESTION_WRITER_AGENT_ID, RESEARCH_READINESS_ASSESSOR_AGENT_ID } from './ids.findings'
import { MODEL_EXTRACT, MODEL_QA, MODEL_SYNTHESIS, SHARED_RULES } from './shared'

// F08 — findings map (3.6) and analysis QA (3.7). Three researchers turn the
// register, the audit and the comparison into the brief's readiness map — one
// section each — and the QA agent judges the four analysis documents against
// STD-PROCES criteria. Field definitions come verbatim from Rafał's contracts.

const qualityGatesOf = (templateIds: Parameters<typeof contractFor>[0][]) =>
  templateIds.map((id) => `${id}: ${contractFor(id).quality_gates.join(' ')}`).join(' ')

export const findingsAgents: AiAgentDefinition[] = [
  // 3.6a — field mapper: fills the ten seeded KLI-BRIEF rows from evidence, never from wishes.
  defineAgent({
    id: RESEARCH_FIELD_MAPPER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research field mapper',
    description: 'Maps the audit, comparison and register findings onto the ten KLI-BRIEF fields: proposed value, evidence, provenance, readiness, decision state — hypotheses stay hypotheses.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      'You receive the evidence bank of one client (register facts and proof cards with ids, the',
      'communication audit maps, the competitor comparison when it exists, coverage and conflicts)',
      'and `seeded_rows`: one row per KLI-BRIEF field with its template description. Return',
      '`field_map` with EXACTLY one row per seeded `field_key`, in the same order. For each row:',
      '`proposed_value` is the best pre-fill the evidence supports (null when nothing supports it —',
      'never a guess), `evidence_ids` cite the facts / proof cards / gaps / candidates behind it (ids',
      'from the input only), `provenance` is `observed` for something read on a page, `inferred` for',
      'your interpretation of pages, `creative_proposal` for a proposal of yours; NEVER',
      '`client_answer` or `synthetic` — no client has answered yet. `status` is `fact` only for a',
      'verifiable present-state observation; the client\'s future goal, priority offer, target',
      'audience, direction or voice preference can never be a `fact` read off a website — those',
      'are `hypothesis` or `unknown` with `decision_state: awaiting_client`. `readiness`: `ready`',
      'when the evidence is enough to write the field, `conditional` when a client decision or a',
      'named limit applies, `blocked` when nothing supports it. `reason` says why in one sentence.',
      'When `competition` is null say so in the reason of the fields that depend on it. If',
      '`repair_findings` is non-empty, fix exactly those paths first.',
      SHARED_RULES,
      renderContractFields('WZR-USTALENIA', ['field_map']),
    ].join(' '),
    result: { kind: 'research', schema: fieldMapperResult },
  }),

  // 3.6b — question writer: one decision per question, at most the batch limit, never data we already hold.
  defineAgent({
    id: RESEARCH_QUESTION_WRITER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research question writer',
    description: 'Turns the unknown brief fields into at most a batch of client questions (one decision each, hint, reason, consequence) and the smallest useful evidence requests.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      'From `field_map` (rows with `readiness` conditional/blocked or `decision_state` awaiting_client),',
      'the audit `audit_gaps`, `coverage` gaps and `conflicts`, write `questions` for the client:',
      'at most `question_batch_max`, `must` priority first (fields the strategy cannot start without),',
      'ONE decision per question, each with a `hint` pre-filled from research (what the evidence',
      'suggests, so the client confirms instead of writing), a one-sentence `reason`, the',
      '`brief_field` it fills, and `if_unanswered` (the concrete consequence). Never ask for anything',
      'in `already_known` (company data, website, social profile, purchased scope) and never ask the',
      'client to write the strategy, UVP or pillars for us. When a question is a choice of voice or',
      'framing, give 2 `options` that are equally valid on the same facts — never a good one next to',
      'an obviously bad one. `evidence_requests`: the smallest material that would unlock a specific',
      'claim (one anonymised case card, one real objection, one example of work), with the claim it',
      'supports, what we do without it, the `owner` (usually `klient`), a `priority` and the',
      '`evidence_ids` of the proof cards or gaps it relates to. Do not request a CRM export for one',
      'post. If `repair_findings` is non-empty, fix exactly those paths first. The `question`,',
      '`hint`, `options` and `reason` are read by the client, so they use the client\'s words only:',
      'no field keys (`priority_offer`, `buyer_map`), no evidence or scenario ids (F01, B02), no',
      'internal labels ("gap", "hypothesis", "conflict") — say what is unknown in plain language.',
      SHARED_RULES,
      renderContractFields('WZR-USTALENIA', ['questions', 'evidence_requests']),
    ].join(' '),
    result: { kind: 'research', schema: questionWriterResult },
  }),

  // 3.6c — readiness assessor: the five downstream results, judged separately.
  defineAgent({
    id: RESEARCH_READINESS_ASSESSOR_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research readiness assessor',
    description: 'Judges, result by result (UVP, strategy, ToV, plan, post), whether the mapped fields and open questions let the next stage start — with the gap and its owner.',
    defaultModel: MODEL_EXTRACT,
    instructions: [
      'For EACH result in `outputs` (UVP, strategia, ToV, plan, post) judge from `field_map`,',
      '`questions`, `evidence_requests`, `coverage` and `plan_capacity` whether it can start:',
      '`ready` when its `input_fields` are ready, `conditional` when a listed client decision is the',
      'only thing missing, `blocked` when evidence is missing. Judge each separately: a missing CRM',
      'does not block the ToV; a missing audience decision may block the strategy; the plan needs',
      '`plan_capacity` ready. Name `input_fields` (the brief fields and coverage needs it depends on),',
      '`missing` (precisely what, or null) and the `owner` who fills it. `research_return`: ONLY a',
      'concrete gap whose answer could change a decision, with the source to check, the expected',
      'result, the owner step (3.2 or 3.4), a limit and a stop condition — never a broad re-research.',
      'Return exactly one readiness row per output.',
      SHARED_RULES,
      renderContractFields('WZR-USTALENIA', ['readiness', 'research_return']),
    ].join(' '),
    result: { kind: 'research', schema: readinessAssessorResult },
  }),

  // 3.7 — quality control over the finished analysis.
  defineAgent({
    id: RESEARCH_QA_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research analysis QA',
    description: 'Checks the analysis documents for unsourced claims, fact/interpretation mixing, contradictions and missing fields; returns ready / to_fix / exception with owned findings.',
    defaultModel: MODEL_QA,
    instructions: [
      'You are the quality agent for step 3.7. You receive the analysis `documents` (their data,',
      'with ids) and the deterministic `validator_findings` already computed. Check against',
      '`criteria`: every important conclusion has a source and a limitation; facts, hypotheses and',
      'missing data are distinguishable; no effectiveness, ROI or uniqueness claim rests on public',
      'reactions or on absence at competitors; no future vision, goal or priority of the client is',
      'recorded as a fact taken from the current website; required fields are present; questions',
      'do not ask for data already in the register. Return `findings` (≤20): `code`, the exact',
      '`path`, `severity` (`blocking` stops the handover), the `gap`, the `owner` (`agent` when the',
      'author step must fix it, `client` when only the client can answer, `research` when a source',
      'must be read, `staff` for an unsolvable problem), `fix_step` (3.2–3.6) and a `fix_hint`. The',
      '`verdict` is exactly one of `ready` (no blocking finding), `to_fix` (blocking findings owned',
      'by an agent step), `exception` (a problem no agent step can solve). Internal QA never asks',
      'the client for a revision. A first-party claim the register records WITH its limitation',
      '(e.g. "80% done", "10x faster" marked unsupported) is CORRECT research, not an agent error:',
      'the owner of that gap is the `client` (methodology, permission or hedged wording) and it',
      'is already a question or evidence request — do not route it to 3.2/3.3 as a fix. Route to',
      'an author step only what the step can change: a missing limitation, a paraphrase presented',
      'as a quote, an interpretation recorded as a fact, an unresolved id, a promoted claim strength.',
      'Do not repeat `validator_findings` — they are already recorded;',
      'add what a deterministic check cannot see. Summarise in `summary`.',
      SHARED_RULES,
      `Quality conditions of the judged templates — ${qualityGatesOf(['WZR-ZRODLA', 'WZR-AUDYT', 'WZR-KONKURENCJA', 'WZR-USTALENIA'])}`,
    ].join(' '),
    result: { kind: 'research', schema: researchQaResult },
  }),
]
