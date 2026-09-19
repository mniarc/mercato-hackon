import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { renderContractFields } from '../../data/contracts'
import { postAuthorResult, postEditorResult } from '../../data/agents/post'
import { RESEARCH_POST_AUTHOR_AGENT_ID, RESEARCH_POST_EDITOR_AGENT_ID } from './ids.post'
import { MODEL_QA, MODEL_SYNTHESIS, SHARED_RULES } from './shared'

// P7 — post author (7.2) and the independent editor (7.3, Q-T). The author is
// ISOLATED: its whole world is the post instruction (WEW-ZLECENIE-POSTU) and the
// ToV — no register, no audit, no network. The editor receives the same packet
// plus the draft and never becomes the client's approval. Ids, the target, the
// metrics, the qa block and the envelope are set by code.

const AUTHOR_RULES = [
  'You write ONE post (KLI-POST.text) for the selected topic in `selected_item`, in the',
  'language of `delivery_constraints.language`, for the channel in `delivery_constraints`.',
  'Your only sources are `evidence_payload`, `reader_value`, `voice_extract`, `tov` and',
  '`completion`. Every checkable statement about the company, its clients, numbers, results',
  'or the market must come from an evidence card; if a claim you would like to make has no',
  'card, leave it out — never look anything up, never remember it, never invent it. Creative',
  'form is free: metaphors, questions, structure, a hypothetical reader situation marked as',
  'such (`kind: creative_example`, `evidence_kind: creative_proposal`). Do not write ROI,',
  'effectiveness, uniqueness or partner achievements as the company\'s own. Do not use any',
  'digit or percentage that is not present verbatim in an evidence card. Use only links from',
  '`delivery_constraints.links` and only mentions from `delivery_constraints.mentions`; an',
  'empty list means no links and no mentions. Respect `prohibited_claims` and',
  '`product_length_target` (words); when `max_text_length` is a number, stay under it.',
  'Return `claims_map`: one row per checkable fragment of your text, `fragment` copied',
  'VERBATIM from `text`, with the `claim_id` / `fact_ids` / `creative_payload_ids` /',
  '`source_ids` of the card it rests on, `kind` and `evidence_kind`, a `limitation` and',
  '`used_within_evidence`. Return `links_and_mentions` only for what the text uses.',
  '`client_note` (≤ 80 words) says why this angle serves the goal and what the client should',
  'check. `self_check` answers every `tov.copy_checks` question by its `id` with `pass` /',
  '`fail` / `not_applicable` and one sentence of evidence; it is a proposal, the editor decides.',
  'When `repair_findings` is non-empty, fix exactly those findings starting from',
  '`previous_text` and keep everything else unchanged.',
].join(' ')

const EDITOR_RULES = [
  'You are the independent editor of step 7.3 (Q-T). You did not write the text. You receive',
  'the post (`text`, `claims_map`, `links_and_mentions`, `client_note`), the same instruction',
  'packet the author had (`selected_item`, `evidence_payload`, `reader_value`,',
  '`voice_extract`, `prohibited_claims`, `allowed_links`), the ToV `copy_checks`, the',
  'measured `length` and the deterministic `validator_findings`. Check, in this order:',
  '(1) no statement about the company, its clients, numbers, results or the market goes',
  'beyond an evidence card — a question or a metaphor must not pose as a research result;',
  '(2) the text serves `selected_item` (audience, goal, main message, angle) and the',
  '`reader_value`; (3) the voice follows `voice_extract` and passes the `copy_checks` — answer',
  'each by its `id`; (4) links and mentions are only the allowed ones and the CTA does not',
  'promise a page or a reaction time that no card supports; (5) the length is inside the',
  'target and under the platform limit when one is given. You may not research, open links or',
  'add facts; unverifiable items go to `not_verified`. Return `result`: `pass_for_draft` when',
  'no blocker remains, `needs_fix` when the author must change something (list every finding',
  'with `severity`, the exact `fragment` or null, the `issue` and a concrete `fix_hint`),',
  '`reject` when the text cannot be repaired within the instruction (e.g. the angle needs',
  'evidence that does not exist). `checked` lists what you verified and how. Your review is',
  'never the client\'s approval.',
].join(' ')

export const postAgents: AiAgentDefinition[] = [
  defineAgent({
    id: RESEARCH_POST_AUTHOR_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Post author',
    description: 'Writes one post from the isolated post instruction and the tone of voice; every checkable fragment is mapped to its evidence card.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [AUTHOR_RULES, SHARED_RULES, renderContractFields('WZR-POST', ['text', 'claims_map', 'links_and_mentions', 'client_note'])].join(' '),
    result: { kind: 'research', schema: postAuthorResult },
  }),

  defineAgent({
    id: RESEARCH_POST_EDITOR_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Post editor (Q-T)',
    description: 'Independent editorial and factual review of one post version against its instruction, the tone of voice and the channel constraints.',
    defaultModel: MODEL_QA,
    instructions: [EDITOR_RULES, SHARED_RULES, renderContractFields('WZR-POST', ['qa'])].join(' '),
    result: { kind: 'research', schema: postEditorResult },
  }),
]
