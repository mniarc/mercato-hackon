# RES-03 — P5–P9: strategy + ToV, plan + post instruction, post + editor, publication documents, package + closure

State: done (bounded P5-P9 producer lane merged and re-proven; customer receipts,
external send and delivery remain outside this task's stated simulated scope)
Sources: F21, F22, F23, F26, F27, F28, F29, F30, F31, F33, F34, F35, F36, F37, F38, F39
Depends on: RES-02
Owns: `ai-company/apps/mercato/src/modules/agency_research/**`
Context: The rest of the STD-PROCES chain after the brief, built overnight (2026-09-19) by five parallel builders on
disjoint paths from the same per-phase layout (agents / ids / steps / renders per phase, Rafał's v1.1 contracts vendored
and rendered into prompts) and integrated by the coordinator into the single step chain over `StepContext`.
Checkpoints: `--through 5.4 | 6.7 | 7.3 | 8.7 | 9.3`.

## Deliver
- P5 (5.2–5.4): `KLI-STRATEGIA` (three section calls, CL/PL ids minted in code, no-auto-promotion on support levels,
  uniqueness never derived from a competitor's silence), `KLI-TOV` (two section calls, grounded before/after pairs,
  6–8 copy checks), Q-S validator + `strategy_qa` with the ≤2 repair loop; client views ≤1100 / ≤750 words.
- P6 (6.2–6.7): `KLI-PLAN` (12 topics over days 1–30, TOP ids, distinctness + pillar balance in code), Q-P validator +
  `plan_qa` loop, selection 6.5 (`--topic TOPxx` = client selection, else the recommendation as `simulated_selection`),
  `WEW-ZLECENIE-POSTU` assembled in code (evidence texts, rights copied from proof cards, ≤5-rule voice extract,
  adapter limits from `data/adapters.ts`, 7 completion lines) — zero model calls.
- P7 (7.2–7.3): `KLI-POST` by an isolated author (instruction + ToV only), code gates (fragments verbatim in the text,
  links only from the instruction, numbers only from evidence, prohibited claims, metrics), independent `post_editor`
  (Q-T) with the ≤2 repair loop and E.1 `qa_exhausted`; every editor pass is a new immutable version.
- P8 (8.1–8.7): `WEW-KONFIG-PUBLIKACJI`, `WEW-ZLECENIE-PUBLIKACJI` (content hash, idempotency key, separate approval
  and consent checks, nine preflight gates), `WEW-POTWIERDZENIE-PUBLIKACJI` with `outcome: not_executed` —
  documents and preflight only, **nothing is ever sent**; external ids / URLs stay null.
- P9 (9.1–9.3): `KLI-PAKIET` manifest over the current versions, 3–5 audit takeaways from the audit gaps and
  comparison implications, limitations, completion check, deterministic closure gate (`close_allowed` false while
  anything is simulated, unpublished or undelivered).
- Shared: `researchSteps` extended, `selectedTopicId` on the request, `lib/research/simulation.ts` (every consumer of an
  unapproved `KLI-*` input marks its output `simulation_flag: true` + `SIMULATED_INPUT`), `data/adapters.ts`.

## Done when
- Builders' unit tests (fixture runner, zero spend) + the existing 47, typecheck, eslint, `yarn generate` green.
- Fixture through the real CLI + database `--through 9.3`: strategy/ToV QA repair → plan QA → simulated selection →
  instruction → post → editor repair → publication documents blocked at preflight → package with `close_allowed: false`.
  Re-proven 2026-09-19 after PR #8: 34 versions, 0 PLN, ~2 s. The command needs `--fixture-search` (README fixed);
  without it the selector's canned URLs match no hit and 3.7 escalates.
- 7.2/7.3 carry the `deslop` skill (`.ai/skills/deslop`, `lib/agents/deslop.ts`, `lib/research/deslop.ts`):
  author writes under the ToV with deslop as the hygiene layer and reports in `qa.style_hygiene`; editor runs detect
  mode; the validator emits `slop_pattern` findings (minor/major). Unit-proven (309 tests) and fixture-proven; the new
  prompts have not run live yet (budget).
- Live run on Open Mercato 3.1 → 9.3: DONE 2026-09-19 06:50 (final pass 7.02 PLN; the night ≈ 114 PLN because of reruns
  before cache stability and QA loops before the reclassification rules — both fixed, see PR #7). Q-S ready after one
  repair, Q-P draft (10/12 ready), post editor-approved on the first pass, publication blocked at preflight,
  close_allowed false.

## Constraints
- No real client approvals exist in this lane: every `KLI-*` consumer runs in simulation and says so; a synthetic
  approval is never recorded as a decision; publication consent is always `missing`.
- P8 stops before 8.4 (reservation) — an adapter would plug into `lib/research/publication.ts`; `unknown` forbids retry.
- The `agency_tov` corpus voice profile is not consumed here (ADR-001: no cross-module imports); a later bridge could
  pass it as an optional enrichment input to `tov_writer`.

## Handoff
Merged into main with `e57170f8d`. Source links describe implemented/simulated producer scope,
not full-story acceptance; customer receipts, external send and actual delivery remain absent.
The teammate's live record above is not this integration session's paid-run authorization.
Next: integrate later producer changes; further paid live `--through 9.3` requires explicit approval and credit,
refine prompts with Marcin, then the T11 bridge and Krysia's portal (`getClientView` now covers brief, strategy, ToV,
plan, post, package).
