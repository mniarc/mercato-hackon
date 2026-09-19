# The agency workflow, end to end — what runs, who does it, what comes out

State on 2026-09-19 (branch `feat/agency-research`, PR #6). This is the one-page map of the whole
production process P3 → P9 as implemented in `agency_research`, plus the `agency_tov` corpus lane it
sits next to. For code layout and run commands see `README.md`; for the process definition see
Rafał's package v1.1 (`WZR-*` contracts, STD-PROCES, STD-LIMITY).

## Agents (36 in total: 4 + 32)

| lane | agent id | role | model tier |
|---|---|---|---|
| agency_tov | `agency_tov.source_scout` | finds and bounds the public corpus | extract |
| agency_tov | `agency_tov.batch_analyst` | reads one batch of posts, returns observations with verbatim quotes | extract |
| agency_tov | `agency_tov.profile_synthesizer` | one profile's voice from its batches | synthesis |
| agency_tov | `agency_tov.brand_synthesizer` | KLI-TOV corpus profile across profiles | synthesis |
| 3.2a | `agency_research.people_finder` | who speaks for the brand: names the client's pages introduce with a role (verbatim quote per person) | extract |
| 3.2a | `agency_research.channel_selector` | per person: which search hits are their own channels, which are interviews/podcasts/press about them | extract |
| 3.2 | `agency_research.page_extractor` | one page → facts, language samples, audience signals (verbatim quotes); a person's page → that person's voice | extract |
| 3.2 | `agency_research.proof_builder` | proof cards over the fact bank + business profile | synthesis |
| 3.2 | `agency_research.content_seeder` | 12 content seeds (plan capacity) | synthesis |
| 3.2 | `agency_research.conflict_finder` | contradictions between facts | extract |
| 3.2 | `agency_research.coverage_assessor` | the nine coverage requirements | extract |
| 3.3 | `agency_research.audit_mapper` | offer / buyer / message maps, journey, relationship | synthesis |
| 3.3 | `agency_research.audit_voice` · `.audit_gaps_assets` | voice audit; gaps + reusable assets | synthesis |
| 3.4 | `agency_research.competitor_selector` | ≤3 competitors from real search hits | extract |
| 3.4 | `agency_research.competitor_card` · `.competitor_channels` | one competitor's card and channels | synthesis |
| 3.5 | `agency_research.competitor_synthesizer` | parity, alternative routes, difference candidates, implications | synthesis |
| 3.6 | `agency_research.field_mapper` · `.question_writer` · `.readiness_assessor` | findings map, ≤8 questions, readiness | synthesis / synthesis / extract |
| 3.7 | `agency_research.research_qa` | analysis QA over the four WEW-* documents | qa |
| 4.1 | `agency_research.brief_writer.{offer_audience_direction, promise_voice, channel_success_assets}` | KLI-BRIEF, one section each | synthesis |
| 4.2 | `agency_research.brief_qa` | brief QA | qa |
| 5.2 | `agency_research.strategy_writer.{choice_tension_uvp, proof_messages, pillars_channel_boundaries}` | KLI-STRATEGIA, one section each | synthesis |
| 5.3 | `agency_research.tov_writer` (2 section calls) | KLI-TOV process document | synthesis |
| 5.4 | `agency_research.strategy_qa` | Q-S on the strategy + ToV pair | qa |
| 6.2 | `agency_research.plan_writer.topics` · `.balance_recommendation` | KLI-PLAN: 12 topics in two windows; balance + recommendation | synthesis |
| 6.3 | `agency_research.plan_qa` | Q-P | qa |
| 7.2 | `agency_research.post_author` | the post, isolated: sees only the instruction and the ToV; writes under the ToV with the `deslop` skill as the hygiene layer | synthesis |
| 7.3 | `agency_research.post_editor` | Q-T, independent of the author; runs `deslop` in detect mode over the validator's `slop_pattern` hits | qa |

Tiers: extract/qa = `openrouter/anthropic/claude-haiku-4.5`, synthesis = `openrouter/anthropic/claude-sonnet-5`
(env-overridable). Every agent is a tool-less `defineAgent` researcher run through the Enterprise Agent
Orchestrator (`agentRuntime.run`), so every call is a persisted `agent_runs` row with tokens and cost,
visible in Backend → Agents. Steps 6.5, 6.7, 8.x, 9.x have no agents: they are code.

## The chain (one CLI run = one order, stops at `--through`)

```
3.1 activate ─ order pinned as WEW-DANE-ZAMOWIENIA v1
3.2 sources ─ fetch ≤10 site pages + 8 social items (Firecrawl, SSRF-guarded)
3.2a people ─ people_finder over the client pages (+ the order's spokespeople) → ≤4 people × 3 web searches
              → channel_selector picks own channels + third-party mentions → own posts scraped (Apify seam, ≤8 each),
              interviews/podcast pages fetched (≤2 each) → extra sources, publisher = the person → WEW-ZRODLA
3.3 audit ─┬─ WEW-AUDYT
3.4 competitors ─┘ search → ≤3 companies × ≤4 pages → WEW-KONKURENCJA v1 + WEW-ZRODLA v2
3.5 comparison ─ WEW-KONKURENCJA v2
3.6 findings map ─ WEW-USTALENIA (field map for the brief, ≤8 questions, evidence requests)
3.7 analysis QA ─ validator + research_qa → ready | to_fix (≤2 repairs through the author step) | E.1
3.8 freeze ─ the pinned set (idempotent per hash)                          ── gate Q-R / Q-FREEZE
4.1 brief ─ KLI-BRIEF (client view ≤700 words)
4.2 brief QA ─ ready_for_approval | needs_client_data (→ questions) | needs_agent_fix (≤2 → 4.1)
        ┆ client approval 4.3–4.7 belongs to the spine / portal — not here
5.2 strategy ─ KLI-STRATEGIA (client view ≤1100)      5.3 tone of voice ─ KLI-TOV (≤750)
5.4 Q-S ─ validator + strategy_qa on the pair; repairs ≤2; then E.1
6.2 plan ─ KLI-PLAN, 12 topics / 30 days             6.3 Q-P ─ exactly 12 ready topics
6.5 selection ─ `--topic TOPxx` = client's choice, else the recommendation as simulated_selection
6.7 post instruction ─ WEW-ZLECENIE-POSTU (code: evidence texts, rights, ≤5 voice rules, adapter limits)
7.2 post ─ KLI-POST by the isolated author           7.3 Q-T ─ post_editor; repairs ≤2; then E.1
8.2 publication config ─ WEW-KONFIG-PUBLIKACJI (adapter catalog, ids null, never a secret)
8.3 publication order ─ WEW-ZLECENIE-PUBLIKACJI (content hash, approval ≠ consent, 9 preflight gates)
8.7 confirmation ─ WEW-POTWIERDZENIE-PUBLIKACJI, outcome not_executed — NOTHING IS SENT
9.1 package ─ KLI-PAKIET (manifest of approved versions, 3–5 audit takeaways, limitations)
9.3 closure gate ─ close_allowed only with payment + completion + confirmed publication + delivery
E.1 escalation ─ WEW-ESKALACJA whenever QA is exhausted or the budget pauses (unassigned staff queue)
```

Budget: every call is estimated and checked against the per-run cap (`--max-cost-pln`, default 20 PLN,
warn at 10, `--yes` above 10) *before* it is made; reruns replay identical calls from the cache at 0 PLN.

## What is stored, and the rule that nothing is overwritten

- Every document is a row in `agency_research_documents` (order × template) with **immutable versions** in
  `agency_research_document_versions`: a rerun, a QA repair or an editor pass always appends `v(n+1)`
  with its own pinned `input_versions`, `field_evidence`, `issues`, `simulation_flag`, rendered markdown and
  client view. Nothing is edited in place; `current_version_id` only moves forward.
- Every step execution is a row in `agency_research_task_runs` (status, attempt, pinned inputs, output
  version, `agent_run_ids`, cost ledger, QA result).
- Every fetched page is a row in `agency_research_sources` with the markdown every quote is checked against.
- The CLI's `--out` folder mirrors this: `documents/<OUTPUT>.v<N>.{json,md,client.md}` — a file for a version is
  written once and never touched again; each run adds an `events.<timestamp>.json`.
- Simulation: whenever a step consumes a client document that is not `approved`, its output carries
  `simulation_flag: true` and a `SIMULATED_INPUT` issue; a synthetic approval is never recorded as a decision.

## Readiness

| | state |
|---|---|
| Unit tests | 298 (36 suites, incl. the spine's acceptance/execution suites), fixture runner, zero spend |
| FLOW fixture through CLI + Postgres, `--through 9.3` (with `--fixture-search`) | green: 34 versions in ~2 s, 0 PLN, E.1 opened where the canned QA cannot pass, publication blocked at preflight, `close_allowed: false` |
| Live on Open Mercato | **done end to end** (2026-09-19 06:50): 3.7 ready, brief QA needs_client_data (the 8 questions), Q-S ready_for_approval, Q-P draft (10/12 topics ready), post written and editor-approved on the first pass, publication documents blocked at preflight, package `close_allowed: false`; final pass 7.02 PLN, the whole night ≈ 114 PLN incl. reruns |
| Demo | the live Open Mercato versions are the pre-run documents (D-00); Paweł's spine reads them through `agencyResearchService` (brief/strategy/plan/post review + acceptance) and Krysia's portal through `/api/agency_research/portal/{brief,documents}`; approvals, selection and publication consent stay real client actions there |

What a demo can show today: the full chain on the fixture (every document, every gate, the escalation, the
blocked publication and the closure gate) and, once the live run completes, the same for Open Mercato with
real facts, real quotes and the ledger per step. What it cannot show: a real client approval, a real
publication, a real delivery — by design, none of those are simulated as successes.
