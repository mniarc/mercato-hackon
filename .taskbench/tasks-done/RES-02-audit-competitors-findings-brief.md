# RES-02 — F07–F09: audit, competitors, findings map + QA + escalation + freeze, brief + brief QA

State: done (merged; live through 4.2 recorded on order demo-open-mercato-3 — see Done when)
Sources: F07, F08, F09
Depends on: RES-01
Owns: `ai-company/apps/mercato/src/modules/agency_research/**`
Context: The remaining three research boxes, built in parallel on disjoint paths from the shared per-phase
layout (agents / ids / steps / renders per phase, vendored WZR contracts rendered into the prompts) and
integrated by the coordinator into one step chain over a `StepContext`.

## Deliver
- F07 (PR #3): `WEW-AUDYT` (3.3), `WEW-KONKURENCJA` v1/v2 + `WEW-ZRODLA` v2 (3.4–3.5), Firecrawl search
  discovery in code, client views (≤450 / ≤350 words).
- F08 (PR #4): `WEW-USTALENIA` (3.6), analysis QA with validator + agent and the ≤2 repair loop (3.7),
  `WEW-ESKALACJA` on exhaustion / exception / budget (E.1), idempotent freeze (3.8), `escalations` command.
- F09 (PR #5): `KLI-BRIEF` in three section calls (4.1), brief QA loop (4.2), staff API routes, portal brief
  route + `getClientView` on the service, `agency_research.portal.brief.view` feature.

## Done when
- 47 unit tests (fixture runner, zero spend), typecheck, eslint green. DONE 2026-09-19.
- Fixture through the real CLI + database `--through 4.2`: 3.7 to_fix → repair → ready → 3.8 frozen → 4.1 →
  4.2 (needs_agent_fix after 2 repairs on an unchanged fixture brief); E.1 record opened and printed when the
  repair cannot change the documents. DONE 2026-09-19.
- Live run on Open Mercato `--through 4.2`: DONE 2026-09-19 as part of the RES-03 chain, order `demo-open-mercato-3`
  (`yarn mercato agency_research status --order-ref demo-open-mercato-3`): 3.7 ready after repairs, 3.8 frozen, 4.1 #1 done,
  4.2 #1 done — KLI-BRIEF v8 `ready_for_review`, verdict needs_client_data (the 8 questions), 4 agent runs on the final
  pass. The first attempts failed on the OpenRouter credit wall (~65k output-token reservation per Sonnet call); the
  order ledger totals 162.40 PLN across all reruns. Reconciled 2026-09-19 from the stored task runs, no new run.

## Constraints
- Reduce-call inputs carry no timestamps (cache keys must survive reruns).
- 4.2 has no E.1 path (returns to 4.1 or asks the client); 3.7 does.
- Portal ownership check is a stub until the portal persists orders (`assertCustomerOwnsOrder`).

## Handoff
Next: RES-03 — live runs with numbers in the PRs, conflict-finder calibration ("repeated ≠ conflict" is already
in the prompt), the T11 bridge from `agency_operations` (`agencyResearchService.run` from the case workflow),
Krysia's portal wiring to `/api/agency_research/portal/brief`.
