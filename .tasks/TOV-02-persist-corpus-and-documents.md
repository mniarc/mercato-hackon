# TOV-02 — Persist the corpus and the documents; citations resolve to stored rows

State: active
Depends on: TOV-01
Owns: `ai-company/apps/mercato/src/modules/agency_tov/{data/entities.ts,lib/store.ts,migrations/**}`,
the `import` command and `--persist` flag in `agency_tov/cli.ts`
Context: The architect's condition for any bridge from `agency_operations` to the
ToV lane (2026-09-18) is a durable artifact reference: run for case X → document
version id + source row ids. Until now a run left files in `--out` and the grounding
gate checked citations against a JSON file.

## Deliver

- Entities (`data/entities.ts`), all tenant/organisation scoped, ids only, no ORM
  relations: `agency_tov_sources` (channel), `agency_tov_scrape_runs` (one import or
  scrape, with counts and reports), `agency_tov_posts` (corpus; `external_id` = the
  platform id agents cite, unique per source), `agency_tov_research_runs` (one
  pipeline execution: `post_ids`, stats, grounding report, `running → done | failed`),
  `agency_tov_documents` (`KLI-TOV` per brand, `TOV-PROFILE` per author,
  `current_version_id`), `agency_tov_document_versions` (immutable `body`,
  `rendered_md`, `citations[]`).
- `lib/store.ts`: `importCorpus` (idempotent on platform id), `loadCorpus` (stored
  rows → `TovPost[]`, pipeline order), `startResearchRun` / `finishResearchRun`,
  `saveDocumentVersion` (append-only, moves the current pointer), and the pure
  `citationsOf` — exemplars by cited id, hook examples by the same verbatim test the
  gate uses — plus `postRowToTovPost`.
- CLI: `agency_tov import --brand … --file …` stores an export without running agents;
  `agency_tov run … --persist` stores inputs, analyses the stored rows, writes the
  run and versions. Without `--persist` behaviour is unchanged (files only).
- Renderer links every citation to the post's own URL (also for file runs — the
  corpus already carries it); the feed link is the fallback without a corpus.
- Migration `Migration20260918201002_agency_tov.ts` + module snapshot.

## Done when
- `yarn workspace @open-mercato/app jest --config jest.config.cjs src/modules/agency_tov`
  passes (27 tests: + `store.test.ts`).
- `yarn generate`, `yarn workspace @open-mercato/app typecheck`, eslint on the module green.
- Locally (Docker Postgres, `mercato init`): `import` of the 2 513-post export →
  2 497 rows, 5 sources; `run --persist --runner direct` over the stored corpus
  reuses the `output/tov-full` cache (0 agent calls) and writes 1 `KLI-TOV` + 5
  `TOV-PROFILE` versions with citations; a second `import` adds 0 rows.

## Constraints
- Still an independent lane: no FK to `agency_operations`, no case id on any row.
  The bridge (TOV-03) adds an optional `case_ref` on the research run and a
  `tryResolve` contract, not before.
- Document bodies are not encrypted yet (public posts). Add the encryption map for
  `body` / `rendered_md` before client material lands in these tables.
- `post_ids` is a jsonb array on the research run rather than a junction table —
  2 500 uuids per run is fine for the hackathon; revisit if runs need "which runs
  used this post".

## Handoff
Changed files: `agency_tov/data/entities.ts` (new), `agency_tov/lib/store.ts` (new),
`agency_tov/migrations/**` (new), `agency_tov/__tests__/store.test.ts` (new),
`agency_tov/cli.ts`, `agency_tov/lib/tov/render.ts`, `agency_tov/data/validators.ts`,
`agency_tov/acl.ts` (+`agency_tov.documents.view`), README / HOW-IT-WORKS.
Next: TOV-03 — API routes (`/api/agency_tov/documents`, `/document-versions?id=`,
`/research-runs`) and a backend page listing versions with their citations, then the
optional bridge from an `agency_operations` case (run for case → version id).
