# RES-05 - Research lane: directed revision, evidence supplement and pinned limits

State: active (Marcin; research side of T24, T26, T30, T86)
Depends on: RES-04 (decisions 3, 6, 8); coordinator routes from T30 (G.4 directives) and T26/T86 (return contracts)
Owns: `agency_research/lib/revision/**` (new), `lib/research/steps/supplement.ts` (new), the `limits`/QA-criteria readers in `agency_research/data/templates.ts` and `lib/research/steps/*Qa.ts`; the public service contract additions in `lib/contracts/agencyResearch.ts`
Sources: F09-1 AC5, F09-2 AC1, F10-3 AC2, F11-1, F11-2, F07-3 AC3, F08-3 AC4, F31-1 AC2, F31-2; F21-2 AC1-3, F22-1 AC4, F26-2 AC4, F30-2 AC4; F20-1 AC4, F23-1 AC1, F26-1 AC2, F30-1 AC4

## Deliver

Every writer agent already takes `previous_*` and `repair_findings`, so the
research lane can revise. What is missing is the three entry points the
coordinator can call, each bounded, versioned and cache-first:

- `reviseDocument({ orderRef, templateId, directive, previousVersionId })` for
  4.1, 5.2, 5.3, 6.2 and 7.2: the directive is the saved G.4 disposition (its
  id, the client's words, the affected fields); the agent preserves everything
  outside the directive, names every dependency-driven change with its reason,
  and the new version records `revision_of` + `directive_ref`. The new version
  never inherits approval and goes through the step's own QA (4.2/5.4/6.3/7.3).
  No round counter, no charge.
- `supplementEvidence({ orderRef, question, target })` for 4.5 and the 7.3
  evidence return: `target` is a brief field or a post claim; the step re-runs
  only the needed 3.2-3.7 fragment for that question within STD-LIMITY, appends
  to WEW-ZRODLA / WEW-USTALENIA (new versions), passes 3.7, and returns the
  evidence to the requesting brief or QA task. Unresolved stays `missing`;
  a foundation contradiction is reported, never silently applied. No second
  brief, no second case.
- Pinned configuration: `limits` and the QA criteria lists are read from the
  STD-LIMITY / STD-PROCES versions pinned on the order (T24), with the module
  constants only as the explicit fallback for orders pinned before T24. Every
  task run records the version ids it used.

Also, on this lane: run the `agency_tov` specialist through the orchestrator
for a case (T97 intake) so `material-to-tov-profile` and the three ToV agents
show up as live in `.dev-docs/integrations`; retire the CLI `--through 5.4+`
path per T98.

## Done when

- Focused tests: a directive on one field leaves every other field byte-equal;
  a supplement answers one question without re-running unrelated steps; pinned
  limits change a run when the order's version changes.
- One live case: a client answer on the brief triggers `reviseDocument`, and a
  7.3 missing-claim finding triggers `supplementEvidence`, both journaled by
  `yarn mercato agency_research journal`.
