# How the tone-of-voice agent works

Plain-language walkthrough of `agency_tov`, the brand-language department of the AI agency
(process step 5.3, user story F22-1). For the code-level layout see `README.md`.

## The job in one sentence

Given the public channels of the people who speak for a brand, produce a **tone-of-voice
document (KLI-TOV)** that a copywriter — human or agent — can write from tomorrow: how the
brand opens a post, how it addresses the reader, what words it uses and avoids, what it
never does, with a quote from a real post behind every rule.

## Why not just ask a model "describe this brand's voice"?

Because the evidence is big. Open Mercato's five people have published **2 497 posts —
1.7 million characters, roughly 450 000 tokens**. No single model call should see that: it
is expensive, slow, and the result is a vague average. The corpus also grows per client
(next time it is someone else's people, on other platforms), so the process has to scale
with the batch size, not with the client.

So the work is split the way a research team would split it: read in chunks, write notes,
merge the notes per person, then merge the people into the brand.

## The four agents

All four are **Agent Orchestrator researcher agents** (`defineAgent`, result kind
`research`): each receives one bounded input, returns one typed JSON object validated with
zod, and never writes anything. "The Agent Proposes. The System Decides."

| # | Agent | Reads | Returns |
|---|---|---|---|
| 0 | `agency_tov.source_scout` (optional) | brand name, people's names, known URLs | where these people publish (LinkedIn, X, blog, YouTube, podcasts…) as scrape targets with a confidence and the page it saw them on. The only agent with tools: the platform's `web_search` / `web_fetch`. |
| 1 | `agency_tov.batch_analyst` | ~40 posts of **one** author, in date order, with likes/comments/shares and a media flag | one **observation**: five 1–5 register dials (formality, warmth, confidence, humor, technicality), point of view, rhythm, hook patterns with verbatim first lines, post structures, closers, vocabulary, formatting habits, themes, what performed best and why, do/don't rules, exemplar quotes with post ids |
| 2 | `agency_tov.profile_synthesizer` | all observations of one author, each tagged with its date range | one **voice profile**: 3–5 voice pillars with evidence, how the voice changed over the years, reusable post skeletons, rules, exemplars |
| 3 | `agency_tov.brand_synthesizer` | one voice profile per person | the **KLI-TOV**: positioning, personality, pillars with do/not pairs, register, how the reader is addressed, emotions, boundaries, language policy, vocabulary, post formats with skeletons, hooks, closers, formatting, per-person variants, recommended vs not-recommended examples, cited exemplars, QA checklist |

The agents do not talk to each other and do not decide what to read next. Plain code does.

## The process (code, not prompts)

```
 Apify / file ─▶ normalise ─▶ group by author ─▶ split into batches ─▶ [1] × N in parallel
                                                                            │
                                     per author ◀── observations ◀──────────┘
                                         │
                                        [2] ─▶ voice profiles ─▶ [3] ─▶ KLI-TOV.md + brand.json
```

1. **Ingest.** Posts come from an Apify actor run (LinkedIn, X, Facebook, Instagram, a
   website crawl) or from an export already on disk. Each post is reduced to the seven
   fields a voice analysis needs: id, author channel, date, text, likes, comments, shares,
   media kind. Reposts and empty items are dropped and counted. A source that returns
   nothing (say, no LinkedIn presence) is reported and the run continues with the rest —
   it is never a crash.
2. **Batch.** Each author's posts are sorted by date and cut into batches of at most 40
   posts **and** at most ~28 000 characters, whichever comes first, so a run of long essays
   and a run of two-line captions both produce readable batches. A post is never split.
3. **Map.** Every batch goes to the batch analyst; batches run in parallel (4–5 at a time).
   The pipeline attaches the post ids and date range to each observation itself — the
   model is never asked to echo them.
4. **Reduce, twice.** One synthesis per author, then one for the brand. Recent batches are
   weighted as "the current voice"; older ones feed the *evolution* section.
5. **Validate every step.** Each result is parsed against its zod schema before it is used.
   A malformed answer fails at the step that produced it and is retried; nothing
   half-valid propagates.
6. **Remember every step.** Each step's result is cached under a fingerprint of its exact
   input. A crash on batch 60 of 77 costs one batch on rerun, and changing one agent's
   prompt re-runs only that agent's steps.
7. **Render.** `KLI-TOV.md` for people, `brand.json` for the next agent in the process
   (strategy QA, the post writer), one profile file per author as the evidence appendix.

## Where the model runs

The pipeline takes a `runAgent` function, so the same code has two runners:

- **Orchestrator runner** (production): `agentRuntime.run()` — every call becomes an
  `agent_run` row with tokens and trace, passes the admission gate and provider budget,
  and shows up in **Backend → Agents**. This is the path the demo uses.
- **Direct runner** (prompt work): one bare structured-output call per step, no database.
  It uses a cheap model for the 77 map calls (Haiku 4.5) and a stronger one for the 6
  reduce calls (Sonnet 5), which is where the judgement is.

## What it costs and how long it takes (measured 2026-09-18)

| Run | Posts | Agent calls | Wall time | Cost |
|---|---|---|---|---|
| Sample | 120 | 5 + 3 + 1 | 5.6 min | 0.99 USD (incl. two failed attempts) |
| Full corpus | 2 497 | 77 + 5 + 1 | 23 min | ≈ 5 USD |

Levers: bigger batches (`--batch-size 60`, fewer denser calls), `:batch` model variants
on OpenRouter (half price) for offline runs, `--limit N` for prompt iteration.

## What we learned running it live

- **List bounds belong in the prompt, not the schema.** Providers ignore JSON-schema
  `maxItems` / `maxLength`; a hard zod `.max(4)` rejected an otherwise good answer for one
  extra example. Numeric bounds (dials 1–5, confidence 0–1) are respected and stay.
- **Large schemas break strict structured output on Anthropic** ("compiled grammar is too
  large"). The small analyst schema uses provider-side structured output; the two big
  synthesis schemas get the schema in the prompt and are validated after, with retries —
  small models occasionally emit an unescaped quote inside a JSON string.
- **Retries are infrastructure, not intelligence.** In the full run 8 of 83 calls needed a
  second attempt: 2 timeouts, 5 dropped connections in the same second, 1 malformed JSON.
  All succeeded on retry; no result was ever fabricated to fill a gap.
- The output is concrete enough to write from. It caught patterns a human skim missed:
  "credit by full name and contribution, never an @-tag", "links go in the first comment,
  never inline", two of five authors open with a disclaimer and one never does — and it
  said which way the brand should lean and why.

## Anti-hallucination guardrails

The agents are told not to invent; the pipeline makes sure they cannot. Four layers,
all deterministic and replayable (no model judges another model):

1. **Bounded evidence.** An agent only ever sees the posts it is asked about, with their
   ids. It has no tools (the scout excepted) and no memory of other batches, so there is
   nothing to "remember" from elsewhere.
2. **Shape validation.** Every result is parsed against its zod schema; a malformed
   answer is retried, never patched.
3. **Grounding gate** (`lib/tov/grounding.ts`, the research-agent counterpart of the
   orchestrator's cite-or-abstain gate): every cited `postId` must be one of the input
   posts, every quote must be verbatim in that post (word-run overlap ≥ 75 %, so an
   honestly stitched or elided quote passes and a paraphrase fails), every hook example
   must exist in the corpus, and a brand exemplar must belong to the profile it is
   attributed to. Truncated ids are repaired only when they are the unambiguous prefix
   of one input post. Ungrounded items are dropped and reported
   (`grounding-report.json`, run summary); a result with **no** grounded exemplar is
   rejected and re-requested, and after the retries the run fails — it is never filled in.
   Cached results are judged again on read, so a resume can never replay an invented one.
4. **Facts stay in the corpus.** A document rule or a post written in someone's voice
   may reuse their patterns, but every personal or factual claim must trace to a post
   id or to our own work. Measured on the first full run: 92 % of batch-level citations
   were grounded before the gate existed; the rest (paraphrases, misattributed quotes,
   truncated ids) are now caught before synthesis.

5. **Citations resolve to stored rows.** With `--persist` the corpus is
   `agency_tov_posts` and the agents only ever read stored rows; every exemplar and
   hook example in a stored document version carries the post row id and URL it
   came from (`citations` on `agency_tov_document_versions`), and the research run
   records the exact `post_ids` it analysed. A reviewer — human or the QA 5.4 agent —
   can open the post behind every quote.

What the gate does *not* check yet: prose claims without a citation (e.g. "he never
hedges"). Those are covered by the QA step 5.4 in the process — a reviewer agent that
must cite a post id for every rule it confirms.

## Integration with `agency_operations` (architect's note, 2026-09-18)

`agency_tov` is an independent lane today: ingestion, agents, pipeline, CLI, tests,
feature-gated behind the orchestrator flags. It does not yet expose a stable public
DI/runtime contract or a durable artifact reference, so `agency_operations` must not
depend on it. The spine keeps its deterministic no-op worker as the proven seam; when
ToV exposes a request-scoped contract (run for case X → document version id + source
row ids), one thin optional bridge is added. Nothing is force-connected before that.

## How it plugs into the agency process

- **Input** comes from the client's channels in the brief / purchase data (P3 audit
  sources), widened by the scout when the client listed too little.
- **Output** is a `KLI-TOV` document version, linked to the current strategy proposal and
  the approved brief (F22-1 AC 1), presented to QA 5.4 as a pair with the strategy. A new
  version never inherits an approval.
- **Revision** (F22-1 AC 4): rerun the brand synthesis with the previous version and the
  change request as input; unaffected sections are kept, dependent changes are justified.
- **Stored** (`run --persist`): corpus rows, the research run and one immutable
  version per document, citations resolved to post rows — the durable artifact
  reference the architect asked for.
- **Not yet wired**: the case/work-item trigger in `agency_operations`. Today the entry point is the CLI
  (`yarn mercato agency_tov run …`), which is the same call without the case.
