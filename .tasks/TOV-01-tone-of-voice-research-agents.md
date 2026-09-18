# TOV-01 — Build the tone-of-voice research agents (KLI-TOV from a scraped corpus)

State: active
Depends on: none
Owns: `ai-company/apps/mercato/src/modules/agency_tov/**`, the `agency_tov` line in `ai-company/apps/mercato/src/modules.ts`, the `ai-assistant` mapper line in `ai-company/apps/mercato/jest.config.cjs`
Context: Step 5.3 of the process (F22-1). The brand-language agent must build the
tone-of-voice document for whoever the client is, from posts scraped through Apify
(LinkedIn is one source; X, Facebook, Instagram, website/blog also work, and an empty
source must not kill the run), reading the corpus in batches so no model call ever
sees the whole thing. The module is also the reference layout for the next agent
modules (see its README).

## Deliver
- Agent Orchestrator agents (`defineAgent`, researcher, `research` results):
  `agency_tov.source_scout` (web search/fetch: where do these people publish),
  `agency_tov.batch_analyst` (map: ~40 posts of one author → observations),
  `agency_tov.profile_synthesizer` (reduce per author), `agency_tov.brand_synthesizer`
  (reduce per brand → KLI-TOV with F22-1 AC 2 fields: tone, personality, vocabulary,
  formality, addressing, emotions, boundaries, recommended / not-recommended examples).
- Code-owned pipeline (`lib/tov/pipeline.ts`): batching by count + chars, parallel
  map, ordered reduce, zod re-validation of every result, resume cache.
- Ingestion (`lib/corpus/`): Apify client, per-source adapters (LinkedIn pinned to the
  real export shape; others best-effort), a source that yields nothing is a report.
- CLI `yarn mercato agency_tov run --brand … --out … [--file] [--scrape] [--discover]`
  with `--runner orchestrator|direct`; writes `KLI-TOV.md`, `brand.json`,
  per-author profiles, corpus, scrape/discovery reports.

## Done when
- `yarn workspace @open-mercato/app jest --config jest.config.cjs src/modules/agency_tov` passes (15 tests).
- `yarn generate && yarn workspace @open-mercato/app typecheck` pass with
  `OM_ENABLE_ENTERPRISE_MODULES=true` + `OM_ENABLE_ENTERPRISE_MODULES_AGENTS=true` in `apps/mercato/.env`.
- A live run over the 2 513-post Open Mercato LinkedIn export produces `KLI-TOV.md`.
  DONE 2026-09-18 with the direct runner (2 497 posts, 83 calls, 23 min, ~5 USD);
  the orchestrator-runner path (runs visible in Backend → Agents) still needs
  Postgres/Redis + migrations + the enterprise flags on a box.

## Constraints
- Enterprise Agent Orchestrator ENABLED for this module (team decision 2026-09-18;
  T01 keeps it disabled for the spine — the two flags gate `agency_tov` so the spine
  is unaffected when they are off). Licence: evaluation use; confirm with organisers.
- Agents never write and never fetch the corpus themselves; Apify runs in code.
- Nothing fabricated on failure: empty sources / schema misses surface as reports.

## Handoff
Changed files: `ai-company/apps/mercato/src/modules/agency_tov/**` (new),
`ai-company/apps/mercato/src/modules.ts` (+1 module in the enterprise-agents block),
`ai-company/apps/mercato/jest.config.cjs` (+ai-assistant source mapper).
Verification: unit tests, typecheck and eslint green on the `main`-based copy; ported
to this tree unchanged (SDK identical to `develop@83330e27`). Live run pending an
API key. Assumption: non-LinkedIn Apify actor ids/field maps are unverified defaults,
overridable via `OM_AGENCY_TOV_APIFY_ACTOR_<SOURCE>`.
Grounding gate added (`lib/tov/grounding.ts`): cite-or-abstain on every result and
cache read; audit of the first full run: 92% of batch citations grounded, rest dropped.
Next (agreed 2026-09-18): TOV-02 — persist corpus and outputs in module entities
(`agency_tov_sources`, `_scrape_runs`, `_research_runs`, `_documents`/`_versions`) so
citations resolve to stored source rows; that is the durable artifact reference the
architect asked for before any bridge to `agency_operations` (no force-connect).
