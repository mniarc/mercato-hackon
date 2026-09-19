# Readiness plan: from 253/489 criteria to all of them

Written 2026-09-19 by Marcin for Paweł, from the assessments at commit `529507fe`
(branch `feat/agency-research`, PR #9). Numbers come from
`.dev-docs/coverage/assessments`; re-derive them with
`node scripts/agency-spec-progress.mjs --refresh` rather than trusting this file.

State today: 253 criteria implemented, 145 partial, 90 missing, 1 unassessed.
Proof: focused 60, native/fixture 95, live-model 58 (was 0 before the research
journals were exported, see `live-run-evidence.html`).

The 236 open criteria fall into eight clusters. Two of them (publication,
delivery) are `partial` mostly because a business decision is missing, and the
business is us. The largest engineering item is one mechanism (the client change
loop) that appears as partial ACs in nine features.

## Clusters, tasks, yield

| # | Cluster | Open ACs | Task(s) | Owner | Effort |
|---|---------|---------:|---------|-------|-------:|
| 0 | The eight decisions (publication provider, delivery channel, closure, price, topics, return step, consent policy, pinned versions) | gates ~90 | **RES-04** (new) | Marcin + Rafał | 2 h |
| 1 | Pinned configuration: read STD-PROCES / STD-LIMITY / WZR / offer versions from the order | 8 | T24 (ops side), **RES-05** (research side) | Paweł, Marcin | 0.5 d |
| 2 | Evidence supplement 4.5 and QA evidence return to process 3 | 15 | T26, T86, **RES-05** | Marcin, Paweł wires the return | 1 d |
| 3 | Client change loop: G.3 scope vs purchased offer -> G.4 impact plan -> owned revision with preservation -> fresh QA -> re-review; unlimited in-package rounds; explicit refusal of extra outputs | ~75 | T30 (unblocked by RES-04), T27/T58 patterns, **RES-05** entry points | Paweł (coordinator), Marcin (revision entry points) | 3-4 d |
| 4 | Publication: exact consent, attempt reservation, Discord send, unknown-outcome reconciliation, receipt, holds | ~62 | T31 (unblocked), T83, T84, T66 | Paweł + Marcin | 3 d |
| 5 | Delivery and closure: share package (portal + mail), retries, close mutation, aftercare | ~28 | T32 (unblocked) | Paweł + Marcin | 1.5 d |
| 6 | Exceptions: executable employee resolutions, once-only scoped recovery, deadlines as obligations, paused-case rebuild action | ~13 | T60, T47/T53 | Paweł | 1.5 d |
| 7 | Sales and payment: pre-purchase Q&A agent via G, payment-mismatch exception, confirmation delivery with retry | ~19 | T89, T92, T30 (prepurchase intake) | Paweł / Krysia | 1 d |
| 8 | Demo evidence and live proof: one golden portal-driven run, both audience variants, timings, fallback recording | ~21 + all `liveModel` | **RES-06** (new), T93/T95/T96 | all | 1 d + ~60 PLN |
| - | Ops visibility (F52, F06-1 ownership), ToV specialist through the orchestrator (T97/T98), non-Enterprise path (F54-1 AC4, propose to drop) | ~10 | T97, T98, T100/T101 | mixed | 0.5 d |

Total ~13-15 person-days of build; with three people in parallel about four to
five working days. The order below is by yield per day.

## Sequence

1. **RES-04 today.** Nothing else moves the publication/delivery half of the
   report. Recommended defaults are in the task; change them, but record them.
2. **RES-05 + T24** (parallel, Marcin / Paweł): pinned limits and the three
   research entry points (`reviseDocument`, `supplementEvidence`, pinned
   config). Small, unlocks clusters 2 and 3 and ~20 ACs on their own.
3. **T31 publication** (Paweł + Marcin): T83's Discord destination is already
   implemented and tested; what remains is consent record, reservation ledger,
   the send, reconciliation and the receipt. Biggest single-cluster yield.
4. **T30 change loop** (Paweł coordinator, Marcin research side): one saved
   impact plan, then route to the owning step through `reviseDocument`. Start
   with the brief (T58 already proves invited answers) and the post; strategy
   and plan follow the same path.
5. **T32 delivery/closure**, then **T60 exceptions**.
6. **RES-06 golden run**: run it once everything above lands, journal it, mark
   proof, record the fallback. Rehearse both audience variants from it.
7. **T89/T92 sales** last; rarely in the demo path.

## What I am asking from you

- Merge PR #9 (research lane: people step, stale-socials rule, brief client
  view, per-order cache, `journal` command, ToV encryption map, live proof).
- Confirm or amend the RES-04 defaults with Rafał; I will write the ADR and the
  STD amendments if you prefer.
- Give a paused (client-review) case a sanctioned "rebuild document" action;
  `resume-analysis --from` answers 409 on your `restart.ts` and we needed it
  five times today.
- Route T30's directives to the RES-05 entry points once they exist; I will keep
  the public service contract additive (`BACKWARD_COMPATIBILITY.md`).

## What I am not claiming

- No criterion was marked implemented in this exercise; only `liveModel` proof
  was added, and only where a live agent produced the behaviour and its gate
  validated it.
- 100% live-model proof needs the golden run (RES-06); it cannot be journaled
  from the runs we have, because no client decision was ever taken live.
- F54-1 AC4 (a non-Enterprise execution path) is the one criterion I would
  propose to drop rather than build: the whole lane is built on the Enterprise
  agent orchestrator by design.
