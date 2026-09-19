import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { renderContractFields } from '../../data/contracts'
import { competitorCardResult, competitorSelectorResult, competitorSynthesizerResult } from '../../data/agents/competitors'
import { RESEARCH_COMPETITOR_CARD_AGENT_ID, RESEARCH_COMPETITOR_SELECTOR_AGENT_ID, RESEARCH_COMPETITOR_SYNTHESIZER_AGENT_ID } from './ids.competitors'
import { MODEL_EXTRACT, MODEL_SYNTHESIS, SHARED_RULES } from './shared'

// F07 — competitors (3.4–3.5). Discovery and fetching are code (Firecrawl search,
// then pages read by the page extractor with `entity` = the competitor); these
// agents choose among real hits, build one card per company on common criteria,
// and compare — "brak wzmianki u konkurenta nie dowodzi wyłączności".

export const competitorsAgents: AiAgentDefinition[] = [
  defineAgent({
    id: RESEARCH_COMPETITOR_SELECTOR_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Competitor selector',
    description: 'Picks up to three competitors from real search results, each justified by similarity of audience, need and offer; separates direct competitors from alternative routes.',
    defaultModel: MODEL_EXTRACT,
    instructions: [
      'From `search_hits` (real results: url, title, snippet) choose at most `maxCompetitors`',
      'companies that a buyer of the offer in `business_profile` / `offer_map` would consider',
      'INSTEAD of the client in `order`: same audience, same need, comparable offer. Each',
      'candidate: `company` (as it names itself), `url` — MUST be exactly one of the hit urls',
      '(never a url you know from elsewhere), `competition_type` (direct competitor /',
      'category benchmark / alternative route provider), `shared_problem_scope`,',
      '`market_scale_difference` (say `unknown` when the snippet does not show it) and the',
      '`reason`. Prefer companies over marketplaces, directories, news, job boards or the',
      "client's own pages; list what you set aside in `excluded` with `why`. Category",
      'proximity is not proof of meeting in the same tenders — say so in `reason` when it is a',
      'benchmark rather than a rival. Fewer than the maximum is correct when the hits are poor.',
      SHARED_RULES,
      renderContractFields('WZR-KONKURENCJA', ['selection']),
    ].join(' '),
    result: { kind: 'research', schema: competitorSelectorResult },
  }),

  defineAgent({
    id: RESEARCH_COMPETITOR_CARD_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Competitor card extractor',
    description: 'Builds one comparable card for one competitor from its extracted facts: buyer, problem, service, message, mechanism, proof, CTA, language, channels — unknown where nothing was read.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      'Build the WZR-KONKURENCJA `card` for `company` from its `facts` and `language_samples`',
      '(ids from the input only). Every dimension (`market_segment`, `problem`, `service`,',
      '`message`, `mechanism`, `proof`, `cta`, `language`) has `text`, `fact_ids` and an',
      'optional `status` naming the interpretation (e.g. "interpretacja pozycjonowania"). An',
      'unread trait is `unknown` in `text` with `fact_ids: []` — never "brak" and never',
      'filled from memory. `channels`: `confirmed` only what a fact shows, the rest',
      '`unverified`. `comparability`: on which criteria this company is comparable with the',
      'client and on which it is not (scale, price, identical customers). `category`: the',
      'comparative classification. `unknowns`: what would matter for a buyer but is not',
      'public. Also return `channel_observation`: the visible activity, the sample you had,',
      'the metrics you could see, and the `unknowns` (leads, cost, conversion, revenue) —',
      'activity and reactions are not effectiveness.',
      SHARED_RULES,
      renderContractFields('WZR-KONKURENCJA', ['cards', 'channels']),
    ].join(' '),
    result: { kind: 'research', schema: competitorCardResult },
  }),

  defineAgent({
    id: RESEARCH_COMPETITOR_SYNTHESIZER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Comparison coordinator',
    description: 'Compares the client with the selected competitors on the same criteria: parity claims, alternative routes, honest differentiator candidates, implications for strategy, and gaps to send back to research.',
    defaultModel: MODEL_SYNTHESIS,
    instructions: [
      'Compare the `client` (its offer, buyer scenarios, message map, proof cards) with the',
      '`cards` of the selected competitors on the SAME criteria. `parity_claims`: at least two',
      'concrete promises common to the category when the material confirms them (claim, which',
      'companies make it, evidence ids, why it cannot differentiate) — "kompleksowość", "jakość",',
      '"badania", "AI" alone are never a differentiator. `alternative_routes`: own team, current',
      'software house, a separate researcher/designer, doing nothing — when each makes sense',
      'and its trade-off, marked `hypothesis_not_buyer_research` without buyer data; do not',
      'belittle alternatives (the current supplier can also run a diagnosis).',
      '`difference_candidates`: 2–3 candidates, each a concrete mechanism of the client',
      '(`feature`) with the benefit, `proof_ids`, the comparison with the alternative, what is',
      'still `unknown` (never empty), and `allowed_claim_strength` — at most',
      '`documented_capability` unless a `measured_case` proof supports `demonstrated_result`;',
      'absence of a claim at a competitor does not prove exclusivity; when no justified',
      'difference exists, recommend a narrower segment/mechanism and a test, not a "jedyni"',
      'claim. `implications`: 3–5 conclusions for the strategy decision (finding, limitation,',
      'target strategy field, the client answer needed, evidence ids) — without writing the',
      'strategy. `return_requests`: only concrete gaps that could change a decision, addressed',
      'to 3.2 (client source) or 3.4 (competitor source), each with the source to check and',
      'the expected result. If `repair_findings` is non-empty, fix exactly what they name.',
      SHARED_RULES,
      renderContractFields('WZR-KONKURENCJA', ['parity_claims', 'alternative_routes', 'difference_candidates', 'implications']),
    ].join(' '),
    result: { kind: 'research', schema: competitorSynthesizerResult },
  }),
]
