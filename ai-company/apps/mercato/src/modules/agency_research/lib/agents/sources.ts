import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { renderContractFields } from '../../data/contracts'
import { contentSeederResult, conflictFinderResult, coverageAssessorResult, pageExtractorResult, proofBuilderResult } from '../../data/validators'
import {
  RESEARCH_CONFLICT_FINDER_AGENT_ID,
  RESEARCH_CONTENT_SEEDER_AGENT_ID,
  RESEARCH_COVERAGE_ASSESSOR_AGENT_ID,
  RESEARCH_PAGE_EXTRACTOR_AGENT_ID,
  RESEARCH_PROOF_BUILDER_AGENT_ID,
} from './ids.sources'
import { MODEL_EXTRACT, MODEL_SYNTHESIS, SHARED_RULES } from './shared'

// The 3.2 agents (F06): one page in → its evidence out (map), then four small
// syntheses over the fact bank (reduce). Each carries the WZR-ZRODLA field
// definitions it owns, rendered verbatim from Rafał's contract v1.1.

export const sourcesAgents: AiAgentDefinition[] = [

  // 3.2 map — one page (or chunk) in, its atomic evidence out.
  defineAgent({
    id: RESEARCH_PAGE_EXTRACTOR_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research page extractor',
    description: 'Reads ONE stored page of a company (or a competitor) and extracts atomic, quotable facts, language samples and audience signals with verbatim anchors.',
    defaultModel: MODEL_EXTRACT,
    instructions: [
      'You read ONE page (`page.content_md`, markdown) published by `entity` (`client` = the',
      'brand in `order`, otherwise a competitor name) and extract evidence for a communication',
      'audit. Return `facts`: ONE claim per item, in `outputLanguage`, each with a `quote` copied',
      'VERBATIM from the page (5–40 consecutive words, no paraphrase, no fixing typos) that',
      'supports exactly that claim; `kind` is `observed` for something visibly present on the',
      'page (a form, a price, a listed service, a named partner logo), `first_party_claim` for',
      'what the company says about itself, `case_evidence` ONLY when the page shows a specific',
      'past engagement with an action AND a result; `use_scope` lists which brief fields the',
      'fact can inform (offer, audience, promise, proof, mechanism, cta, channel, language,',
      'alternatives); `limitation` states what the fact does NOT establish. Prefer 6–15 facts',
      'that a strategist could use over exhaustive lists; skip navigation, legal boilerplate',
      'and repeated menus. `language_samples`: 1–4 short VERBATIM fragments (≤40 words) that',
      'show HOW the company writes, each with its situation, the audience the text implies,',
      'concrete `linguistic_features` (sentence length, person, jargon, imperatives, emoji…)',
      'and the observed function of the fragment. `audience_signals`: only when the page',
      'names who buys, when, why or what they object to; mark `evidence_status` as',
      '`customer_voice` only for quoted customers, otherwise `supplier_interpretation_not_customer_voice`',
      'or `hypothesis`, and point `fact_refs` at your own `local_ref`s. `local_ref` values are',
      'unique short labels (f1, f2, l1, a1). `page_summary`: one or two sentences on what this',
      'page is and is not. Empty arrays are correct for a page with nothing usable.',
      SHARED_RULES,
      renderContractFields('WZR-ZRODLA', ['facts', 'language_samples', 'audience_signals']),
    ].join(' '),
    result: { kind: 'research', schema: pageExtractorResult },
    sampleInput: {
      order: { brand: 'Acme', market: 'Polska', language: 'pl', websiteUrl: 'https://acme.example', purchaseGoal: null },
      entity: 'client',
      page: { source_id: 'S-01', url: 'https://acme.example/', publisher: 'Acme', channel: 'WWW', origin: 'purchase_form', chunk: { index: 0, total: 1 }, content_md: '# Acme\n\nProjektujemy i wdrażamy systemy B2B dla firm produkcyjnych.' },
      outputLanguage: 'pl',
    },
  }),

  // 3.2 reduce — proof cards over the fact bank, plus the O-3.2 business profile.
  defineAgent({
    id: RESEARCH_PROOF_BUILDER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research proof builder',
    description: 'Turns the fact bank into proof-of-competence cards with the correct evidence variant, and a preliminary business profile.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      'You receive the company\'s fact bank (`facts` with ids and kinds, `sources`, `language_samples`,',
      '`audience_signals`) — never the pages. Build `proof_cards`: each card is one competence or',
      'promise the company could substantiate, with `proof_type` chosen by the STRICT variant rules:',
      '`declaration` when the company only states a method/service (then `actual_action` and',
      '`observed_result` MUST be null — a declaration proves neither implementation nor effect);',
      '`observed_artifact` when a real deliverable or method artifact is visible (`artifact_or_method`',
      'required, `observed_result` null); `measured_case` ONLY with an actual action, an observed',
      'result and `case_evidence` facts behind it; `external_confirmation` when an independent',
      'source confirms something — say exactly what it confirms and what it does not. `fact_ids`',
      'cite the supporting facts (ids from the input only). `limitations` say what the card must',
      'not be used to claim (no % savings, no guaranteed timelines, no "only on the market", no',
      'partner results as own). Aim for 3–6 cards; a company with no case gets declaration cards',
      'and a note, never an invented case. Also return `business_profile` (O-3.2): the category',
      'the company competes in, a one-paragraph offer summary, the audience the material',
      'implies (as a hypothesis), the market/language hint, and the `fact_ids` it rests on.',
      SHARED_RULES,
      renderContractFields('WZR-ZRODLA', ['proof_cards']),
    ].join(' '),
    result: { kind: 'research', schema: proofBuilderResult },
  }),

  // 3.2 reduce — the content bank: twelve distinct, evidence-backed angles.
  defineAgent({
    id: RESEARCH_CONTENT_SEEDER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research content seeder',
    description: 'Builds the content bank: distinct audience questions and angles, each with the exact supported claim and a clearly labelled proposed utility.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      'From the fact bank and `proof_cards` build `content_bank`: `requiredTopics` (usually 12)',
      'DISTINCT audience questions a future post could answer, each with an `angle` (the useful',
      'idea, not a title), the `source_claim` — the exact content the evidence supports, with its',
      'limitation, citing `source_claim_fact_ids` from the input — and a `proposed_utility`: an',
      'analytical or creative checklist, question set or explanation that is clearly YOUR proposal,',
      'never presented as the company\'s process or as validated method. `proof_ids` cite cards',
      'from the input. `prohibited_claims` list what this angle must not promise. `readiness` is',
      '`ready` only when the substantive material is PRESENT in the facts (not a future research',
      'task), `conditional` when it needs a client decision or example, `blocked` when the evidence',
      'is missing; explain in `readiness_reason`. Two angles may reuse the same facts if they',
      'answer different questions — name the difference. Twelve genuinely different questions',
      'beat twelve variations of one; do not pad with generic marketing topics that no fact supports.',
      SHARED_RULES,
      renderContractFields('WZR-ZRODLA', ['content_bank']),
    ].join(' '),
    result: { kind: 'research', schema: contentSeederResult },
  }),

  // 3.2 reduce — contradictions and stale statements across sources.
  defineAgent({
    id: RESEARCH_CONFLICT_FINDER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research conflict finder',
    description: 'Finds contradictions, framing differences and possibly outdated statements between facts from different sources.',
    defaultModel: MODEL_EXTRACT,
    instructions: [
      'Compare the `facts` (ids, claims, source ids, dates of retrieval in `sources`) and return',
      '`conflicts`: places where two or more facts contradict each other, describe the company',
      'differently across channels, or where one is likely outdated. Each conflict cites ≥2',
      '`fact_ids` from the input, explains the `detail`, the possible `impact` on communication',
      '(as a hypothesis), the `question` that would resolve it, and a `state`:',
      '`unresolved_real_decision` when the client must decide, `framing_difference_not_factual_contradiction`',
      'when both are true in different contexts, `possibly_outdated` when dates suggest it. An empty',
      'list is correct after checking — never invent a conflict to fill the list. A claim',
      'repeated on two pages is NOT a conflict; only incompatible or dated statements are. One',
      'more kind counts: a `first_party_claim` about scale or results ("500 clients", "15 years",',
      '"40% faster") that no `observed` or `case_evidence` fact on any page corroborates — report',
      'it with `state: unresolved_real_decision` and the question that would confirm it, so the',
      'brief does not repeat an unbacked number.',
      SHARED_RULES,
      renderContractFields('WZR-ZRODLA', ['conflicts']),
    ].join(' '),
    result: { kind: 'research', schema: conflictFinderResult },
  }),

  // 3.2 reduce — does the register cover what the next documents need?
  defineAgent({
    id: RESEARCH_COVERAGE_ASSESSOR_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research coverage assessor',
    description: 'Assesses, need by need, whether the register can support the brief, strategy, plan and post — with the gap and its owner.',
    defaultModel: MODEL_EXTRACT,
    instructions: [
      'For EACH requirement in `requirements` (segment, problem, zakup = purchase situation, oferta,',
      'mechanizm, dowód = proof, alternatywy, język, CTA) judge whether the register (facts, proof',
      'cards, samples, signals, seeds, conflicts) supports the later documents: `readiness` `ready`',
      'when the material is present and specific, `conditional` when it exists but a client decision',
      'or a limit applies, `blocked` when it is missing; `evidence_ids` cite the ids that support the',
      'judgement; `gap` states precisely what is missing and its consequence; `owner` says who fills',
      'it: `research` (another source to read), `klient` (a decision or example only the client',
      'has), `agencja` (an analytical step), `none` when nothing is missing. Judge field by field —',
      'never a single overall percentage. A future goal, priority or preference cannot be read off',
      'a website: those are `klient`. Return exactly one row per requirement.',
      SHARED_RULES,
      renderContractFields('WZR-ZRODLA', ['coverage']),
    ].join(' '),
    result: { kind: 'research', schema: coverageAssessorResult },
  }),

]
