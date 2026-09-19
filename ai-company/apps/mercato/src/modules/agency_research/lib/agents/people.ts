import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { channelSelectorResult, peopleFinderResult } from '../../data/agents/people'
import { RESEARCH_CHANNEL_SELECTOR_AGENT_ID, RESEARCH_PEOPLE_FINDER_AGENT_ID } from './ids.people'
import { MODEL_EXTRACT, SHARED_RULES } from './shared'
import { promptFor } from './prompts'

// 3.2a — the people who speak for the brand. Two small extract-tier agents around
// code-owned search: the finder names people that the stored pages (or the client)
// actually name; the selector picks, among real search hits, where each of them
// publishes and where they are quoted. Scraping and fetching are code.

export const peopleAgents: AiAgentDefinition[] = [
  defineAgent({
    id: RESEARCH_PEOPLE_FINDER_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'People finder',
    description: 'Names the people who speak for the brand — founders, owners, leaders, named spokespeople — only from the stored client pages or the list the client provided.',
    defaultModel: MODEL_EXTRACT,
    instructions: promptFor(RESEARCH_PEOPLE_FINDER_AGENT_ID, [
      'From the stored client `pages` (excerpts) and `known_people`, return the `people` who speak',
      'for the brand in `order`: founders, owners, managing partners, leaders, named experts or',
      'spokespeople whose words carry the company\'s voice. Include every `known_people` entry',
      '(confidence 1, `evidence_quote` = "provided by client", `source_id` null) and add people the',
      'pages name: each with `name` exactly as written on the page, `role` as the page states it',
      '(or `unknown role` when it does not), `why` they speak for the brand, `evidence_quote` — a',
      'VERBATIM run of 3–30 words from the page that contains the name — and the `source_id`.',
      'Skip clients, partners, testimonial authors, staff listed without a public role, and',
      'generic contact addresses. At most 5, strongest voices first, `confidence` honest. An',
      'empty list is correct when no page names anyone. `notes` (≤ 60 words): what you could',
      'not tell from the pages.',
      SHARED_RULES,
    ]),
    result: { kind: 'research', schema: peopleFinderResult },
    sampleInput: {
      order: { brand: 'Acme', market: 'Polska', language: 'pl', websiteUrl: 'https://acme.example' },
      outputLanguage: 'pl',
      pages: [{ source_id: 'S-02', url: 'https://acme.example/o-nas', publisher: 'Acme', excerpt: '# O nas\n\nFirmę prowadzi Anna Kowalska, założycielka i CEO. Wdrożeniami kieruje Jan Nowak.' }],
      known_people: [{ name: 'Anna Kowalska', role: null, provided_by: 'contact' }],
    },
  }),

  defineAgent({
    id: RESEARCH_CHANNEL_SELECTOR_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Channel selector',
    description: 'For one person who speaks for the brand, picks from real search hits the channels where they publish and the pages where they are quoted; never a URL that was not a hit.',
    defaultModel: MODEL_EXTRACT,
    instructions: promptFor(RESEARCH_CHANNEL_SELECTOR_AGENT_ID, [
      'You receive one `person` (name, role) of the brand in `order` and the real search `hits` for',
      'them (query, url, title, snippet). Decide which hits are THIS person: the brand name, the',
      'role, the city or the market in the title or snippet are your cues; a namesake in another',
      'industry goes to `not_this_person`. Return `own_channels`: places where the person publishes',
      'in their own words — a personal LinkedIn profile (`/in/…`), an X/Twitter account, a personal',
      'blog, a Medium/Substack, a YouTube channel — each with `platform`, `why` and `confidence`.',
      'Return `mentions`: pages where someone else quotes or interviews them (interviews, articles,',
      'podcast episodes, conference talks) with `kind`, `why`, `confidence`. Every `url` MUST be',
      'exactly one of the hit urls — never a url you know from elsewhere, never a guessed profile',
      'address. Skip people-search sites, Crunchbase-style directories, the brand\'s own website',
      '(already read) and duplicate hosts. Fewer entries is right when the hits are poor; empty',
      'lists are correct when nothing is clearly this person.',
      SHARED_RULES,
    ]),
    result: { kind: 'research', schema: channelSelectorResult },
    sampleInput: {
      order: { brand: 'Acme', market: 'Polska', language: 'pl', websiteUrl: 'https://acme.example' },
      outputLanguage: 'pl',
      person: { name: 'Anna Kowalska', role: 'założycielka i CEO' },
      hits: [
        { query: '"Anna Kowalska" Acme', url: 'https://www.linkedin.com/in/anna-kowalska-acme/', title: 'Anna Kowalska – CEO – Acme | LinkedIn', snippet: 'CEO w Acme. Systemy B2B dla produkcji.' },
        { query: '"Anna Kowalska" wywiad', url: 'https://example-media.pl/wywiad-anna-kowalska-acme', title: 'Jak Acme skraca wdrożenia — rozmowa z Anną Kowalską', snippet: 'Rozmawiamy z założycielką Acme o…' },
      ],
    },
  }),
]
