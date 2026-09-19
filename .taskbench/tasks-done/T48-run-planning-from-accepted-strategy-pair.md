# T48 - Run planning from the accepted strategy pair

State: done
Delivery: e5d3de962; focused planning/native/employee checks and app typecheck passed. Paid/runtime phase proof remains separate and disabled.
Depends on: T47 exact pair acceptance and planning readiness
Sources: F26-1, F26-2, F27-1
Owns: `agency_research/lib/planningExecution/**`; parallel owner changes `research/steps/{context,plan,planQa}.ts` and adjacent seam tests; coordinator owns public service and native workflow/policy wiring

## Deliver

- Continue 6.1 → existing teammate plan writer 6.2 → QA 6.3 from the exact current accepted brief/strategy/ToV and their pinned research dependencies. Do not restart research or strategy.
- Use the persisted configured product's explicit topic count, one channel and 30-day horizon; never assume the legacy count of 12. Require separately configured planning spend permission/cap.
- Keep generated plan versions bound through QA repairs. Persist exact QA input/output references and replay the same accepted-pair execution without duplicate model calls.
- Stop after plan QA. No simulated topic choice, customer approval, post instruction or production; those remain T28 follow-on work.

## Done when

The native accepted-pair handoff can call the public phase-only service and inspect the real plan/QA references, with explicit missing-input/configuration, budget and interrupted states. Focused checks cover exact pins, final repaired-plan QA binding and retry safety; no live paid proof or new worker framework.
