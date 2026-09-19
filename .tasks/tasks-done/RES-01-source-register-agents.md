# RES-01 — F06: audit tasks and the source register (3.1–3.2)

State: done (bounded F06 research module; agency process integration remains T26)
Sources: F06-1, F06-2, F06-3
Depends on: TOV-02 (the agent-module template and the persistence pattern)
Owns: `ai-company/apps/mercato/src/modules/agency_research/**`, the `agency_research` line in
`ai-company/apps/mercato/src/modules.ts`
Context: First of four research boxes (F06 sources → F07 audit + competitors → F08 findings map +
QA/escalation + freeze → F09 brief). Contracts are Rafał's template package v1.1 (WZR-ZRODLA,
COMMON-ENVELOPE, STD-LIMITY); the runner is the Enterprise Agent Orchestrator; spending is
capped per run because the OpenRouter key is the client's.

## Deliver

- Module `agency_research` built from the ToV template: five 3.2 agents (`page_extractor`
  map; `proof_builder`, `content_seeder`, `conflict_finder`, `coverage_assessor` reduce) +
  `research_qa` registered for 3.7; all tool-less researchers with section-sized outputs.
- Code-owned pipeline: Firecrawl fetch behind the platform SSRF guard (≤ 10 site pages,
  social profile from the stored LinkedIn corpus, 2 attempts/URL, every attempt a row),
  ids minted in page order, canonical/material grouping, verbatim gate, variant rules,
  plan-capacity arithmetic, envelope with field evidence, immutable versions.
- Spend ledger: check before every attempt, cost from `agent_runs.cost_minor`, PLN cap
  (default 20, warn 10, `--yes` above 10), loop caps from STD-LIMITY.
- Tables `agency_research_{documents,document_versions,sources,task_runs}` + migration.
- DI service `agencyResearchService` (`run`/`status`) shaped like `agencyTovResearchService`;
  input = the portal's `toOrderData()` payload.
- CLI `agency_research run|status`; FLOW fixture (synthetic pages + canned outputs, zero
  spend) and 19 unit tests.

## Done when
- `yarn workspace @open-mercato/app jest --config jest.config.cjs src/modules/agency_research`
  passes (19 tests). `yarn generate`, typecheck, eslint green. DONE 2026-09-19.
- Fixture run through the real CLI + database: 2 versions, 6 sources, 2 task runs, 0 PLN.
  DONE 2026-09-19.
- Live run on Open Mercato through the orchestrator: 12 pages, 16 agent runs, 71 facts
  (96 % verbatim), 6 proof cards, 31 samples, 12 seeds (5 ready), 2.26 PLN, 5 min 47 s.
  DONE 2026-09-19 (order `demo-open-mercato-1`, local Postgres).

## Constraints
- Independent lane (ADR-001): no imports from `agency_tov` or `agency_operations`; the
  matcher and concurrency helpers are copies noted as such.
- Document bodies are not encrypted yet (public sources); add the encryption map before
  client material lands in these tables.
- `OM_AGENT_MODEL_PRICING` must list the OpenRouter model ids (`anthropic/claude-haiku-4.5`,
  `anthropic/claude-sonnet-5`) or the platform records no cost; the ledger then estimates.

## Handoff
Task state reconciled with the three dated completed checks in Done when; this is the
teammate's recorded module proof, not a new rerun or full F06 story acceptance.
Changed files: the module (new), `apps/mercato/src/modules.ts` (+1 line).
Known behaviour to watch: the orchestrator logs "Agent requested a tool loop but no tools
resolved; falling back to a single-shot generateObject" per call (cosmetic; agents declare
no tools). The conflict finder was generous on the live run (12 conflicts over 71 facts) —
tune the prompt or cap in F08 when QA reads them.
Next: RES-02 (F07) — `WEW-AUDYT` (3.3) and `WEW-KONKURENCJA` (3.4/3.5) with competitor
discovery through Firecrawl search.
