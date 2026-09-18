# `agency_tov` — tone-of-voice agents, and the pattern every agency agent follows

This module is two things: the **brand-language department** of the AI agency
(process step 5.3, user story F22-1, document KLI-TOV), and the **reference layout**
for every other agent module we add (strategy, planning, post writer, QA, triage…).
Copy the skeleton, keep the rules.

## The pattern in one picture

```
             ┌───────────── code owns the process ─────────────┐
 corpus ──▶  ingest ──▶ split into bounded inputs ──▶ agent (map) ──▶ typed results
             (Apify /    (batches, one per call)      × N in parallel      │
              file)                                                        ▼
                                              agent (reduce) ──▶ agent (reduce) ──▶ document
                                              per author          per brand         (KLI-TOV)
             └── every step validated with zod, cached, resumable ──────────┘
```

- **Agents are researchers.** `defineAgent({ result: { kind: 'research', schema } })`
  from the Agent Orchestrator SDK. They get one bounded input, return one typed
  object and never write; only the scout has tools (the platform's web search).
  "The Agent Proposes. The System Decides."
- **The process lives in code**, not in a prompt. Batching, ordering, fan-out,
  merge order, retries and caching are plain TypeScript (`lib/tov/pipeline.ts`).
  A model never sees the whole corpus, so cost and latency scale with the batch
  size, not with the client.
- **Ingestion is code too.** Apify runs as an ingestion step (`lib/corpus/`), never
  as an agent tool — agents stay read-only and egress-free.
- **The runner is injected.** The pipeline receives `runAgent(agentId, input)`.
  In production that is `agentRuntime.run()` (persisted `agent_runs`, admission
  gate, provider budgets, guardrails, visible in Backend → Agents). For prompt
  iteration it is a bare structured-output call (`--runner direct`). Same
  prompts, same schemas, no platform needed.

## Skeleton to copy for a new agent module

```
apps/mercato/src/modules/<agency_xxx>/
├── index.ts            ModuleInfo, `requires: ['agent_orchestrator']`
├── acl.ts              `<module>.view` / `<module>.manage`
├── setup.ts            defaultRoleFeatures
├── ai-agents.ts        defineAgent(...) per agent + exported `*_AGENT_ID` constants
├── data/validators.ts  zod: INPUT schema per agent, RESULT schema per agent
│                       (`{ kind: z.literal('research'), data }`), document shape
├── lib/<domain>/       the process: pure functions + one `run<Xxx>Pipeline()`
│                       that takes `runAgent` and returns typed results
├── lib/corpus/         (only if the agent reads external material) ingestion +
│                       normalisers; a source that yields nothing is a report, not a crash
├── cli.ts              `yarn mercato <module> run …` — the end-to-end entry point
│                       until the case/workflow wiring exists; also `--runner direct`
├── __tests__/          pipeline with a fake `runAgent`, normalisers, renderers,
│                       "agents are object-mode, read-only, tool-less" assertion
└── README.md           what the agent is for, its inputs/outputs, how to run it
```

Then: add `{ id: '<module>', from: '@app' }` inside the
`enterpriseModulesEnabled && enterpriseAgentsEnabled` block of
`apps/mercato/src/modules.ts`, run `yarn generate`, and the agents appear in
**Backend → Agents** with a Playground.

## Rules that keep agents consistent

1. **One bounded input per call.** If the evidence can grow (posts, pages,
   tickets), split it in code and add a reduce step. Never "let the manager agent
   delegate over everything": a sub-agent's input passes through the parent's
   context, so the parent still pays for the whole corpus.
2. **Schemas are the contract.** Input and result schemas live in
   `data/validators.ts`; the pipeline re-validates every agent result (`schema.parse`)
   so a malformed answer fails loudly at the step that produced it.
3. **Prompts are operational.** Instructions say what the reader must be able to
   DO with the output (here: write a post in this voice), forbid invented evidence
   (`postId` must exist in the input; quotes verbatim), and set the output language
   from the input (`outputLanguage`), while quotes stay in the source language.
4. **Evidence travels as references.** Results carry post ids / version ids, not
   copies of the material. Downstream steps receive compact structured facts.
5. **Nothing is fabricated on failure.** An empty source, a timed-out call or a
   schema miss surfaces as a report/error; the pipeline never fills the gap with
   made-up content (hackathon rule: key paths work live, or they visibly fail).
6. **Resumable by default.** Every step has a cache key derived from its exact
   input (`fingerprint`), so a crashed 60-batch run resumes where it stopped and a
   prompt change on one agent re-runs only that agent's steps.
7. **Bounded outputs — in the prompt, not the schema.** Say "≤4 examples, quotes
   ≤240 chars" in the instructions; providers ignore JSON-schema `maxItems` /
   `maxLength`, so a hard `.max()` rejects a good answer for one extra bullet.
   Keep numeric bounds (dials 1–5, confidence 0–1) — models respect those.

## This module's agents

| Agent id | Step | Input (bounded) | Output |
|---|---|---|---|
| `agency_tov.source_scout` | discover (optional) | brand, people names, known URLs — public identifiers only | scrape targets `{source, url, owner, material, confidence, evidenceUrl}` — the ONLY web-enabled agent (`agent_orchestrator.web_search` / `web_fetch`; adapters like Firecrawl or SERP are configured in Backend → Settings → web search or `OM_WEB_SEARCH_ADAPTERS`) |
| `agency_tov.batch_analyst` | map | ~40 posts of ONE author, chronological, with engagement + media flag | `TovBatchObservation`: register dials, POV, rhythm, hooks, structures, closers, vocabulary, formatting, themes, what landed, do/don't, ≤4 exemplars |
| `agency_tov.profile_synthesizer` | reduce per author | all observations of one author with date ranges | `TovProfileVoice`: pillars, evolution over time, post skeletons, rules, exemplars |
| `agency_tov.brand_synthesizer` | reduce per brand | one voice profile per person speaking for the brand | `TovBrandVoice` = KLI-TOV: positioning, personality, pillars with do/not, register, addressing, emotions, boundaries, language policy, vocabulary, post formats, persona variants, recommended vs not-recommended examples, QA checklist |

Sizing: 2 500 posts ≈ 1.7 M chars ≈ 63 analyst calls of ~7k tokens + 5 profile
syntheses (≤60k tokens) + 1 brand synthesis. Concurrency 4 → roughly 5–8 minutes
end to end on a Sonnet-class model.

## Running it

```bash
# from an Apify export already on disk (LinkedIn profile posts)
yarn mercato agency_tov run --brand "Open Mercato" --out output/tov \
  --file ~/Downloads/dataset_linkedin-profile-posts_….json --lang en

# live scrape through Apify (APIFY_TOKEN), several sources, LinkedIn may be empty
yarn mercato agency_tov run --brand "Acme" --out output/acme \
  --scrape linkedin=https://www.linkedin.com/in/someone/,website=https://acme.com/blog,x=https://x.com/acme \
  --max-posts 300

# let the scout find the channels first (needs web search enabled for the user),
# then scrape them; LinkedIn may come back empty and the run still completes
yarn mercato agency_tov run --brand "Acme" --out output/acme \
  --discover "Jane Doe;John Roe" --website https://acme.com --min-confidence 0.6

# prompt iteration without the platform (OPENROUTER_API_KEY or OPENAI_API_KEY; map stage on a cheap model, reduce on a stronger one — `--model` / `--synthesis-model`)
yarn mercato agency_tov run --brand "Acme" --out output/acme --file corpus.json --runner direct --limit 80
```

Outputs in `--out`: `discovery.json` (scout result), `corpus.json` (normalised posts), `scrape-report.json`,
`cache/` (resume store), `profiles/<author>.{json,md}`, `brand.json`,
`KLI-TOV.md`, `run-summary.txt`.

Sources and actors: `linkedin` (`harvestapi/linkedin-profile-posts`), `x`
(`apidojo/tweet-scraper`), `facebook` (`apify/facebook-posts-scraper`), `instagram`
(`apify/instagram-scraper`), `website` (`apify/website-content-crawler`). Override any
actor with `OM_AGENCY_TOV_APIFY_ACTOR_<SOURCE>`. Non-LinkedIn field maps are
best-effort (`lib/corpus/generic.ts`) and degrade to skipped items, never to a crash.

## Where it plugs into the agency process

- Input: the client's channels from the brief / purchase data (P3 audit sources),
  widened by the scout when the client listed too little.
- Output: a `KLI-TOV` document version, linked to the current `KLI-STRATEGIA`
  proposal and the approved brief (F22-1 AC 1), submitted as a pair to QA 5.4.
- Revision (F22-1 AC 4): rerun with the previous version in the brand
  synthesizer input — TODO once the document model (OM-04) exists.
- Case wiring: a work item in `agency_operations` triggers `runTovPipeline` from a
  queue worker with the orchestrator runner; the CLI is the same call without the case.
