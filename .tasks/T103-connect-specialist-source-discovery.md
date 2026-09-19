# T103 - Connect specialist source discovery to agency intake

State: active
Priority: P0-immediate
Depends on: T97 existing case-bound intake
Owns: `agency_operations/lib/tovDiscovery/**`, `api/tov-discovery/**`; request shared intake/DI changes from coordinator.
Sources: F22-1, F23-1, F51-1; user instruction to integrate teammate agents. Technical contract: `agency_tov.source_scout` and existing discovery CLI/service.

## Deliver

- Read the actual story and existing scout contract; reuse the teammate implementation, not a new discovery agent.
- Add an authorized, tenant/case-scoped app entry and actionable discovery result that feeds existing specialist intake where the native contract supports it.
- Preserve explicit source selection and existing supplied-corpus path; discovery does not imply client approval or permission to spend.

## Done when

The app can reach the real scout through a bounded native execution path and use
its saved result in intake, with focused scope/handoff checks. Report exact
missing business decisions rather than inventing selection or spend policy.
No paid calls; source-ready is not live proof.
