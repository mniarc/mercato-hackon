import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import {
  tovBatchAnalystResult,
  tovBrandSynthesizerResult,
  tovProfileSynthesizerResult,
  tovSourceScoutResult,
} from './data/validators'

import {
  TOV_SOURCE_SCOUT_AGENT_ID,
  TOV_BATCH_ANALYST_AGENT_ID,
  TOV_PROFILE_SYNTHESIZER_AGENT_ID,
  TOV_BRAND_SYNTHESIZER_AGENT_ID,
} from './lib/agentIds'

// Preserve the existing public identifier exports without forcing consumers to
// import this registration entry point.
export * from './lib/agentIds'

// The three tone-of-voice ANALYSIS agents form a map → reduce that `lib/tov/pipeline.ts`
// drives in code. Each one is a RESEARCHER with NO tools: it reasons only over the
// evidence slice it is handed, so a run's cost and latency are bounded by the
// batch size, never by the corpus. The corpus itself (thousands of posts) never
// enters a single context.
//
// Shared rules the prompts repeat on purpose (the model sees one agent at a time):
// - quotes are verbatim and in the source language; analysis is in `outputLanguage`;
// - every `postId` must be one from the input — never invented;
// - be concrete: a reader must be able to WRITE in this voice from the output alone,
//   so generic praise ("authentic", "engaging") is worthless without the pattern behind it.

const SHARED_RULES = [
  'Write all analysis, labels and explanations in the language given by `outputLanguage`',
  '(`pl` = Polish, `en` = English). Quotes stay VERBATIM in their original language.',
  'Every `postId` you cite MUST be an `id` present in the input; never invent ids or quotes.',
  'Be concrete and operational: describe patterns a copywriter could reproduce (sentence',
  'shapes, openers, closers, recurring words, formatting habits), not adjectives. Avoid',
  'generic tone-of-voice filler such as "authentic", "engaging" or "professional" unless',
  'you immediately say what it looks like on the page. Every field is REQUIRED; when the',
  'evidence is thin, say so in the field and lower `confidence` instead of guessing.',
].join(' ')

export const aiAgents: AiAgentDefinition[] = [
  // The only web-enabled agent: it finds WHERE the brand's people publish, so the
  // corpus is not limited to LinkedIn (or to whatever the client listed). Egress
  // goes through the platform's `web_search` / `web_fetch` tools (adapters such
  // as Firecrawl or SERP are configured per deployment / tenant), gated by the
  // default-off `agent_orchestrator.web_search` feature. Its output is a list of
  // scrape targets the pipeline then ingests in code — it fetches no corpus itself.
  defineAgent({
    id: TOV_SOURCE_SCOUT_AGENT_ID,
    moduleId: 'agency_tov',
    agentType: 'researcher',
    label: 'ToV source scout',
    description:
      'Finds the public channels (LinkedIn, X, blog, YouTube, podcasts, Medium…) where a brand and its people publish, as scrape targets for the tone-of-voice corpus.',
    instructions: [
      'You locate the public places where a brand (`brand`) and the people who speak for it',
      '(`people`, with any `knownUrls`) publish text in their own voice: personal and company',
      'LinkedIn pages, X/Twitter accounts, personal or company blogs, Medium/Substack, YouTube',
      'channels, podcast show pages, conference-talk pages, newsletters. Use the web search tool',
      'with several focused queries (one per person and per platform, e.g. "<name> blog",',
      '"<name> site:medium.com", "<name> podcast"), and fetch a page only when the search',
      'result does not make the ownership obvious. Return each channel ONCE as a target with',
      'its `source` (`linkedin`, `x`, `facebook`, `instagram`, `website` for any blog/newsletter/',
      'article page, `youtube`, or `other`), the canonical `url`, the `owner` (person name or the',
      'brand), what `material` is there, a `confidence` 0–1 that it is genuinely theirs and',
      'contains their own writing, and the `evidenceUrl` you saw it on. Prefer channels with',
      'long-form text over ones with only images. Skip aggregator profiles (Crunchbase, LinkedIn',
      'mirrors, people-search sites). Never invent URLs: every target must come from a search',
      'or fetch result. If nothing beyond `knownUrls` can be found, return those with what you',
      'verified and say so in `notes`. Write `notes` in `outputLanguage`.',
    ].join(' '),
    tools: ['agent_orchestrator.web_search', 'agent_orchestrator.web_fetch'],
    result: { kind: 'research', schema: tovSourceScoutResult },
    sampleInput: {
      brand: 'Open Mercato',
      people: [{ name: 'Tomasz Karwatka', knownUrls: ['https://www.linkedin.com/in/tkarwatka/'] }],
      websiteUrl: 'https://openmercato.com',
      outputLanguage: 'en',
    },
  }),

  defineAgent({
    id: TOV_BATCH_ANALYST_AGENT_ID,
    moduleId: 'agency_tov',
    agentType: 'researcher',
    label: 'ToV batch analyst',
    description:
      'Reads one batch of posts (LinkedIn, X, blog…) by a single author and returns structured tone-of-voice observations for that batch.',
    instructions: [
      'You are a tone-of-voice analyst at a marketing agency. The input is ONE batch of posts',
      'written by ONE person or brand channel (`profile`; `profile.source` names the platform:',
      'linkedin, x, facebook, instagram, website = blog/articles, youtube, other), in',
      'chronological order, with engagement counts (zero on platforms without them)',
      '(`likes`, `comments`, `shares`) and a `media` flag (`video`/`image`/`article`/`document`',
      '/`poll`/`newsletter`/`none`). `batch.index` of `batch.total` tells you which slice of the',
      'author\'s history you are looking at. You have no tools: reason ONLY over these posts.',
      'Describe how this person writes IN THIS BATCH — not how LinkedIn posts are written in',
      'general. Rate the five `register` dials 1–5 (1 = casual/cool/hedged/dry/plain, 5 =',
      'formal/warm/assertive/playful/deeply technical) and explain them in `summary`.',
      'Treat short captions attached to media differently from stand-alone text posts: note',
      'the difference in `rhythm`, do not read a 2-line video caption as "terse style".',
      'Use engagement as evidence of what LANDS: in `engagementInsights` name which kinds of',
      'posts in this batch drew the most reactions/comments and what they have in common.',
      'Pick `exemplars` that are typical of the voice (prefer well-performing ones), quote',
      '≤240 characters verbatim, and explain why each is typical. `hooks.examples` are the',
      'verbatim FIRST LINES of posts (≤160 chars). In `doList`/`dontList` write rules a',
      'copywriter could follow to imitate this author.',
      SHARED_RULES,
    ].join(' '),
    result: { kind: 'research', schema: tovBatchAnalystResult },
    sampleInput: {
      profile: {
        source: 'linkedin',
        profileUrl: 'https://www.linkedin.com/in/example/',
        displayName: 'Example Founder',
        postCount: 2,
        firstPostedAt: '2026-01-04T09:00:00.000Z',
        lastPostedAt: '2026-01-11T09:00:00.000Z',
      },
      batch: { index: 0, total: 1 },
      outputLanguage: 'en',
      posts: [
        {
          id: '1',
          postedAt: '2026-01-04T09:00:00.000Z',
          media: 'none',
          likes: 42,
          comments: 6,
          shares: 1,
          text: 'We shipped the wrong feature for six months. Here is what we learned:\n\n1. Nobody asked for it.\n2. We never checked.\n\nWhat is the last thing you built that nobody wanted?',
        },
        {
          id: '2',
          postedAt: '2026-01-11T09:00:00.000Z',
          media: 'image',
          likes: 12,
          comments: 0,
          shares: 0,
          text: 'Team offsite. Whiteboards > slides.',
        },
      ],
    },
  }),

  defineAgent({
    id: TOV_PROFILE_SYNTHESIZER_AGENT_ID,
    moduleId: 'agency_tov',
    agentType: 'researcher',
    label: 'ToV profile synthesizer',
    description:
      'Merges the batch observations for one author into a single voice profile with pillars, rules, exemplars and post skeletons.',
    instructions: [
      'You are a senior tone-of-voice strategist. The input holds every batch observation an',
      'analyst produced for ONE author (`profile`), each with the date range and post count it',
      'covers. You have no tools and no access to the posts themselves: synthesise the',
      'observations into ONE coherent voice profile for this person.',
      'Reconcile, do not average: where batches disagree, decide what is the stable core of',
      'the voice and what is period-specific, and describe the change in `evolution` (use the',
      'date ranges; recent batches describe the CURRENT voice and weigh more).',
      'Name 3–5 `voicePillars`, each backed by concrete `evidence` taken from the observations.',
      'Keep the `register` dials consistent with the batch dials (explain any deviation).',
      'For `exemplars` choose from the exemplars the analysts already quoted (same `postId`,',
      'same verbatim quote); never fabricate. `postSkeletons` are reusable outlines of the',
      'author\'s most typical post shapes, written as step sequences a copywriter can fill in.',
      '`doList`/`dontList` are the rules a ghostwriter must follow to be mistaken for this person.',
      SHARED_RULES,
    ].join(' '),
    result: { kind: 'research', schema: tovProfileSynthesizerResult },
  }),

  defineAgent({
    id: TOV_BRAND_SYNTHESIZER_AGENT_ID,
    moduleId: 'agency_tov',
    agentType: 'researcher',
    label: 'ToV brand synthesizer',
    description:
      'Builds the brand tone-of-voice document (KLI-TOV) from the voice profiles of the people who speak for the brand.',
    instructions: [
      'You are the lead strategist writing the tone-of-voice document for a brand (`brand`).',
      'The input holds one voice profile per person who publicly speaks for it. You have no',
      'tools: work only from these profiles.',
      'Produce a document a copywriter can write from tomorrow: `positioning` (what the brand',
      'sounds like and to whom), `personality` (who is speaking, as a character), 3–5',
      '`voicePillars` each with a `doThis` / `notThat` pair, `sharedTraits` (what everyone',
      'has in common), and `tensions` (where the people genuinely differ — say which way the',
      'brand voice leans and why; never paper over it). Cover explicitly: formality (the',
      '`register` dials), `addressingTheReader` (forms of address, singular/plural, we/I),',
      '`emotions` (the allowed emotional range and what is never done) and `boundaries`',
      '(topics, tones and devices the brand never uses).',
      '`counterExamples` pair a short OFF-voice sentence (`wrong`) with its ON-voice rewrite',
      '(`right`) for one `rule` each — these are the "not recommended / recommended" examples.',
      '`languagePolicy` states which language(s) the brand posts in and when. `postFormats`',
      'are named, reusable post types with a skeleton each, derived from the profiles\'',
      '`postSkeletons` and `structures`. `personaVariants` describe how to write AS each',
      'person when a post is published from their profile. `exemplars` must reuse quotes and',
      '`postId`s already present in the profiles, with the matching `profileUrl`.',
      '`qaChecklist` lists yes/no checks a reviewer runs on a draft to confirm it is on-voice.',
      'When `correction` is supplied, revise its exact previous document only for the',
      'saved instructions and named `affectedFields`. Preserve all other fields verbatim.',
      'Keep the same brand, source profiles and grounded quotes; the correction is not',
      'new evidence or permission to invent claims. Return the complete document in the same format.',
      SHARED_RULES,
    ].join(' '),
    result: { kind: 'research', schema: tovBrandSynthesizerResult },
  }),
]

export default aiAgents
