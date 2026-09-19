# `agency_research` — audit and research agents (P3 → P4)

The audit department of the AI agency: process steps 3.1–3.8 (sources, communication
audit, competitors, findings map, QA, freeze) and 4.1–4.2 (brief, brief QA), built as
an instance of the [`agency_tov` agent-module template](../agency_tov/README.md) on
Rafał's document contracts v1.1 (`WZR-*` templates, COMMON-ENVELOPE).

**Phase F06 (this version): step 3.2 — the source register `WEW-ZRODLA`.**

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

Measured on Open Mercato (2026-09-19, orchestrator runner): 12 pages → 16 agent runs,
71 facts (96 % of quotes verbatim on first pass), 6 proof cards, 31 language samples,
12 seeds, **2.26 PLN, 5 min 47 s**.

## Environment

```
FIRECRAWL_API_KEY=…                      # page fetching (scrape → markdown), behind the platform SSRF guard
OPENROUTER_API_KEY=…                     # the models, through the orchestrator's provider
OM_AGENT_MODEL_PRICING={"anthropic/claude-haiku-4.5":{"inputPer1M":1,"outputPer1M":5},"anthropic/claude-sonnet-5":{"inputPer1M":3,"outputPer1M":15}}
OM_AGENCY_RESEARCH_USD_PLN=3.7
OM_AGENCY_RESEARCH_MAX_COST_PLN=20
OM_AGENCY_RESEARCH_MODEL_EXTRACT=openrouter/anthropic/claude-haiku-4.5      # optional overrides
OM_AGENCY_RESEARCH_MODEL_SYNTHESIS=openrouter/anthropic/claude-sonnet-5
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
  --fixture-pages src/modules/agency_research/__fixtures__/flow --social-corpus src/modules/agency_research/__fixtures__/flow/social.json

yarn mercato agency_research status --order-ref demo-open-mercato-1
```

Options: `--pages url,url` replaces site discovery (≤ 10 same-host pages ranked home / about /
offer / cases / contact / blog); `--dry-run` prints the plan and the estimate and stops;
`--runner direct` (OpenRouter directly, prompt iteration); `--tenant --org --user`.
Outputs in `--out`: `WEW-ZRODLA.{json,md}`, `events.json`, `cache/`.

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

## Next phases

F07 — 3.3 audit (`WEW-AUDYT`) and 3.4/3.5 competitors (`WEW-KONKURENCJA`, Firecrawl search,
≤ 3 companies × ≤ 4 pages); F08 — 3.6 findings map, 3.7 QA + repair loop + E.1 escalation
(`WEW-ESKALACJA`), 3.8 freeze; F09 — 4.1 brief (`KLI-BRIEF`), 4.2 brief QA, API routes and
the portal brief route. Task files: `.tasks/RES-01…`.
