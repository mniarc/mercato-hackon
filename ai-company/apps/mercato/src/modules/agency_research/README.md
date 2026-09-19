# `agency_research` — the agency process agents (P3 → P9)

The production side of the AI agency: process steps 3.1–3.8 (sources, communication
audit, competitors, findings map, QA, freeze), 4.1–4.2 (brief, brief QA), 5.2–5.4
(strategy, tone of voice, Q-S), 6.2–6.7 (plan, Q-P, selection, post instruction),
7.2–7.3 (post, Q-T editor), 8.2–8.7 (publication documents — nothing is sent) and
9.1–9.3 (package, closure gate), built as an instance of the
[`agency_tov` agent-module template](../agency_tov/README.md) on Rafał's document
contracts v1.1 (`WZR-*` templates, COMMON-ENVELOPE, STD-PROCES gates, STD-LIMITY).

## The pattern

```
 order (WEW-DANE-ZAMOWIENIA, the portal's payload)
   │ 3.1 pinned as a document version
   ▼
 fetch in code ─▶ sources rows (every attempt, incl. unavailable) ─▶ page_extractor × page  (map, cheap model)
   Firecrawl / files                                                    │ verbatim quotes, local refs
                                                                        ▼
                                              ids minted in page order (F01…, L01…, A01…)
                                                                        │
              proof_builder · content_seeder · conflict_finder · coverage_assessor  (reduce, over ids — never page text)
                                                                        │
                       gate: verbatim / id resolution / variant rules / limits / capacity arithmetic
                                                                        ▼
                    WEW-ZRODLA version (envelope + data + issues + citations) — immutable
```

- **Agents are researchers with no tools.** `defineAgent({ agentType: 'researcher', result: { kind: 'research', schema } })`
  from the Agent Orchestrator SDK. Each reads one bounded input and returns one *section*
  of a document (≤ 4 arrays, `local_ref`s instead of ids) — never the document, never the
  envelope. That keeps provider-side structured output reliable.
- **The Enterprise Agent Orchestrator is the runner.** Every call is a persisted
  `agent_runs` row (admission gate, provider budget, guardrails, traces, Backend → Agents).
  Models are pinned per agent tier: extraction and QA on Haiku 4.5, syntheses on Sonnet 5
  (`OM_AGENCY_RESEARCH_MODEL_{EXTRACT,SYNTHESIS,QA}` override; the platform factory still
  honours `OM_AI_AGENCY_RESEARCH_MODEL`). `--runner direct` exists for prompt iteration
  only; `--runner fixture` for tests and demos without spend.
- **The process lives in code** (`lib/research/pipeline.ts`): fetching, chunking, batching,
  id minting, canonical/material grouping, reuse-of-evidence, plan capacity, envelope,
  field evidence, retries, cache. A model never computes an id, a count or a date.
- **Cite or abstain** (`lib/research/gate.ts`): every fact and sample quote must be verbatim
  in the stored page (shingle match ≥ 75 %); every cited id must exist in the pinned inputs;
  proof cards obey the variant rules (a declaration never carries a result; a measured case
  needs action + result + case evidence); text addressed to the model is kept out of the
  bank. Dropped items become `issues` on the document; a page with nothing verbatim is
  re-requested (≤ 2) and then the run fails — it is never filled in. Cached results are
  judged again on read.
- **Nothing fabricated on a gap.** Missing data is an explicit issue with an owner
  (`klient` / `research` / `agencja`), never model knowledge: `NO_RESULT_CASE`,
  `LIMITED_LANGUAGE_SAMPLE`, `PLAN_CAPACITY_SHORT`, `SOURCE_UNAVAILABLE`.

## Spend control (the OpenRouter key is the client's)

`lib/research/ledger.ts` — before **every** attempt (technical retry, gate re-request,
QA repair) the ledger checks that the estimate fits the cap; a run that would exceed it
stops with task run `paused_budget`, never mid-call. Cost per call is read back from the
orchestrator's `agent_runs.cost_minor` (priced by `OM_AGENT_MODEL_PRICING`) and converted
with `OM_AGENCY_RESEARCH_USD_PLN` (default 3.70); the platform prices in whole cents, so
the local estimate is used whenever it is the larger number. Defaults: cap
`OM_AGENCY_RESEARCH_MAX_COST_PLN` = 20 PLN per run, warning at 10; an estimate above 10 PLN
needs `--yes`; STD-LIMITY's 50 / 100 PLN are the order-level ceilings in
`data/templates.ts`. Hard loop caps: 2 technical attempts, 2 QA repairs, 2 grounding
retries, 2 fetch attempts per URL. Every task run stores its ledger; `status` sums per order.
Unit tests never spend (fixture runner).

Measured on Open Mercato (2026-09-19, orchestrator runner, Haiku 4.5 / Sonnet 5). 3.2 alone: 12 pages → 16 agent
runs, 71 facts (96 % of quotes verbatim on first pass), 6 proof cards, 31 language samples, 12 seeds, **2.26 PLN, 5 min 47 s**.
The whole chain 3.1 → 9.3 completed live the same night (order `demo-open-mercato-3`): the final pass cost **7.02 PLN**
(3.7 ready → freeze → brief → Q-S ready after one repair → plan Q-P draft after two → simulated selection → instruction
→ post → editor pass_for_draft on the first pass → publication blocked at preflight → package with `close_allowed: false`;
note that a strategy or plan still `to_fix` after its repairs continues in simulation, so `--through 9.3` still pays for the post),
16 documents, 23 versions in that pass. The night as a whole cost ≈ 114 PLN (268 orchestrator runs, 5.5 M input / 1.3 M
output tokens): most of it went to regenerations across reruns before the inputs were made cache-stable (page cache, stored
competitor selection, no previous-version input on plain reruns, day-precision dates, no fetch timestamps in QA inputs) and
to QA loops that treated the client's gaps as agent faults before the reclassification rules. A rerun now replays every
unchanged step at 0 PLN: the next full pass through 9.3 cost **1.33 PLN** (four agent runs).

## Environment

```
FIRECRAWL_API_KEY=…                      # page fetching (scrape → markdown), behind the platform SSRF guard
OPENROUTER_API_KEY=…                     # the models, through the orchestrator's provider
OM_AGENT_MODEL_PRICING={"anthropic/claude-haiku-4.5":{"inputPer1M":1,"outputPer1M":5},"anthropic/claude-sonnet-5":{"inputPer1M":3,"outputPer1M":15}}
OM_AGENCY_RESEARCH_USD_PLN=3.7
OM_AGENCY_RESEARCH_MAX_COST_PLN=20
OM_AGENCY_RESEARCH_MODEL_EXTRACT=openrouter/anthropic/claude-haiku-4.5      # SET THESE: since main merged the shared default, an unset tier falls back to the team OM_AI_MODEL (gpt-5-mini),
OM_AGENCY_RESEARCH_MODEL_SYNTHESIS=openrouter/anthropic/claude-sonnet-5     # which is unpriced for the ledger (estimate 0) and changes every cache key
OM_AGENCY_RESEARCH_MODEL_QA=openrouter/anthropic/claude-haiku-4.5
OM_AGENCY_RESEARCH_PUBLICATION_CONNECTION_REF=   # optional 8.2: a reference into the integrations store, never a secret; does not make the config ready
OM_AGENT_RUN_TIMEOUT_MS=600000                   # orchestrator wall clock per agent run (default 300000); a synthesis over a full register can take longer
APIFY_TOKEN=…                                    # 3.2a: reads the spokespeople's own LinkedIn/X/Facebook/Instagram posts through the ToV lane's scraper seam; unset = channels listed, not read
```

`OM_ENABLE_ENTERPRISE_MODULES=true` and `OM_ENABLE_ENTERPRISE_MODULES_AGENTS=true` gate the
module, as for `agency_tov`.

## Running it

```bash
# live: the portal's order payload (or Rafał's ZAMOWIENIE.json) + the stored LinkedIn corpus as the social profile
yarn mercato agency_research run --order output/research/open-mercato/order.json --order-ref demo-open-mercato-1 \
  --out output/research/open-mercato --social-corpus output/research/open-mercato/social.json --max-cost-pln 10 --yes

# no network, no spend: the FLOW fixture through the real pipeline and database
yarn mercato agency_research run --order src/modules/agency_research/__fixtures__/flow/order.json --order-ref flow-1 \
  --out output/research/flow --runner fixture --fixture src/modules/agency_research/__fixtures__/flow/canned \
  --fixture-pages src/modules/agency_research/__fixtures__/flow --fixture-search src/modules/agency_research/__fixtures__/flow/search.json \
  --social-corpus src/modules/agency_research/__fixtures__/flow/social.json --people "Rafał Muda, osoba kontaktowa zamówienia"
# --people "Name, role, https://…; Name2" = the spokespeople the client named on the order (the portal form passes them itself);
# the fixture needs it: its canned people_finder names Rafał Muda, the gate keeps a person only when a page quotes them or the client named them

yarn mercato agency_research status --order-ref demo-open-mercato-1
```

Options: `--pages url,url` replaces site discovery (≤ 10 same-host pages ranked home / about /
offer / cases / contact / blog); `--dry-run` prints the plan and the estimate and stops;
`--runner direct` (OpenRouter directly, prompt iteration); `--tenant --org --user`.
Outputs in `--out`: `documents/<OUTPUT>.v<N>.{json,md,client.md}` — one file set per stored version, written once and
never overwritten (Marcin's rule: every output keeps its versions) — plus `events.<timestamp>.json` per run and `cache/`.

## What is stored (`data/entities.ts`, `lib/store.ts`)

| table | one row per | notes |
|---|---|---|
| `agency_research_documents` | (order, template) | `WZR-ZAMOWIENIE`, `WZR-ZRODLA`, … ; `current_version_id` is the only "current" |
| `agency_research_document_versions` | version | immutable; the COMMON-ENVELOPE columns (`input_versions`, `field_evidence`, `issues`, …) + `data` + `rendered_md` |
| `agency_research_sources` | fetch attempt / stored material | `source_id` = the S-xx the facts cite; `content_md` is what every quote is checked against |
| `agency_research_task_runs` | step execution | status, pinned inputs, output version, `agent_run_ids`, `cost` ledger, O-3.2 profile in `summary` |

## The seam for the spine and the portal

`lib/contracts/agencyResearch.ts` + `di.ts`: resolve `agencyResearchService` from the
container (never import internals) and call
`run({ context: { tenantId, organizationId, userId, workflowInstanceId?, stepId?, invocationId? }, request: { orderRef, order, through, socialPosts?, pages?, maxCostPln? } })`
→ `{ taskRunIds, documentVersionIds, agentRunIds, spentPln, completedThrough }`; `status(scope, orderRef)`.
The `order` is exactly what the customer portal's order form emits (`agency/…/order/page.tsx`
`toOrderData()`). The identity is a trusted server execution identity, checked against
`agency_research.manage` + `agent_orchestrator.agents.run`.

## The whole P3 → P9 chain

| step | document | agents | gate highlights |
|---|---|---|---|
| 3.2a | `WEW-ZRODLA.people` | people_finder, channel_selector (+ web search, Apify profile scrape, Firecrawl fetch) | a person exists only with a verbatim quote from a client page or the client naming them; every channel/mention URL must be a search hit; ≤4 people, 3 queries, 5 hits, 8 posts, 2 pages each |
| 3.2 | `WEW-ZRODLA` | page_extractor (map), proof_builder, content_seeder, conflict_finder, coverage_assessor | verbatim quotes, proof-card variants, plan capacity computed; a person's own post or interview extracts as that person's voice |
| 3.3 | `WEW-AUDYT` | audit_mapper, audit_voice, audit_gaps_assets | no evidence without customer voice, no conversion judgement without data, gaps 3–5 |
| 3.4–3.5 | `WEW-KONKURENCJA` v1/v2 + `WEW-ZRODLA` v2 | competitor_selector, page_extractor (entity = competitor), competitor_card, competitor_channels, competitor_synthesizer | ≤3 companies from real search hits, `unknown` where nothing was read, claim strength ≤ proof, "jedyni" needs a named unknown |
| 3.6 | `WEW-USTALENIA` | field_mapper, question_writer, readiness_assessor | future vision never a fact, ≤8 questions, five readiness outputs |
| 3.7 | — (task run + `qa_result`) | research_qa + validator | exactly ready / to_fix / exception; ≤2 repairs through the author steps, then E.1 |
| E.1 | `WEW-ESKALACJA` | — | observed reason, evidence, unassigned queue, hold, one question, allowed resolutions |
| 3.8 | — (frozen set on the task run) | — | idempotent per set hash; only `status` changes |
| 4.1 | `KLI-BRIEF` | brief_writer.{offer_audience_direction, promise_voice, channel_success_assets} | decision states from the map, two equal voice variants, rights copied from proof cards, CTA without owner blocks publication |
| 4.2 | — (task run + `qa_result`) | brief_qa + validator | ready_for_approval / needs_client_data / needs_agent_fix; agent errors repaired ≤2, client gaps become the questions |
| 5.2 | `KLI-STRATEGIA` | strategy_writer.{choice_tension_uvp, proof_messages, pillars_channel_boundaries} | CL/PL ids minted in code, support level capped by the cited proof cards (no auto promotion), uniqueness never from a competitor's silence, "everyone else" alternative rejected |
| 5.3 | `KLI-TOV` | tov_writer (2 section calls) | 4 principles, 5 axes, 5 evidence-language types, 3 before/after pairs grounded only when facts resolve, 6–8 copy checks |
| 5.4 | — (task run + `qa_result`) | strategy_qa + validator | Q-S on the pair: ready_for_approval / needs_agent_fix; repairs ≤2 through 5.2/5.3, then E.1 |
| 6.2 | `KLI-PLAN` | plan_writer.topics (2 calls), plan_writer.balance_recommendation | TOP ids by day, 12 distinct topics (word-set similarity < 0.6), pillar balance, every id resolves |
| 6.3 | — (task run + `qa_result`) | plan_qa + validator | Q-P: exactly 12 `ready` topics before the plan may be approved; repairs ≤2 |
| 6.5 | `KLI-PLAN` (new version) | — | `--topic TOPxx` = client selection; otherwise the recommendation as `simulated_selection`, `real_approval: false` |
| 6.7 | `WEW-ZLECENIE-POSTU` | — (code only) | evidence cards carry the texts, rights copied from proof cards, ≤5 voice rules, adapter limits from `data/adapters.ts`, 7 completion lines |
| 7.2 | `KLI-POST` | post_author (isolated: instruction + ToV only; `deslop` write mode under the profile, `qa.style_hygiene` reports it) | fragments verbatim in the text, links only from the instruction, numbers only from evidence, prohibited claims, metrics in code |
| 7.3 | `KLI-POST` (new version per pass) | post_editor + validator (`lib/research/deslop.ts`: catalogue phrases and budgets as `slop_pattern` findings, minor/major, never blocking alone) | Q-T: pass_for_draft / needs_fix / reject; repairs ≤2, then E.1 `qa_exhausted` |
| 8.2 | `WEW-KONFIG-PUBLIKACJI` | — | platform from the adapter catalog, ids null (a name is not an id), connection never a secret, readiness `not_ready` with blockers |
| 8.3 | `WEW-ZLECENIE-PUBLIKACJI` | — | content hash, idempotency key, content approval ≠ publication consent (both `missing` without real records), nine preflight gates, hold from open E.1 |
| 8.7 | `WEW-POTWIERDZENIE-PUBLIKACJI` | — | always `not_executed` here; external id / URL null; `retry_allowed: false`; where an adapter would plug in: `lib/research/publication.ts` |
| 9.1 | `KLI-PAKIET` | — | manifest over current versions, 3–5 audit takeaways from gaps + implications, limitations, completion check |
| 9.3 | — (task run + `qa_result`) | — | deterministic closure gate: payment, completion, publication, delivery, no blockers → `close_allowed` |

**Simulation.** No client approval exists in this lane, so every consumer of an unapproved `KLI-*` document
saves its output with `simulation_flag: true` and a `SIMULATED_INPUT` issue (`lib/research/simulation.ts`); a
synthetic approval is never recorded as a decision, publication consent stays `missing`, and the package's
`close_allowed` is false until the spine records real approvals, a confirmed publication and a delivery.

`run --through 3.2 | 3.5 | 3.8 | 4.2 | 5.4 | 6.7 | 7.3 | 8.7 | 9.3 [--topic TOP03]`; `status`, `escalations`.
Expected live cost beyond 4.2: ≈ 9 Sonnet + 3 Haiku calls (P5–P7) plus repairs; P6.7, P8 and P9 are code only. API: `GET /api/agency_research/documents`,
`document-versions`, `task-runs` (staff, `agency_research.documents.view`) and the portal route
`GET /api/agency_research/portal/brief?order_ref=` (customer JWT; returns only the client view and the ≤8
questions — the surface Krysia's portal renders; ownership hook `assertCustomerOwnsOrder` is a TODO until orders
are persisted) and `GET /api/agency_research/portal/documents?order_ref=[&output=KLI-STRATEGIA|KLI-TOV|KLI-PLAN|KLI-POST|KLI-PAKIET]`
(the list of the order's client documents with status / version / `simulation`, or one document's client view). The service exposes `getClientView(scope, orderRef, templateId)` for `WZR-BRIEF`, `WZR-STRATEGIA`, `WZR-TOV`,
`WZR-PLAN`, `WZR-POST` and `WZR-PAKIET` (questions only for the brief).

One-page map of the whole chain, the agents and what is stored: [`WORKFLOW.md`](./WORKFLOW.md).

Everything the process needs from the client (4.3–4.7 approvals, G requests) stays with the spine; this lane hands
over `(task_run_id, version_id)` references and the client projections.
